/**
 * Operator tool for the Serverless bot: reads the Hatch ledger from the cloud, publishes a Merkle root on-chain and
 * stores the players' proofs back, so the Mini App can show "ready to hatch" and claim.
 *
 *   TGCLOUD_TOKEN=app…:… MINTER=<address> PUBLISHER_MNEMONIC="…" NETWORK=testnet \
 *   npx tsx scripts/publish-from-cloud.ts
 *
 * Only players who linked a wallet WITH A VALID SIGNATURE of that wallet's key enter the tree.
 * The operator key is read from app/tgcloud/lib/opkey.js (git-ignored).
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Address, SendMode, toNano } from '@ton/core';
import { mnemonicToPrivateKey, signVerify } from '@ton/crypto';
import { internal, TonClient, WalletContractV5R1 } from '@ton/ton';
import { EggTree, linkMessage, publishRootBody, SUBWALLET_ID, tgWalletStateInit } from '@egg/sdk';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSON5 = require(resolve(__dirname, '../../node_modules/json5'));

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };
const testnet = (process.env.NETWORK ?? 'testnet') === 'testnet';
const appDir = resolve(__dirname, '../../app');
const opKey = /'([^']+)'/.exec(readFileSync(resolve(appDir, 'tgcloud/lib/opkey.js'), 'utf8'))![1];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cloud<T>(module: string, args: object): T {
  const r = spawnSync('npx', ['tgcloud', '--no-pager', 'run', module, JSON.stringify({ key: opKey, ...args })], { cwd: appDir, encoding: 'utf8', maxBuffer: 256 << 20 });
  const out = ((r.stderr ?? '') + (r.stdout ?? '')).replace(/\x1b\[[0-9;]*m/g, '');
  const i = out.lastIndexOf('\n< ');
  const at = i >= 0 ? i + 3 : out.startsWith('< ') ? 2 : -1;
  if (at < 0) throw new Error(`${module} failed:\n${out.slice(-600)}`);
  return JSON5.parse(out.slice(at).replace(/\s+\d+ms\s*$/, '')) as T;
}

async function main() {
  const client = new TonClient({
    endpoint: testnet ? 'https://testnet.toncenter.com/api/v2/jsonRPC' : 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TONCENTER_KEY,
  });
  const retry = async <T>(f: () => Promise<T>): Promise<T> => { for (let i = 0; ; i++) { try { await sleep(1300); return await f(); } catch (e) { if (i > 6) throw e; await sleep(3000); } } };
  const minter = Address.parse(need('MINTER'));
  const subwalletId = SUBWALLET_ID[testnet ? 'testnet' : 'mainnet'];

  const { users } = cloud<{ users: { tgId: number; address: string; publicKey: string; sig: string; hatches: number }[] }>('opExport', {});
  const leaves: { owner: Address; cumulative: bigint }[] = [];
  for (const u of users) {
    try {
      const pk = Buffer.from(u.publicKey, 'hex');
      const derived = tgWalletStateInit({ publicKey: pk, subwalletId }).address;
      const ok = derived.toRawString() === u.address && signVerify(Buffer.from(linkMessage(u.tgId, u.address)), Buffer.from(u.sig, 'hex'), pk);
      if (!ok) { console.warn(`skip ${u.tgId}: wallet link is not signed by the wallet`); continue; }
      if (u.hatches > 0) leaves.push({ owner: Address.parseRaw(u.address), cumulative: BigInt(u.hatches) * 1_000_000_000n });
    } catch { console.warn(`skip ${u.tgId}: malformed link`); }
  }
  if (leaves.length === 0) return console.log('nothing to publish: no linked player has hatched yet');
  const tree = new EggTree(leaves);

  const last = Number((await retry(() => client.runMethod(minter, 'get_last_epoch'))).stack.readBigNumber());
  if (last > 0) {
    const prev = (await retry(() => client.runMethod(minter, 'get_root', [{ type: 'int', value: BigInt(last) }]))).stack.readBigNumber().toString(16).padStart(64, '0');
    if (prev === tree.commitment.toString('hex')) return console.log(`epoch ${last} is already current — nothing new`);
  }
  const epoch = last + 1;
  console.log(`publishing epoch ${epoch}: ${leaves.length} player(s), total ${Number(tree.total) / 1e9} EGG`);

  const keys = await mnemonicToPrivateKey(need('PUBLISHER_MNEMONIC').trim().split(/\s+/));
  const wallet = client.open(WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: testnet ? -3 : -239 } }));
  const seqno = await retry(() => wallet.getSeqno());
  await retry(() => wallet.sendTransfer({
    seqno, secretKey: keys.secretKey, sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to: minter, value: toNano('0.05'), bounce: true, body: publishRootBody({ epoch, treeRoot: tree.treeRoot, total: tree.total }) })],
  }));
  for (let i = 0; ; i++) {
    await sleep(4000);
    const n = Number((await retry(() => client.runMethod(minter, 'get_last_epoch'))).stack.readBigNumber());
    if (n >= epoch) break;
    if (i > 40) throw new Error('the root did not appear on-chain (the contract may have refused it: growth limit, interval or total)');
  }
  const onChain = (await retry(() => client.runMethod(minter, 'get_root', [{ type: 'int', value: BigInt(epoch) }]))).stack.readBigNumber().toString(16).padStart(64, '0');
  if (onChain !== tree.commitment.toString('hex')) throw new Error('on-chain commitment differs from the local tree');
  console.log('confirmed on-chain');

  const rows = leaves.map((l) => ({ address: l.owner.toRawString(), cumulative: l.cumulative.toString(), proof: tree.proof(l.owner)!.toBoc().toString('base64') }));
  for (let i = 0; i < rows.length; i += 10) cloud('opStore', { epoch, commitment: tree.commitment.toString('hex'), rows: rows.slice(i, i + 10) });
  console.log(`stored ${rows.length} proof(s) in the cloud`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
