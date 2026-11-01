import '@ton/test-utils';
import { Blockchain } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EggMaster, EggWallet, offchainContent, signCert } from '@egg/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { Db } from '../src/db';
import { ClaimSigner } from '../src/signer';
import { signInitData, verifyInitData } from '../src/telegram';

const boc = (n: string) => Cell.fromBoc(readFileSync(join(__dirname, '../../contracts/build', `${n}.boc`)))[0];
const BOT_TOKEN = '123456:TEST-TOKEN-NOT-REAL';
const KEY = 'k'.repeat(32);
const NOW = 1_800_000_000;
const authority = keyPairFromSeed(Buffer.alloc(32, 1));
const hot = keyPairFromSeed(Buffer.alloc(32, 2));

async function setup() {
  const chain = await Blockchain.create();
  chain.now = NOW;
  const admin = await chain.treasury('admin');
  const user = await chain.treasury('user');
  const walletCode = boc('EggWallet');
  const master = chain.openContract(
    EggMaster.createFromConfig(
      {
        maxSupply: 0n,
        admin: admin.address,
        content: offchainContent('https://x.test/jetton.json'),
        walletCode,
        authority: BigInt('0x' + authority.publicKey.toString('hex')),
      },
      boc('EggMaster'),
    ),
  );
  await master.sendDeploy(admin.getSender());

  const cert = signCert(authority.secretKey, master.address, hot.publicKey, 1, NOW + 30 * 86_400);
  const config = loadConfig({
    BOT_TOKEN,
    INGEST_API_KEY: KEY,
    SIGNER_SEED_HEX: Buffer.alloc(32, 2).toString('hex'),
    AUTHORITY_PUBKEY_HEX: authority.publicKey.toString('hex'),
    KEY_CERT_B64: 'x'.repeat(12),
    JETTON_MASTER_ADDRESS: master.address.toString(),
    MAX_SUPPLY_UNITS: '5000000000000',
  } as any);
  const db = new Db(':memory:');
  const signer = new ClaimSigner(config.SIGNER_SEED_HEX, master.address, authority.publicKey, cert);
  const app = await buildApp({ config, db, signer, now: () => NOW });
  return { chain, user, master, walletCode, app, db, config };
}

const tmaHeader = (id: number) => ({
  authorization: 'tma ' + signInitData({ id, first_name: 'T' }, BOT_TOKEN, NOW - 5),
});
const ingest = (app: any, body: object, key = KEY) =>
  app.inject({ method: 'POST', url: '/v1/ingest', headers: { authorization: `Bearer ${key}` }, payload: body });

describe('telegram initData', () => {
  it('accepts a genuine payload and rejects tampering, wrong bot and stale data', () => {
    const good = signInitData({ id: 7 }, BOT_TOKEN, NOW - 10);
    expect(verifyInitData(good, BOT_TOKEN, { now: NOW, maxAgeSeconds: 3600 })?.id).toBe(7);
    expect(verifyInitData(good.replace('%22id%22%3A7', '%22id%22%3A8'), BOT_TOKEN, { now: NOW, maxAgeSeconds: 3600 })).toBeNull();
    expect(verifyInitData(good, 'other:token', { now: NOW, maxAgeSeconds: 3600 })).toBeNull();
    expect(verifyInitData(good, BOT_TOKEN, { now: NOW + 7200, maxAgeSeconds: 3600 })).toBeNull();
  });
});

describe('ingest', () => {
  it('is authenticated, idempotent, capped and respects bans', async () => {
    const { app } = await setup();
    const ev = { tg_id: 42, amount: '1000000000', kind: 'hatch', idempotency_key: 'evt-0000001' };

    expect((await ingest(app, ev, 'wrong-key-wrong-key-wrong-key')).statusCode).toBe(401);
    expect((await ingest(app, { ...ev, amount: '0' })).statusCode).toBe(400);
    expect((await ingest(app, { ...ev, amount: '99999999999999999' })).statusCode).toBe(422);

    const a = (await ingest(app, ev)).json();
    const b = (await ingest(app, ev)).json();
    expect(a).toEqual({ applied: true, cumulative: '1000000000' });
    expect(b).toEqual({ applied: false, cumulative: '1000000000' });

    // MAX_SUPPLY_UNITS is 5e12 in this fixture: 1e12 events fit until the cap is hit
    for (let i = 0; i < 4; i++) {
      const ok = await ingest(app, { ...ev, amount: '1000000000000', idempotency_key: `evt-fill-${i}-xx` });
      expect(ok.statusCode).toBe(200);
    }
    const capped = await ingest(app, { ...ev, amount: '1000000000000', idempotency_key: 'evt-fill-9-xx' });
    expect(capped.statusCode).toBe(409);
    expect(capped.json().error).toBe('max-supply-reached');

    await app.inject({ method: 'POST', url: '/v1/ban', headers: { authorization: `Bearer ${KEY}` }, payload: { tg_id: 42, banned: true } });
    expect((await ingest(app, { ...ev, idempotency_key: 'evt-0000005' })).statusCode).toBe(403);
  });
});

describe('claim → the contract accepts what the server signs', () => {
  it('links a wallet, signs a claim, and the on-chain wallet credits exactly the balance', async () => {
    const { chain, user, master, walletCode, app, config } = await setup();
    await ingest(app, { tg_id: 42, amount: '2500000000', kind: 'hatch', idempotency_key: 'evt-aaaaaaaa' });

    expect((await app.inject({ method: 'POST', url: '/v1/claim', headers: tmaHeader(42) })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/v1/claim' })).statusCode).toBe(401);

    const link = await app.inject({ method: 'POST', url: '/v1/link', headers: tmaHeader(42), payload: { address: user.address.toString() } });
    expect(link.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/v1/claim', headers: tmaHeader(42) });
    expect(res.statusCode).toBe(200);
    const { claim, cumulative } = res.json();
    expect(cumulative).toBe('2500000000');

    const wallet = chain.openContract(
      EggWallet.createFromConfig({
        owner: user.address,
        master: master.address,
        walletCode,
        authority: BigInt('0x' + authority.publicKey.toString('hex')),
      }),
    );
    const tx = await wallet.sendClaim(user.getSender(), Cell.fromBase64(claim));
    expect(tx.transactions).toHaveTransaction({ to: wallet.address, success: true });
    expect((await wallet.getWalletData()).balance).toBe(2_500_000_000n);
    expect((await master.getJettonData()).totalSupply).toBe(2_500_000_000n);

    // after the first claim the address is frozen: no way to collect the same balance twice
    const other = Address.parse('0:' + '11'.repeat(32)).toString();
    const relink = await app.inject({ method: 'POST', url: '/v1/link', headers: tmaHeader(42), payload: { address: other } });
    expect(relink.statusCode).toBe(409);
    expect(relink.json().error).toBe('address-locked');
    void config;
  });

  it('refuses to start with a certificate that does not belong to the key', () => {
    const wrong = signCert(authority.secretKey, Address.parse('0:' + '22'.repeat(32)), hot.publicKey, 1, NOW + 1000);
    expect(
      () => new ClaimSigner(Buffer.alloc(32, 2).toString('hex'), Address.parse('0:' + '33'.repeat(32)), authority.publicKey, wrong),
    ).toThrow(/does not verify/);
  });
});
void toNano;
