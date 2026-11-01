import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano, TupleReader } from '@ton/core';
import { findTransaction } from '@ton/test-utils';
import {
  askToClaimBody, Attach, eggMinterCode, eggWalletCode, minterStateInit, onchainMetadata, topUpBody,
  verifyEntitlement, walletStateInit,
} from '@egg/sdk';
import { buildApp } from '../src/app';
import { Chain } from '../src/chain';
import { loadConfig } from '../src/config';
import { Db } from '../src/db';
import { Publisher } from '../src/publisher';
import { signInitData, verifyInitData } from '../src/telegram';

const BOT_TOKEN = '123456:TEST-TOKEN-NOT-REAL';
const KEY = 'k'.repeat(32);
const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

/** The publisher's view of a chain, backed by the sandbox and the real Tolk contracts. */
class SandboxChain implements Chain {
  sent: Cell[] = [];
  dropNext = false;
  constructor(private chain: Blockchain, private minter: Address, private publisher: SandboxContract<TreasuryContract>) {}

  async lastEpoch() {
    return Number(new TupleReader((await this.chain.runGetMethod(this.minter, 'get_last_epoch')).stack).readBigNumber());
  }
  async commitment(epoch: number) {
    try {
      const r = await this.chain.runGetMethod(this.minter, 'get_root', [{ type: 'int', value: BigInt(epoch) }]);
      return Buffer.from(new TupleReader(r.stack).readBigNumber().toString(16).padStart(64, '0'), 'hex');
    } catch {
      return null; // unknown epoch
    }
  }
  async publish(body: Cell) {
    this.sent.push(body);
    if (this.dropNext) {
      this.dropNext = false; // simulates a lost transaction
      return;
    }
    await this.publisher.send({ to: this.minter, value: toNano('0.05'), body });
  }
}

async function setup() {
  const chain = await Blockchain.create();
  chain.now = T0;
  const [admin, publisherW, alice, bob, carol] = await Promise.all(['admin', 'publisher', 'alice', 'bob', 'carol'].map((n) => chain.treasury(n)));
  const { init, address: minter } = minterStateInit(
    { maxSupply: E(1_000_000), admin: admin.address, publisher: publisherW.address, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
    eggMinterCode,
  );
  await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: topUpBody() });

  const config = loadConfig({
    BOT_TOKEN,
    INGEST_API_KEY: KEY,
    JETTON_MASTER_ADDRESS: minter.toString(),
    MAX_SUPPLY_UNITS: E(1_000_000).toString(),
    MAX_EVENT_UNITS: E(10_000).toString(),
  } as unknown as NodeJS.ProcessEnv);
  const db = new Db(':memory:');
  const sbx = new SandboxChain(chain, minter, publisherW);
  const publisher = new Publisher(db, sbx, { maxSupply: config.MAX_SUPPLY_UNITS, now: () => T0 });
  const app = await buildApp({ config, db, publisher, now: () => T0 });
  return { chain, minter, alice, bob, carol, app, db, publisher, sbx };
}

