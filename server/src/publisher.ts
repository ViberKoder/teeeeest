import { Address } from '@ton/core';
import { EggTree, publishRootBody } from '@egg/sdk';
import { Chain } from './chain';
import { Db, EpochRow } from './db';

/**
 * Turns the ledger into published roots.
 *
 *   pending   tree is stored, nothing sent yet
 *   sent      PublishRoot was sent; waiting to see the commitment in the contract
 *   confirmed the contract has it  -> proofs for this epoch are served
 *   conflict  the chain has a different root for this epoch number: stop and alert a human
 *
 * Every step is idempotent, so a crash at any point is repaired by simply running `tick()` again.
 */
export class Publisher {
  constructor(
    private readonly db: Db,
    private readonly chain: Chain,
    private readonly o: { maxSupply: bigint; resendAfterSeconds?: number; now?: () => number },
  ) {}

  private now = () => (this.o.now ? this.o.now() : Math.floor(Date.now() / 1000));

  treeOf(row: EpochRow): EggTree {
    return EggTree.fromJSON(JSON.parse(row.leaves));
  }

  async tick(): Promise<{ action: 'idle' | 'created' | 'sent' | 'confirmed' | 'conflict'; epoch?: number }> {
    let last = this.db.lastEpochRow();

    // 1. settle whatever is in flight
    if (last && (last.status === 'sent' || last.status === 'pending')) {
      const onChain = await this.chain.commitment(last.epoch);
      if (onChain) {
        if (onChain.toString('hex') === last.commitment) {
          this.db.setEpochStatus(last.epoch, 'confirmed');
          return { action: 'confirmed', epoch: last.epoch };
        }
        this.db.setEpochStatus(last.epoch, 'conflict');
        return { action: 'conflict', epoch: last.epoch };
      }
      const stale = last.status === 'pending' || this.now() - (last.sent_at ?? 0) > (this.o.resendAfterSeconds ?? 300);
      if (stale) {
        await this.send(last);
        return { action: 'sent', epoch: last.epoch };
      }
      return { action: 'idle', epoch: last.epoch };
    }
    if (last?.status === 'conflict') return { action: 'conflict', epoch: last.epoch };

    // 2. is there anything new to publish?
    const rows = this.db.leaves();
    const tree = new EggTree(rows.map((r) => ({ owner: Address.parseRaw(r.address), cumulative: BigInt(r.cumulative) })));
    if (tree.size === 0) return { action: 'idle' };
    if (last && tree.commitment.toString('hex') === last.commitment) return { action: 'idle', epoch: last.epoch };
    if (tree.total > this.o.maxSupply) throw new Error('ledger promises more than the maximum supply — refusing to publish');

    // the contract demands consecutive epochs: our numbering must continue the chain's
    const onChainLast = await this.chain.lastEpoch();
    const next = (last?.epoch ?? 0) + 1;
    if (onChainLast !== (last?.epoch ?? 0)) throw new Error(`chain is at epoch ${onChainLast}, local database at ${last?.epoch ?? 0}: refusing to guess`);

    this.db.createEpoch(
      {
        epoch: next,
        tree_root: tree.treeRoot.toString('hex'),
        total: tree.total.toString(),
        commitment: tree.commitment.toString('hex'),
        leaves: JSON.stringify(tree.toJSON(next)),
        created_at: this.now(),
      },
      rows.map((r) => r.tg_id),
    );
    last = this.db.epoch(next)!;
    await this.send(last);
    return { action: 'created', epoch: next };
  }

  private async send(row: EpochRow) {
    await this.chain.publish(publishRootBody({ epoch: row.epoch, treeRoot: Buffer.from(row.tree_root, 'hex'), total: BigInt(row.total) }));
    this.db.setEpochStatus(row.epoch, 'sent', this.now());
  }
}
