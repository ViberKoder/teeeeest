import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, StateInit, toNano, TupleReader } from '@ton/core';
import { findTransaction } from '@ton/test-utils';
import { keyPairFromSeed } from '@ton/crypto';
import {
  askToClaimBody, Attach, eggMinterCode, eggWalletCode, minterStateInit, onchainMetadata, sendOne, signLink, SUBWALLET_ID, tgWalletStateInit,
  topUpBody, verifyEntitlement, walletStateInit,
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
  constructor(
    private chain: Blockchain,
    private minter: Address,
    private publisher: SandboxContract<TreasuryContract>,
    private relayer: SandboxContract<TreasuryContract>,
  ) {}

  relayed: { to: Address; value: bigint; withInit: boolean }[] = [];
  async isDeployed(a: Address) {
    return (await this.chain.getContract(a)).accountState?.type === 'active';
  }
  async balance(a: Address) {
    return (await this.chain.getContract(a)).balance;
  }
  async relay(to: Address, body: Cell, value: bigint, init?: StateInit) {
    this.relayed.push({ to, value, withInit: Boolean(init) });
    await this.relayer.send({ to, value, body, init, bounce: false });
  }

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
  const [admin, publisherW, alice, bob, carol, relayerW] = await Promise.all(['admin', 'publisher', 'alice', 'bob', 'carol', 'relayer'].map((n) => chain.treasury(n)));
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
    REQUIRE_LINK_PROOF: 'false',
  } as unknown as NodeJS.ProcessEnv);
  const db = new Db(':memory:');
  const sbx = new SandboxChain(chain, minter, publisherW, relayerW);
  const publisher = new Publisher(db, sbx, { maxSupply: config.MAX_SUPPLY_UNITS, now: () => T0 });
  const app = await buildApp({ config, db, publisher, chain: sbx, now: () => T0 });
  return { chain, minter, alice, bob, carol, app, db, publisher, sbx, config };
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

describe('gasless first hatch (sponsored relay)', () => {
  const player = keyPairFromSeed(Buffer.alloc(32, 5));
  const subwalletId = SUBWALLET_ID.testnet;
  const { init: walletInit, address: tgWallet } = tgWalletStateInit({ publicKey: player.publicKey, subwalletId });

  async function ready() {
    const env = await setup();
    await earn(env.app, 7, E(2500));
    await link(env.app, 7, tgWallet);
    await env.publisher.tick();
    await env.publisher.tick();
    const ent = (await env.app.inject({ method: 'GET', url: `/v1/entitlement/${tgWallet.toString()}` })).json();
    const egg = walletStateInit(tgWallet, env.minter, eggWalletCode);
    const request = (o: { to?: Address; channel?: 'internal' | 'external'; validUntil?: number; body?: Cell; value?: bigint } = {}) =>
      sendOne({
        channel: o.channel ?? 'internal',
        secretKey: player.secretKey,
        header: { subwalletId, validUntil: o.validUntil ?? T0 + 600, seqno: 0 },
        message: {
          to: o.to ?? egg.address,
          value: o.value ?? Attach.claim,
          bounce: true,
          init: egg.init,
          body: o.body ?? askToClaimBody({ epoch: ent.epoch, cumulative: BigInt(ent.cumulative), proof: Cell.fromBase64(ent.proof) }),
        },
      });
    const relay = (body: Cell, publicKey = player.publicKey, headers = tma(7)) =>
      env.app.inject({ method: 'POST', url: '/v1/relay', headers, payload: { request: body.toBoc().toString('base64'), public_key: publicKey.toString('hex') } });
    return { ...env, ent, egg, request, relay };
  }

  it('a player with no TON hatches their first EGG: the server pays, the contract verifies, the player ends up with change', async () => {
    const { chain, app, request, relay, egg, sbx } = await ready();
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: tma(7) })).json().sponsored_left).toBe(3);

    const res = await relay(request());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, remaining: 2 });
    expect(sbx.relayed).toHaveLength(1);
    expect(sbx.relayed[0].withInit).toBe(true); // first request also deploys the player's wallet

    expect(await balanceAt(chain, egg.address)).toBe(E(2500));
    expect((await chain.getContract(tgWallet)).balance).toBeGreaterThan(toNano('0.05')); // excess came back to the player
  });

  it('relays only the player\'s own claim, and only a few times', async () => {
    const { request, relay, app, db } = await ready();
    const other = new Address(0, Buffer.alloc(32, 3));
    const plainBody = beginCellOp(0x0f8a7ea5);

    expect((await relay(request({ to: other }))).json().error).toBe('not-a-claim'); // someone else's contract
    expect((await relay(request({ body: plainBody }))).json().error).toBe('not-a-claim'); // not a claim
    expect((await relay(request({ value: toNano('5') }))).json().error).toBe('too-much-value');
    expect((await relay(request({ channel: 'external' }))).json().error).toBe('not-a-send-request');
    expect((await relay(request({ validUntil: T0 - 5 }))).json().error).toBe('expired');
    expect((await relay(request(), keyPairFromSeed(Buffer.alloc(32, 6)).publicKey)).json().error).toBe('wrong-wallet'); // not the linked wallet
    expect((await relay(request(), player.publicKey, tma(8))).json().error).toBe('wallet-not-linked'); // another Telegram account
    expect((await relay(request(), player.publicKey, {} as never)).statusCode).toBe(401);
    expect(db.relaysUsed(7)).toBe(0); // refusals cost nothing

    // the allowance is per Telegram account: once it is spent, nothing more is relayed
    for (let i = 0; i < 3; i++) expect(db.takeRelaySlot(7, 3, T0)).toBe(true);
    expect((await relay(request())).json().error).toBe('sponsorship-used-up');
    expect((await app.inject({ method: 'GET', url: '/v1/me', headers: tma(7) })).json().sponsored_left).toBe(0);
  });

  it('does not sponsor someone who can already pay', async () => {
    const { request, relay, chain } = await ready();
    const rich = await chain.treasury('rich');
    await rich.send({ to: tgWallet, value: toNano('1'), bounce: false });
    expect((await relay(request())).json().error).toBe('pay-yourself');
  });
});

