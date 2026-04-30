import { FastifyInstance } from 'fastify';
import { Address } from '@ton/core';
import {
  buildRollingClaimPayload,
  payloadToBase64,
} from '@rmj/contracts';
import { AirdropState } from '../state';
import { GameServer } from '../gameServer';
import { VoucherSigner } from '../signer';
import { logger } from '../logger';

export interface ProofApiDeps {
  state: AirdropState;
  gameServer: GameServer;
  signer: VoucherSigner;
}

/**
 * Public Proof API. Endpoint matches the TEP-177 `custom_payload_api_uri`
 * convention, so Tonkeeper / MyTonWallet will consume it automatically.
 *
 * GET /api/v1/custom-payload/:address
 *
 *   Response:
 *   {
 *     "custom_payload": "<base64 BoC of rolling_claim cell>",
 *     "state_init": null,
 *     "compressed_info": {
 *       "amount": "<delta: unclaimed cumulative as string>",
 *       "start_from": 0,
 *       "expired_at": 9999999999
 *     }
 *   }
 *
 * The `compressed_info.amount` is the DELTA between the tree's cumulative
 * and the on-chain `already_claimed` — this is the number the wallet UI
 * displays as "unclaimed". For now we show the full cumulative (since
 * querying on-chain `already_claimed` requires a lite-client roundtrip);
 * the on-chain contract rejects stale-amount claims anyway, so this only
 * affects the wallet display.
 */
export function registerProofApi(app: FastifyInstance, deps: ProofApiDeps): void {
  app.get<{
    Params: { address: string };
  }>('/api/v1/custom-payload/:address', async (req, reply) => {
    let addr: Address;
    try {
      addr = Address.parse(req.params.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }

    if (!deps.state.tree.has(addr)) {
      reply.code(404);
      return { error: 'address-not-in-tree' };
    }

    const leaf = deps.state.tree.get(addr)!;

    const voucher = deps.signer.signRoot(deps.state.epoch, deps.state.rootBigint());
    const proof = deps.state.tree.generateProof(addr);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    return {
      custom_payload: payloadToBase64(customPayload),
      state_init: null, // wallet state_init handled by consuming wallet apps / SDK
      compressed_info: {
        amount: leaf.cumulativeAmount.toString(),
        start_from: leaf.startFrom,
        expired_at: leaf.expiredAt,
      },
      epoch: deps.state.epoch,
      root: deps.state.rootHex(),
    };
  });

  /**
   * Lightweight "what do we know about this address" endpoint, used by TMAs
   * and bots to display a growing balance in their own UI.
   */
  app.get<{ Params: { address: string } }>('/api/v1/balance/:address', async (req, reply) => {
    let addr: Address;
    try {
      addr = Address.parse(req.params.address);
    } catch {
      reply.code(400);
      return { error: 'invalid-address' };
    }
    const cumulative = await deps.gameServer.getCumulative(addr);
    const leaf = deps.state.tree.get(addr);
    return {
      address: addr.toString({ urlSafe: true, bounceable: false }),
      cumulative_offchain: cumulative.toString(),
      cumulative_in_tree: leaf?.cumulativeAmount.toString() ?? '0',
      epoch: deps.state.epoch,
    };
  });

  /**
   * Health + state introspection for dashboards / monitoring.
   */
  app.get('/api/v1/status', async () => ({
    epoch: deps.state.epoch,
    root: deps.state.rootHex(),
    tree_size: deps.state.tree.size,
    signer: deps.signer.publicKeyHex,
  }));

  logger.info('proof api routes registered');
}
