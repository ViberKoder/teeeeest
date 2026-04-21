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
    // fresh voucher (new epoch) but reject the claim because leaf.amount ==
    // already_claimed.
    await updateRoot(2);

    const res = await performClaim(recipient, toNano('1'));
    const userWalletAddr = (await openUserWalletWithInit()).address;
    expect(res.transactions).toHaveTransaction({
      from: user.address,
      to: userWalletAddr,
      success: false,
      exitCode: ErrorCodes.proofStaleAmount,
    });
  });

  it('rejects voucher with stale epoch', async () => {
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
      exitCode: ErrorCodes.voucherStaleEpoch,
    });
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
