import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, external, storeMessage, toNano, TupleReader } from '@ton/core';
import { keyPairFromSeed, KeyPair } from '@ton/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  askToClaimBody, Attach, changeKey, EggTree, eggMinterCode, eggWalletCode, minterStateInit, onchainMetadata,
  recoverOldSeed, sendOne, signRoot, signedRootCell, SUBWALLET_ID, tgWalletStateInit, topUpBody, walletStateInit,
} from '../src';

const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

describe('Telegram wallet contract (WalletTg) driven by the SDK', () => {
  let chain: Blockchain;
  let relayer: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let keys: KeyPair;
  let wallet: Address;
  let init: ReturnType<typeof tgWalletStateInit>['init'];
  const subwalletId = SUBWALLET_ID.testnet;

  const get = async (a: Address, m: string) => new TupleReader((await chain.runGetMethod(a, m)).stack);
  const seqno = async () => Number((await get(wallet, 'seqno')).readBigNumber());
  const header = (s: number, ttl = 600) => ({ subwalletId, validUntil: T0 + ttl, seqno: s });
  const sendExternal = (body: Cell, withInit = false) =>
    chain.sendMessage(external({ to: wallet, body, init: withInit ? init : undefined }));

  /** Gasless: anyone may deliver an internal-channel request; here the relayer pays and funds the wallet. */
  const relay = (body: Cell, value = toNano('0.5'), withInit = false) =>
    relayer.send({ to: wallet, value, body, init: withInit ? init : undefined, bounce: false });

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    relayer = await chain.treasury('relayer');
    bob = await chain.treasury('bob');
    keys = keyPairFromSeed(Buffer.alloc(32, 7));
    ({ init, address: wallet } = tgWalletStateInit({ publicKey: keys.publicKey, subwalletId }));
  });

  it('is deployed by the first relayed (gasless) request, which also does its job', async () => {
    const body = sendOne({
      channel: 'internal', secretKey: keys.secretKey, header: header(0),
      message: { to: bob.address, value: toNano('0.1'), bounce: false },
    });
    const before = await bob.getBalance();
    await relay(body, toNano('0.5'), true);
    expect(await seqno()).toBe(1);
    expect(await bob.getBalance() - before).toBeGreaterThanOrEqual(toNano('0.0999'));
    expect(Buffer.from((await get(wallet, 'get_public_key')).readBigNumber().toString(16).padStart(64, '0'), 'hex').equals(keys.publicKey)).toBe(true);
  });

  it('then pays its own way with external requests', async () => {
    await relay(sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(0), message: { to: bob.address, value: toNano('0.05'), bounce: false } }), toNano('0.5'), true);

    const before = await bob.getBalance();
    await sendExternal(sendOne({ channel: 'external', secretKey: keys.secretKey, header: header(1), message: { to: bob.address, value: toNano('0.07'), bounce: false } }));
    expect(await seqno()).toBe(2);
    expect(await bob.getBalance() - before).toBeGreaterThanOrEqual(toNano('0.0699'));
  });

  it('refuses replays, other keys, expired and other-subwallet requests', async () => {
    await relay(sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(0), message: { to: bob.address, value: toNano('0.05'), bounce: false } }), toNano('0.5'), true);
    const m = { to: bob.address, value: toNano('0.01'), bounce: false };

    const ok = sendOne({ channel: 'external', secretKey: keys.secretKey, header: header(1), message: m });
    const first = await sendExternal(ok);
    expect(first.transactions.some((t) => t.description.type === 'generic' && t.description.computePhase.type === 'vm' && t.description.computePhase.exitCode === 0)).toBe(true);
    await expect(sendExternal(ok)).rejects.toThrow(); // same seqno again

    const stranger = keyPairFromSeed(Buffer.alloc(32, 9));
    await expect(sendExternal(sendOne({ channel: 'external', secretKey: stranger.secretKey, header: header(2), message: m }))).rejects.toThrow();
    await expect(sendExternal(sendOne({ channel: 'external', secretKey: keys.secretKey, header: { ...header(2), validUntil: T0 - 1 }, message: m }))).rejects.toThrow();
    await expect(sendExternal(sendOne({ channel: 'external', secretKey: keys.secretKey, header: { ...header(2), subwalletId: 1 }, message: m }))).rejects.toThrow();
    expect(await seqno()).toBe(2);
  });

  it('a request signed for the gasless channel is not accepted as a self-paid one (and vice versa)', async () => {
    await relay(sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(0), message: { to: bob.address, value: toNano('0.05'), bounce: false } }), toNano('0.5'), true);
    const m = { to: bob.address, value: toNano('0.01'), bounce: false };
    const forRelay = sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(1), message: m });
    await expect(sendExternal(forRelay)).rejects.toThrow();
    expect(await seqno()).toBe(1);
  });

  it('rotates the key: same address, old key retired, new key works', async () => {
    await relay(sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(0), message: { to: bob.address, value: toNano('0.05'), bounce: false } }), toNano('0.5'), true);

    const next = keyPairFromSeed(Buffer.alloc(32, 11));
    await sendExternal(changeKey({ channel: 'external', secretKey: keys.secretKey, header: header(1), wallet, newSecretKey: next.secretKey, newPublicKey: next.publicKey }));
    expect(await seqno()).toBe(2);
    expect(Buffer.from((await get(wallet, 'get_public_key')).readBigNumber().toString(16).padStart(64, '0'), 'hex').equals(next.publicKey)).toBe(true);

    const m = { to: bob.address, value: toNano('0.01'), bounce: false };
    await expect(sendExternal(sendOne({ channel: 'external', secretKey: keys.secretKey, header: header(2), message: m }))).rejects.toThrow(); // old key
    await sendExternal(sendOne({ channel: 'external', secretKey: next.secretKey, header: header(2), message: m }));
    expect(await seqno()).toBe(3);
  });

  it('refuses a new key whose owner has not proven they hold it', async () => {
    await relay(sendOne({ channel: 'internal', secretKey: keys.secretKey, header: header(0), message: { to: bob.address, value: toNano('0.05'), bounce: false } }), toNano('0.5'), true);
    const holder = keyPairFromSeed(Buffer.alloc(32, 12));
    const other = keyPairFromSeed(Buffer.alloc(32, 13));
    // the proof is made with `holder`'s key but announces `other`'s public key
    await expect(sendExternal(changeKey({ channel: 'external', secretKey: keys.secretKey, header: header(1), wallet, newSecretKey: holder.secretKey, newPublicKey: other.publicKey }))).rejects.toThrow();
    expect(await seqno()).toBe(1);
  });

  it('the old seed can be recovered by the holder of the new one', () => {
    const next = keyPairFromSeed(Buffer.alloc(32, 21));
    const body = changeKey({ channel: 'external', secretKey: keys.secretKey, header: header(1), wallet, newSecretKey: next.secretKey, newPublicKey: next.publicKey });
    const request = body.beginParse();
    request.skip(512 + 32 + 96 + 256);
    request.loadRef(); // rotation proof signature
    const encrypted = request.loadRef().beginParse().loadBuffer(32);
    expect(recoverOldSeed(next.secretKey.subarray(0, 32), encrypted).equals(keys.secretKey.subarray(0, 32))).toBe(true);
  });

  it('EGG end to end: a brand-new player hatches through a sponsored first request, then on their own', async () => {
    const admin = await chain.treasury('admin');
    const pub = keyPairFromSeed(Buffer.alloc(32, 77));
    const { init: minterInit, address: minter } = minterStateInit(
      { maxSupply: E(1_000_000), admin: admin.address, publisherKey: pub.publicKey, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
      eggMinterCode,
    );
    await admin.send({ to: minter, value: toNano('1'), init: minterInit, bounce: false, body: topUpBody() });

    // the player's wallet address is known from their key alone, so the server can put it in the tree before anything is deployed
    const tree = new EggTree([{ owner: wallet, cumulative: E(2500) }, { owner: bob.address, cumulative: E(1) }]);
    const root = signedRootCell(signRoot(minter, tree.treeRoot, tree.total, 1n, pub.secretKey));

    // 1) the first hatch: signed offline for the gasless channel, delivered and paid by a relayer, deploying both wallets
    const eggWallet = walletStateInit(wallet, minter, eggWalletCode);
    const claim = sendOne({
      channel: 'internal', secretKey: keys.secretKey, header: header(0),
      message: { to: eggWallet.address, value: Attach.claim, bounce: true, init: eggWallet.init, body: askToClaimBody({ cumulative: E(2500), proof: tree.proof(wallet)!, root }) },
    });
    await relay(claim, toNano('0.15'), true);

    const balance = async () => new TupleReader((await chain.runGetMethod(eggWallet.address, 'get_wallet_data')).stack).readBigNumber();
    expect(await balance()).toBe(E(2500));
    expect(await seqno()).toBe(1);

    // the excess TON came back to the player's wallet: they can now pay their own fees
    expect(await chain.getContract(wallet).then((c) => c.balance)).toBeGreaterThan(toNano('0.05'));

    // 2) a send of EGG, self-paid with an external request
    const transfer = beginCell().storeUint(0x0f8a7ea5, 32).storeUint(0, 64).storeCoins(E(100)).storeAddress(bob.address).storeAddress(wallet).storeMaybeRef(null).storeCoins(0).storeBit(0).endCell();
    await sendExternal(sendOne({ channel: 'external', secretKey: keys.secretKey, header: header(1), message: { to: eggWallet.address, value: toNano('0.05'), bounce: true, body: transfer } }));
    expect(await balance()).toBe(E(2400));
    void storeMessage;
  });
});