function beginCellOp(op: number): Cell {
  return new (require('@ton/core').Builder)().storeUint(op, 32).storeUint(0, 64).endCell();
}

describe('linking a wallet to a Telegram account', () => {
  const key = keyPairFromSeed(Buffer.alloc(32, 9));
  const other = keyPairFromSeed(Buffer.alloc(32, 10));
  const rawOf = (pk: Buffer) => tgWalletStateInit({ publicKey: pk, subwalletId: SUBWALLET_ID.testnet }).address.toRawString();

  async function strictApp() {
    const env = await setup();
    const config = { ...env.config, REQUIRE_LINK_PROOF: true };
    const app = await buildApp({ config, db: env.db, publisher: env.publisher, chain: env.sbx, now: () => T0 });
    const post = (id: number, payload: object) => app.inject({ method: 'POST', url: '/v1/link', headers: tma(id), payload });
    return { post };
  }

  it('needs the wallet’s own signature: an address alone, or someone else’s signature, is refused', async () => {
    const { post } = await strictApp();
    const raw = rawOf(key.publicKey);
    expect((await post(1, { address: raw })).statusCode).toBe(400);
    const wrongSigner = signLink(1, raw, other.secretKey).toString('hex');
    expect((await post(1, { address: raw, public_key: key.publicKey.toString('hex'), signature: wrongSigner })).statusCode).toBe(403);
    // a signature made for another Telegram account does not transfer
    const forOther = signLink(2, raw, key.secretKey).toString('hex');
    expect((await post(1, { address: raw, public_key: key.publicKey.toString('hex'), signature: forOther })).statusCode).toBe(403);
    const good = signLink(1, raw, key.secretKey).toString('hex');
    expect((await post(1, { address: raw, public_key: key.publicKey.toString('hex'), signature: good })).statusCode).toBe(200);
  });
});

describe('growth budget', () => {
  it('asks the bot to retry later instead of letting the ledger outrun what the contract would accept', async () => {
    const env = await setup();
    const app = await buildApp({ config: { ...env.config, MAX_GROWTH_UNITS: E(100) }, db: env.db, publisher: env.publisher, chain: env.sbx, now: () => T0 });
    expect((await earn(app, 1, E(60))).statusCode).toBe(200);
    expect((await earn(app, 2, E(60), 'b')).statusCode).toBe(429);
  });
});
