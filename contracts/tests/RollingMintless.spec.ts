/**
 * End-to-end sandbox test that validates the user's requested flow:
 *
 *   1. User earns 10 jettons off-chain → tree updated → root committed.
 *   2. User transfers their jettons; rolling-claim piggybacks and mints 10.
 *   3. User earns 5 more jettons; tree updated → new root committed.
 *   4. User transfers again; piggyback mints the 5-jetton delta.
 *
 * The test uses a sandbox blockchain so no real TON is involved.
 */

import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import { compile } from '@ton/blueprint';
import { KeyPair, mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import '@ton/test-utils';

import {
  RollingMintlessMaster,
  RollingMintlessWallet,
  AirdropTree,
  buildRollingClaimPayload,
  buildStandardMerkleClaimPayload,
  signVoucher,
  ErrorCodes,
} from '../wrappers';

const NEVER_EXPIRES = 2 ** 47 - 1;

describe('Rolling Mintless Jetton — full tap-to-earn flow', () => {
  let masterCode: Cell;
  let walletCode: Cell;
  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let user: SandboxContract<TreasuryContract>;
  let master: SandboxContract<RollingMintlessMaster>;
  let signer: KeyPair;
  let tree: AirdropTree;

  beforeAll(async () => {
    masterCode = await compile('RollingMintlessMaster');
    walletCode = await compile('RollingMintlessWallet');
  });

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    admin = await blockchain.treasury('admin');
    user = await blockchain.treasury('user');
    signer = await mnemonicToPrivateKey(await mnemonicNew());
    tree = new AirdropTree();

    const content = beginCell().storeUint(0, 8).endCell(); // minimal metadata
    master = blockchain.openContract(
      RollingMintlessMaster.createFromConfig(
        {
          totalSupply: 0n,
          admin: admin.address,
          content,
          walletCode,
          signerPubkey: BigInt('0x' + signer.publicKey.toString('hex')),
        },
        masterCode,
      ),
    );

    const deployRes = await master.sendDeploy(admin.getSender(), toNano('1'));
    expect(deployRes.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      deploy: true,
      success: true,
    });

    // Pre-fund master with jetton supply by minting to a throwaway escrow address
    // that actually equals the master's own admin (it's fine — we just need supply).
    // In a real deployment you'd mint a very large pool once and never mint again.
  });

  async function updateRoot(newEpoch: number) {
    const newRoot = tree.root();
    const res = await master.sendUpdateMerkleRoot(admin.getSender(), {
      newEpoch,
      newRoot,
    });
    expect(res.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: true,
    });
    return newRoot;
  }

  async function openUserWalletWithInit() {
    return blockchain.openContract(
      RollingMintlessWallet.createFromConfig(
        {
          owner: user.address,
          master: master.address,
          walletCode,
          signerPubkey: BigInt('0x' + signer.publicKey.toString('hex')),
        },
        walletCode,
      ),
    );
  }

  async function performStandardClaim(
    targetTreasury: SandboxContract<TreasuryContract>,
    transferAmount: bigint,
  ) {
    const proof = tree.generateProof(user.address);
    const customPayload = buildStandardMerkleClaimPayload(proof);
    const userWallet = await openUserWalletWithInit();
    return await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: transferAmount,
      to: targetTreasury.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
  }

  async function performClaim(
    targetTreasury: SandboxContract<TreasuryContract>,
    transferAmount: bigint,
  ) {
    const root = tree.root();
    const voucher = signVoucher(
      (await master.getMerkleRoot()).epoch,
      root,
      signer.secretKey,
    );
    const proof = tree.generateProof(user.address);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const userWallet = await openUserWalletWithInit();
    return await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: transferAmount,
      to: targetTreasury.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
  }

  it('TEP-177 standard opcode: earn 10 → transfer with merkle_airdrop_claim', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('recipient');
    const claimRes = await performStandardClaim(recipient, toNano('10'));
    const userWallet = await openUserWalletWithInit();

    expect(claimRes.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: true,
    });
    expect(await userWallet.getAlreadyClaimed()).toBe(toNano('10'));
  });

  it('TEP-177 standard opcode: rolling delta on second epoch without voucher', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);
    const recipient = await blockchain.treasury('recipient');
    await performStandardClaim(recipient, toNano('10'));

    tree.set(user.address, {
      cumulativeAmount: toNano('15'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(2);

    const claimRes2 = await performStandardClaim(recipient, toNano('5'));
    expect(claimRes2.transactions).toHaveTransaction({
      from: user.address,
      to: (await openUserWalletWithInit()).address,
      success: true,
    });
    expect(await (await openUserWalletWithInit()).getAlreadyClaimed()).toBe(toNano('15'));
  });

  it('happy path: earn 10 → transfer → earn 5 → transfer', async () => {
    // ---- Epoch 1: user earns 10 jettons off-chain ----
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const { root: onChainRoot1, epoch: ep1 } = await master.getMerkleRoot();
    expect(ep1).toBe(1);
    expect(onChainRoot1).toBe(tree.root());

    // ---- First transfer: user sends 10 jettons to somebody, piggyback claim ----
    const recipient = await blockchain.treasury('recipient');

    const claimRes = await performClaim(recipient, toNano('10'));

    const userWallet = await openUserWalletWithInit();
    const userWalletAddr = userWallet.address;

    // Transfer should have succeeded through the user's jetton-wallet
    expect(claimRes.transactions).toHaveTransaction({
      from: user.address,
      to: userWalletAddr,
      success: true,
    });

    const alreadyClaimed1 = await userWallet.getAlreadyClaimed();
    expect(alreadyClaimed1).toBe(toNano('10'));
    const data1 = await userWallet.getWalletData();
    expect(data1.balance).toBe(0n); // 10 in, 10 out

    const cached1 = await userWallet.getCachedRoot();
    expect(cached1.epoch).toBe(1);
    expect(cached1.root).toBe(onChainRoot1);
    expect(await userWallet.getIsClaimed()).toBe(false);

    // ---- Epoch 2: user earns 5 more jettons off-chain ----
    tree.set(user.address, {
      cumulativeAmount: toNano('15'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(2);

    // ---- Second transfer: user sends 5, piggyback claim materializes +5 ----
    const claimRes2 = await performClaim(recipient, toNano('5'));
    expect(claimRes2.transactions).toHaveTransaction({
      from: user.address,
      to: userWalletAddr,
      success: true,
    });
    void claimRes2;

    const alreadyClaimed2 = await userWallet.getAlreadyClaimed();
    expect(alreadyClaimed2).toBe(toNano('15'));
    const data2 = await userWallet.getWalletData();
    expect(data2.balance).toBe(0n);
    const cached2 = await userWallet.getCachedRoot();
    expect(cached2.epoch).toBe(2);
  });

  it('claim + transfer deploys recipient jetton-wallet when enough TON is attached', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('external_recipient');
    const userWallet = await openUserWalletWithInit();
    const proof = tree.generateProof(user.address);
    const voucher = signVoucher(1, tree.root(), signer.secretKey);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const claimRes = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('1'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.18'),
      customPayload,
    });

    expect(claimRes.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: true,
    });

    const recipientJw = blockchain.openContract(
      RollingMintlessWallet.createFromConfig(
        {
          owner: recipient.address,
          master: master.address,
          walletCode,
          signerPubkey: BigInt('0x' + signer.publicKey.toString('hex')),
        },
        walletCode,
      ),
    );

    expect(claimRes.transactions).toHaveTransaction({
      from: userWallet.address,
      to: recipientJw.address,
      deploy: true,
      success: true,
    });

    const recipientData = await recipientJw.getWalletData();
    expect(recipientData.balance).toBe(toNano('1'));
    expect(await userWallet.getAlreadyClaimed()).toBe(toNano('10'));
  });

  it('rejects claim+transfer when inbound TON is too low for recipient deploy', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('poor_recipient');
    const userWallet = await openUserWalletWithInit();
    const proof = tree.generateProof(user.address);
    const voucher = signVoucher(1, tree.root(), signer.secretKey);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const res = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('1'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.07'),
      customPayload,
    });

    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: false,
      exitCode: ErrorCodes.notEnoughTon,
    });
  });

  it('MyTonWallet-style: 0.07 inbound + TON already on JW deploys recipient', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('mtw_recipient');
    const userWallet = await openUserWalletWithInit();
    const proof = tree.generateProof(user.address);
    const voucher = signVoucher(1, tree.root(), signer.secretKey);

    await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: 0n,
      to: user.address,
      forwardTonAmount: 1n,
      value: toNano('0.35'),
      customPayload: buildRollingClaimPayload({ proof, voucher }),
    });

    // Simulate TON returned to JW after a bounced recipient deploy (MTW sends ~0.07 each time).
    await user.send({ to: userWallet.address, value: toNano('0.08'), bounce: false });

    const res = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('1'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.07'),
    });

    const recipientJw = blockchain.openContract(
      RollingMintlessWallet.createFromConfig(
        {
          owner: recipient.address,
          master: master.address,
          walletCode,
          signerPubkey: BigInt('0x' + signer.publicKey.toString('hex')),
        },
        walletCode,
      ),
    );

    expect(res.transactions).toHaveTransaction({
      from: userWallet.address,
      to: recipientJw.address,
      deploy: true,
      success: true,
    });
    expect((await recipientJw.getWalletData()).balance).toBe(toNano('1'));
  });

  it('rejects stale proof (amount <= already_claimed)', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('recipient');
    await performClaim(recipient, toNano('10'));

    // Now we "bump" the epoch on-chain WITHOUT growing the user's leaf —
    // this simulates an operator pushing a new root for unrelated users while
    // the user's cumulative_amount stays at 10. The wallet should accept the
    // fresh voucher (new epoch) syncs root/epoch with zero balance delta, then the
    // transfer fails because the wallet has no jettons to send.
    await updateRoot(2);

    const res = await performClaim(recipient, toNano('1'));
    const userWalletAddr = (await openUserWalletWithInit()).address;
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWalletAddr,
      success: false,
      exitCode: ErrorCodes.notEnoughJetton,
    });
  });

  it('rejects same-epoch voucher when merkle root disagrees with cache', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('recipient');
    await performClaim(recipient, toNano('10'));

    tree.set(user.address, {
      cumulativeAmount: toNano('20'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    // NOTE: not updating on-chain root, but signing the same epoch as cached.
    const voucher = signVoucher(1, tree.root(), signer.secretKey);
    const proof = tree.generateProof(user.address);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const userWallet = await openUserWalletWithInit();
    const res = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('5'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: false,
      exitCode: ErrorCodes.voucherEpochRootMismatch,
    });
  });

  it('rejects voucher when signed epoch is behind wallet cache', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);
    const rootAtEpoch1 = tree.root();

    const recipient = await blockchain.treasury('recipient');
    await performClaim(recipient, toNano('10'));

    tree.set(user.address, {
      cumulativeAmount: toNano('15'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(2);
    await performClaim(recipient, toNano('5'));

    const voucher = signVoucher(1, rootAtEpoch1, signer.secretKey);
    const proof = tree.generateProof(user.address);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const userWallet = await openUserWalletWithInit();
    const res = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('1'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: false,
      exitCode: ErrorCodes.voucherStaleEpoch,
    });
  });

  it('allows transfer when wallet replays same-epoch voucher after partial claim', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const recipient = await blockchain.treasury('recipient');
    const first = await performClaim(recipient, toNano('5'));
    const userWallet = await openUserWalletWithInit();
    expect(first.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: true,
    });
    expect((await userWallet.getWalletData()).balance).toBe(toNano('5'));

    const root = tree.root();
    const voucher = signVoucher(
      (await master.getMerkleRoot()).epoch,
      root,
      signer.secretKey,
    );
    const proof = tree.generateProof(user.address);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const second = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('5'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
    expect(second.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: true,
    });
    expect((await userWallet.getWalletData()).balance).toBe(0n);
  });

  it('rejects voucher with bad signature', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(1);

    const fakeSigner = await mnemonicToPrivateKey(await mnemonicNew());
    const voucher = signVoucher(2, tree.root(), fakeSigner.secretKey);
    const proof = tree.generateProof(user.address);
    const customPayload = buildRollingClaimPayload({ proof, voucher });

    const recipient = await blockchain.treasury('recipient');
    const userWallet = await openUserWalletWithInit();
    const res = await userWallet.sendTransfer(user.getSender(), {
      jettonAmount: toNano('5'),
      to: recipient.address,
      forwardTonAmount: 1n,
      value: toNano('0.3'),
      customPayload,
    });
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWallet.address,
      success: false,
      exitCode: ErrorCodes.voucherBadSig,
    });
  });

  it('admin pause blocks root updates', async () => {
    await master.sendPause(admin.getSender());
    expect(await master.getIsPaused()).toBe(true);

    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    const res = await master.sendUpdateMerkleRoot(admin.getSender(), {
      newEpoch: 1,
      newRoot: tree.root(),
    });
    expect(res.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: false,
      exitCode: ErrorCodes.paused,
    });

    await master.sendUnpause(admin.getSender());
    expect(await master.getIsPaused()).toBe(false);
  });

  it('non-admin cannot update merkle root', async () => {
    const evil = await blockchain.treasury('evil');
    const res = await master.sendUpdateMerkleRoot(evil.getSender(), {
      newEpoch: 1,
      newRoot: 0x1234567890abcdefn,
    });
    expect(res.transactions).toHaveTransaction({
      from: evil.address,
      to: master.address,
      success: false,
      exitCode: ErrorCodes.unauthorized,
    });
  });

  it('epoch must monotonically increase', async () => {
    tree.set(user.address, {
      cumulativeAmount: toNano('10'),
      startFrom: 0,
      expiredAt: NEVER_EXPIRES,
    });
    await updateRoot(5);

    const res = await master.sendUpdateMerkleRoot(admin.getSender(), {
      newEpoch: 5,
      newRoot: tree.root(),
    });
    expect(res.transactions).toHaveTransaction({
      from: admin.address,
      to: master.address,
      success: false,
      exitCode: ErrorCodes.epochNotIncreasing,
    });
  });
});