const tma = (id: number) => ({ authorization: 'tma ' + signInitData({ id, first_name: 'T' }, BOT_TOKEN, T0 - 5) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type App = any;
const ingest = (app: App, body: object, key = KEY) =>
  app.inject({ method: 'POST', url: '/v1/ingest', headers: { authorization: `Bearer ${key}` }, payload: body });
const earn = (app: App, id: number, amount: bigint, n = 'a') =>
  ingest(app, { tg_id: id, amount: amount.toString(), kind: 'hatch', idempotency_key: `evt-${id}-${n}-xxxx` });
const link = (app: App, id: number, a: Address) =>
  app.inject({ method: 'POST', url: '/v1/link', headers: tma(id), payload: { address: a.toString() } });
const balanceAt = async (chain: Blockchain, wallet: Address) =>
  new TupleReader((await chain.runGetMethod(wallet, 'get_wallet_data')).stack).readBigNumber();

describe('telegram initData', () => {
  it('accepts a genuine payload and rejects tampering, wrong bot and stale data', () => {
    const good = signInitData({ id: 7 }, BOT_TOKEN, T0 - 10);
    expect(verifyInitData(good, BOT_TOKEN, { now: T0, maxAgeSeconds: 3600 })?.id).toBe(7);
    expect(verifyInitData(good.replace('%22id%22%3A7', '%22id%22%3A8'), BOT_TOKEN, { now: T0, maxAgeSeconds: 3600 })).toBeNull();
    expect(verifyInitData(good, 'other:token', { now: T0, maxAgeSeconds: 3600 })).toBeNull();
    expect(verifyInitData(good, BOT_TOKEN, { now: T0 + 7200, maxAgeSeconds: 3600 })).toBeNull();
  });
});

describe('ingest', () => {
  it('is authenticated, idempotent, capped per event and globally', async () => {
    const { app } = await setup();
    const ev = { tg_id: 42, amount: '1000000000', kind: 'hatch', idempotency_key: 'evt-0000001' };
    expect((await ingest(app, ev, 'wrong-key-wrong-key-wrong-key')).statusCode).toBe(401);
    expect((await ingest(app, { ...ev, amount: '0' })).statusCode).toBe(400);
    expect((await ingest(app, { ...ev, amount: '99999999999999999' })).statusCode).toBe(422);
    expect((await ingest(app, ev)).json()).toEqual({ applied: true, cumulative: '1000000000' });
    expect((await ingest(app, ev)).json()).toEqual({ applied: false, cumulative: '1000000000' });

    // global cap: 1 000 000 EGG; the first event already used 1 of them
    for (let i = 0; i < 999; i++) await ingest(app, { ...ev, amount: E(1000).toString(), idempotency_key: `fill-${i}-xxxxxxxx` });
    const over = await ingest(app, { ...ev, amount: E(1000).toString(), idempotency_key: 'fill-last-xxxxxxx' });
    expect(over.statusCode).toBe(409);
    expect(over.json().error).toBe('max-supply-reached');

    await app.inject({ method: 'POST', url: '/v1/ban', headers: { authorization: `Bearer ${KEY}` }, payload: { tg_id: 42, banned: true } });
    expect((await ingest(app, { ...ev, idempotency_key: 'evt-0000005' })).statusCode).toBe(403);
  });
});

describe('earn → publish → prove → claim on-chain', () => {
  it('the whole path works with the real contracts, and the proof is checked against the chain, not the server', async () => {
    const { chain, minter, alice, bob, app, publisher, sbx } = await setup();

    await earn(app, 1, E(2500));
    await earn(app, 2, E(40));
    expect((await link(app, 1, alice.address)).statusCode).toBe(200);
    expect((await link(app, 2, bob.address)).statusCode).toBe(200);

    // before anything is published there is nothing to prove
    expect((await app.inject({ method: 'GET', url: `/v1/entitlement/${alice.address.toString()}` })).statusCode).toBe(404);

    expect((await publisher.tick()).action).toBe('created'); // sent to the (sandbox) chain
    expect(sbx.sent).toHaveLength(1);
    expect((await publisher.tick()).action).toBe('confirmed'); // the contract has the commitment
    expect((await publisher.tick()).action).toBe('idle'); // nothing changed, nothing to publish

    // an entitlement through the public API, verified against the contract's own commitment
    const res = await app.inject({ method: 'GET', url: `/v1/entitlement/${encodeURIComponent(alice.address.toRawString())}` });
    expect(res.statusCode).toBe(200);
    const ent = res.json();
    expect(ent.cumulative).toBe(E(2500).toString());
    const onChain = await sbx.commitment(ent.epoch);
    expect(verifyEntitlement(ent, onChain!)).toBe(true);
    expect(verifyEntitlement({ ...ent, cumulative: E(2501).toString() }, onChain!)).toBe(false);

    // the user claims with exactly what the API returned
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const claimTx = await alice.send({
      to: wallet,
      value: Attach.claim,
      init,
      body: askToClaimBody({ epoch: ent.epoch, cumulative: BigInt(ent.cumulative), proof: Cell.fromBase64(ent.proof) }),
    });
    expect(findTransaction(claimTx.transactions, { from: minter, to: wallet, success: true })).toBeDefined();
    expect(await balanceAt(chain, wallet)).toBe(E(2500));

    // the dump of the epoch lets anyone rebuild every proof without this server
    const dump = (await app.inject({ method: 'GET', url: '/v1/epochs/latest' })).json();
    expect(dump.leaves).toHaveLength(2);
    expect(dump.commitment).toBe(ent.commitment);
  });

  it('a later epoch pays only the difference, and the wallet address freezes once published', async () => {
    const { chain, minter, alice, carol, app, publisher } = await setup();
    await earn(app, 1, E(100));
    await link(app, 1, alice.address);
    await publisher.tick();
    await publisher.tick();

    // after the first publication the address can't move: the same balance would be collectable twice
    const moved = await link(app, 1, carol.address);
    expect(moved.statusCode).toBe(409);
    expect(moved.json().error).toBe('address-locked');

    await earn(app, 1, E(30), 'b');
    expect((await publisher.tick()).action).toBe('created');
    await publisher.tick();
    const ent = (await app.inject({ method: 'GET', url: `/v1/entitlement/${alice.address.toString()}` })).json();
    expect(ent.epoch).toBe(2);
    expect(ent.cumulative).toBe(E(130).toString());

    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ epoch: 2, cumulative: E(130), proof: Cell.fromBase64(ent.proof) }) });
    expect(await balanceAt(chain, wallet)).toBe(E(130));
  });

  it('survives a lost transaction: the publisher re-sends, and never skips or doubles an epoch', async () => {
    const { app, alice, publisher, sbx, db } = await setup();
    await earn(app, 1, E(5));
    await link(app, 1, alice.address);

    sbx.dropNext = true;
    expect((await publisher.tick()).action).toBe('created'); // the transaction is "lost"
    expect(db.lastEpochRow()!.status).toBe('sent');
    expect((await publisher.tick()).action).toBe('idle'); // not stale yet: wait

    const later = new Publisher(db, sbx, { maxSupply: E(1_000_000), resendAfterSeconds: 0, now: () => T0 + 1000 });
    expect((await later.tick()).action).toBe('sent'); // re-sent, same epoch
    expect((await later.tick()).action).toBe('confirmed');
    expect(db.lastEpochRow()!.epoch).toBe(1);
  });

  it('a ban stops new rewards but never shrinks a root; a slash removes only what was not yet published', async () => {
    const { alice, bob, app, publisher, db } = await setup();
    await earn(app, 1, E(100));
    await earn(app, 2, E(100));
    await link(app, 1, alice.address);
    await link(app, 2, bob.address);
    await publisher.tick();
    await publisher.tick();

    // 50 more were earned but not yet published; then the player is caught cheating
    await earn(app, 1, E(50), 'b');
    const slash = await app.inject({ method: 'POST', url: '/v1/slash', headers: { authorization: `Bearer ${KEY}` }, payload: { tg_id: 1 } });
    expect(slash.json()).toEqual({ ok: true, cumulative: E(100).toString() });
    expect((await earn(app, 1, E(1), 'c')).statusCode).toBe(403); // banned: nothing more accrues

    await earn(app, 2, E(1), 'z');
    await publisher.tick();
    await publisher.tick();

    // totals only ever grow, and alice still holds exactly what was published
    const ent = (await app.inject({ method: 'GET', url: `/v1/entitlement/${alice.address.toString()}` })).json();
    expect(ent.epoch).toBe(2);
    expect(ent.cumulative).toBe(E(100).toString());
    expect(db.issuedTotal()).toBe(E(201));
  });
});
