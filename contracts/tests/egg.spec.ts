import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { readFileSync } from 'fs';
import { join } from 'path';
import { compile } from '@ton/blueprint';
import { KeyPair, keyPairFromSeed } from '@ton/crypto';
import '@ton/test-utils';
import {
  buildClaim, commentPayload, EggMaster, EggWallet, Err, KeyCert, offchainContent, Op, signCert,
} from '../wrappers';

const T0 = 1_800_000_000;
const DAY = 86_400;
const E = (n: number | string) => toNano(String(n));
const seed = (n: number) => keyPairFromSeed(Buffer.alloc(32, n));

describe('EGG jetton', () => {
  let masterCode: Cell;
  let walletCode: Cell;
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let master: SandboxContract<EggMaster>;
  let authority: KeyPair;
  let hot: KeyPair;
  let cert: KeyCert;

  beforeAll(async () => {
    masterCode = await compile('EggMaster');
    walletCode = await compile('EggWallet');
  });

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    admin = await chain.treasury('admin');
    alice = await chain.treasury('alice');
    bob = await chain.treasury('bob');
    authority = seed(1);
    hot = seed(2);
    master = chain.openContract(
      EggMaster.createFromConfig(
        {
          maxSupply: E(1_000_000),
          admin: admin.address,
          content: offchainContent('https://example.org/egg.json'),
          walletCode,
          authority: BigInt('0x' + authority.publicKey.toString('hex')),
        },
        masterCode,
      ),
    );
    await master.sendDeploy(admin.getSender());
    cert = signCert(authority.secretKey, master.address, hot.publicKey, 1, T0 + 30 * DAY);
  });

  const walletOf = (owner: SandboxContract<TreasuryContract>) =>
    chain.openContract(
      EggWallet.createFromConfig({
        owner: owner.address,
        master: master.address,
        walletCode,
        authority: BigInt('0x' + authority.publicKey.toString('hex')),
      }),
    );

  const claimFor = (
    owner: SandboxContract<TreasuryContract>,
    cumulative: bigint,
    o: { validUntil?: number; cert?: KeyCert; signer?: KeyPair } = {},
  ) =>
    buildClaim({
      master: master.address,
      owner: owner.address,
      cumulative,
      validUntil: o.validUntil ?? T0 + 600,
      signerSecret: (o.signer ?? hot).secretKey,
      cert: o.cert ?? cert,
    });

  it('deploys with a stable, signer-independent wallet address', async () => {
    const a1 = await master.getWalletAddress(alice.address);
    expect(a1.equals(walletOf(alice).address)).toBe(true);
    expect(await master.getAuthority()).toBe(BigInt('0x' + authority.publicKey.toString('hex')));
    expect((await master.getJettonData()).totalSupply).toBe(0n);
  });

  it('mints (admin only path) and transfers with comment + notification', async () => {
    await master.sendMint(admin.getSender(), { to: alice.address, jettonAmount: E(100) });
    const aw = walletOf(alice);
    expect((await aw.getWalletData()).balance).toBe(E(100));
    expect((await master.getJettonData()).totalSupply).toBe(E(100));

    const res = await aw.sendTransfer(alice.getSender(), {
      jettonAmount: E(30),
      to: bob.address,
      forwardTon: toNano('0.01'),
      forwardPayload: commentPayload('hello'),
      value: toNano('0.15'),
    });
    const bw = walletOf(bob);
    expect(res.transactions).toHaveTransaction({ from: aw.address, to: bw.address, success: true, deploy: true });
    expect((await bw.getWalletData()).balance).toBe(E(30));
    expect((await aw.getWalletData()).balance).toBe(E(70));
    expect(res.transactions).toHaveTransaction({ from: bw.address, to: bob.address, op: Op.transferNotification });
  });

  it('standalone claim deploys the wallet, credits it and keeps master supply truthful', async () => {
    const aw = walletOf(alice);
    const res = await aw.sendClaim(alice.getSender(), claimFor(alice, E(500)));
    expect(res.transactions).toHaveTransaction({ from: alice.address, to: aw.address, success: true, deploy: true });
    expect((await aw.getWalletData()).balance).toBe(E(500));
    expect((await aw.getClaimState()).claimed).toBe(E(500));
    expect(res.transactions).toHaveTransaction({ from: aw.address, to: master.address, op: Op.claimed, success: true });
    expect((await master.getJettonData()).totalSupply).toBe(E(500));
  });

  it('claim piggy-backs on a transfer: one transaction, one fee', async () => {
    const aw = walletOf(alice);
    const res = await aw.sendTransfer(alice.getSender(), {
      jettonAmount: E(200),
      to: bob.address,
      claim: claimFor(alice, E(500)),
      value: toNano('0.25'),
    });
    expect(res.transactions).toHaveTransaction({ from: alice.address, to: aw.address, success: true, deploy: true });
    expect((await aw.getWalletData()).balance).toBe(E(300));
    expect((await walletOf(bob).getWalletData()).balance).toBe(E(200));
    expect((await master.getJettonData()).totalSupply).toBe(E(500));
  });

  it('rolls forward: only the delta is credited, replays are harmless', async () => {
    const aw = walletOf(alice);
    await aw.sendClaim(alice.getSender(), claimFor(alice, E(10)));
    await aw.sendClaim(alice.getSender(), claimFor(alice, E(25)));
    expect((await aw.getWalletData()).balance).toBe(E(25));

    const again = await aw.sendClaim(alice.getSender(), claimFor(alice, E(25)));
    expect(again.transactions).toHaveTransaction({ to: aw.address, success: true });
    expect((await aw.getWalletData()).balance).toBe(E(25));
    expect((await master.getJettonData()).totalSupply).toBe(E(25));
  });

  it('never goes backwards', async () => {
    const aw = walletOf(alice);
    await aw.sendClaim(alice.getSender(), claimFor(alice, E(50)));
    const res = await aw.sendClaim(alice.getSender(), claimFor(alice, E(40)));
    expect(res.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.claimRegress });
  });

  it('claims expire, certificates expire', async () => {
    const aw = walletOf(alice);
    const c1 = claimFor(alice, E(1), { validUntil: T0 + 60 });
    chain.now = T0 + 61;
    const r1 = await aw.sendClaim(alice.getSender(), c1);
    expect(r1.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.claimExpired });

    const shortCert = signCert(authority.secretKey, master.address, hot.publicKey, 1, T0 + 100);
    const c2 = claimFor(alice, E(1), { cert: shortCert, validUntil: T0 + 10_000 });
    chain.now = T0 + 101;
    const r2 = await aw.sendClaim(alice.getSender(), c2);
    expect(r2.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.certExpired });
  });

  it('a claim is bound to its owner and to a certified signer', async () => {
    const bw = walletOf(bob);
    const forAlice = claimFor(alice, E(5));
    const r1 = await bw.sendClaim(bob.getSender(), forAlice);
    expect(r1.transactions).toHaveTransaction({ to: bw.address, success: false, exitCode: Err.badClaimSig });

    const stranger = seed(9);
    const r2 = await bw.sendClaim(bob.getSender(), claimFor(bob, E(5), { signer: stranger }));
    expect(r2.transactions).toHaveTransaction({ to: bw.address, success: false, exitCode: Err.badClaimSig });

    const selfCert = signCert(stranger.secretKey, master.address, stranger.publicKey, 1, T0 + DAY);
    const r3 = await bw.sendClaim(bob.getSender(), claimFor(bob, E(5), { signer: stranger, cert: selfCert }));
    expect(r3.transactions).toHaveTransaction({ to: bw.address, success: false, exitCode: Err.badCertSig });
  });

  it('hot keys rotate without moving any address; old keys are revoked on contact', async () => {
    const aw = walletOf(alice);
    const addrBefore = (await master.getWalletAddress(alice.address)).toString();

    await aw.sendClaim(alice.getSender(), claimFor(alice, E(10)));

    const hot2 = seed(3);
    const cert2 = signCert(authority.secretKey, master.address, hot2.publicKey, 2, T0 + 30 * DAY);
    await aw.sendClaim(alice.getSender(), claimFor(alice, E(20), { signer: hot2, cert: cert2 }));
    expect((await aw.getClaimState()).keyFloor).toBe(2);

    const old = await aw.sendClaim(alice.getSender(), claimFor(alice, E(30)));
    expect(old.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.keyRevoked });
    expect((await master.getWalletAddress(alice.address)).toString()).toBe(addrBefore);
    expect((await aw.getWalletData()).balance).toBe(E(20));
  });

  it('refuses transfers that do not carry enough TON', async () => {
    await master.sendMint(admin.getSender(), { to: alice.address, jettonAmount: E(10) });
    const aw = walletOf(alice);
    const res = await aw.sendTransfer(alice.getSender(), { jettonAmount: E(1), to: bob.address, value: toNano('0.02') });
    expect(res.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.notEnoughTon });
    expect((await aw.getWalletData()).balance).toBe(E(10));
  });

  it('only the owner moves tokens', async () => {
    await master.sendMint(admin.getSender(), { to: alice.address, jettonAmount: E(10) });
    const aw = walletOf(alice);
    const res = await aw.sendTransfer(bob.getSender(), { jettonAmount: E(1), to: bob.address, value: toNano('0.15') });
    expect(res.transactions).toHaveTransaction({ to: aw.address, success: false, exitCode: Err.notOwner });
  });

  it('burn lowers total supply, including claimed tokens', async () => {
    const aw = walletOf(alice);
    await aw.sendClaim(alice.getSender(), claimFor(alice, E(100)));
    const res = await aw.sendBurn(alice.getSender(), E(40));
    expect(res.transactions).toHaveTransaction({ from: aw.address, to: master.address, success: true });
    expect((await aw.getWalletData()).balance).toBe(E(60));
    expect((await master.getJettonData()).totalSupply).toBe(E(60));
  });

  it('mint respects max_supply', async () => {
    const res = await master.sendMint(admin.getSender(), { to: alice.address, jettonAmount: E(1_000_001) });
    expect(res.transactions).toHaveTransaction({ to: master.address, success: false, exitCode: Err.maxSupplyExceeded });
  });

  it('only admin mints / changes content', async () => {
    const m = await master.sendMint(alice.getSender(), { to: alice.address, jettonAmount: E(1) });
    expect(m.transactions).toHaveTransaction({ to: master.address, success: false, exitCode: Err.unauthorized });
    await master.sendChangeContent(admin.getSender(), offchainContent('https://example.org/v2.json'));
    expect(
      (await master.getJettonData()).content.equals(offchainContent('https://example.org/v2.json')),
    ).toBe(true);
  });

  it('committed build/*.boc artifacts match the FunC sources', () => {
    const onDisk = (n: string) => Cell.fromBoc(readFileSync(join(__dirname, '..', 'build', `${n}.boc`)))[0];
    expect(onDisk('EggMaster').hash().equals(masterCode.hash())).toBe(true);
    expect(onDisk('EggWallet').hash().equals(walletCode.hash())).toBe(true);
  });
});