describe('Rolling Mintless Jetton — max supply (admin mint)', () => {
  let masterCode: Cell;
  let walletCode: Cell;
  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let master: SandboxContract<RollingMintlessMaster>;
  let signer: KeyPair;

  beforeAll(async () => {
    masterCode = await compile('RollingMintlessMaster');
    walletCode = await compile('RollingMintlessWallet');
  });

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    admin = await blockchain.treasury('admin');
    signer = await mnemonicToPrivateKey(await mnemonicNew());
    const content = beginCell().storeUint(0, 8).endCell();
    master = blockchain.openContract(
      RollingMintlessMaster.createFromConfig(
        {
          totalSupply: 0n,
          maxSupply: toNano('100'),
          admin: admin.address,
          content,
          walletCode,
          signerPubkey: BigInt('0x' + signer.publicKey.toString('hex')),
        },
        masterCode,
      ),
    );
    await master.sendDeploy(admin.getSender(), toNano('1'));
  });

  it('rejects mint that would exceed max_supply', async () => {
    const to = await blockchain.treasury('holder');
    const ok = await master.sendMint(admin.getSender(), {
      to: to.address,
      jettonAmount: toNano('60'),
      forwardTonAmount: 0n,
      totalTonAmount: toNano('0.2'),
    });
    expect((await master.getJettonData()).totalSupply).toEqual(toNano('60'));
    expect(await master.getMaxSupply()).toEqual(toNano('100'));

    const bad = await master.sendMint(admin.getSender(), {
      to: to.address,
      jettonAmount: toNano('50'),
      forwardTonAmount: 0n,
      totalTonAmount: toNano('0.2'),
    });
    expect(bad.transactions).toHaveTransaction({
      on: master.address,
      success: false,
      exitCode: ErrorCodes.maxSupplyExceeded,
    });

    const jd = await master.getJettonData();
    expect(jd.totalSupply).toEqual(toNano('60'));
    expect(jd.mintable).toBe(true);
  });

  it('get_jetton_data reports mintable = false when supply is at cap', async () => {
    const to = await blockchain.treasury('holder');
    const res = await master.sendMint(admin.getSender(), {
      to: to.address,
      jettonAmount: toNano('100'),
      forwardTonAmount: 0n,
      totalTonAmount: toNano('0.25'),
    });
    expect((await master.getJettonData()).totalSupply).toEqual(toNano('100'));
    const jd = await master.getJettonData();
    expect(jd.totalSupply).toEqual(toNano('100'));
    expect(jd.mintable).toBe(false);
  });
});
