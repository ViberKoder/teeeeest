// The Serverless publisher is pure JS (no npm in that runtime). These tests pin it to the SDK and to the real contracts.
import { Address, beginCell, Cell, SendMode, toNano, TupleReader } from '@ton/core';
import { keyPairFromSeed, sign as tonSign, signVerify } from '@ton/crypto';
import { Blockchain } from '@ton/sandbox';
import { describe, expect, it } from 'vitest';
import { askToClaimBody, Attach, rotationSignature, externalBoc, sendOne, EggTree, eggMinterCode, eggWalletCode, minterStateInit, onchainMetadata, proofToCell, signedRootCell, signedRootDigest, SUBWALLET_ID, tgWalletStateInit, verifySignedRoot, walletStateInit } from '@egg/sdk';
// @ts-expect-error plain JS modules written for the Serverless runtime
import * as ed from '../../app/tgcloud/lib/ed25519.js';
// @ts-expect-error
import * as cellLib from '../../app/tgcloud/lib/cell.js';
// @ts-expect-error
import * as treeLib from '../../app/tgcloud/lib/tree.js';
// @ts-expect-error
import * as walletLib from '../../app/tgcloud/lib/wallet.js';
// @ts-expect-error
import { fromBase64, toBase64 } from '../../app/tgcloud/lib/bytes.js';

const addr = (n: number) => new Address(0, Buffer.alloc(32, n));

describe('Serverless library == SDK', () => {
  it('ed25519: same public keys and signatures as @ton/crypto, and it verifies / rejects', async () => {
    for (const s of [1, 2, 3]) {
      const kp = keyPairFromSeed(Buffer.alloc(32, s));
      const msg = Buffer.from('egg-link:v1:' + s);
      expect(Buffer.from(await ed.publicKeyOf(kp.secretKey.subarray(0, 32)))).toEqual(kp.publicKey);
      const mine = Buffer.from(await ed.sign(msg, kp.secretKey.subarray(0, 32)));
      expect(mine).toEqual(tonSign(msg, kp.secretKey));
      expect(await ed.verify(msg, mine, kp.publicKey)).toBe(true);
      expect(await ed.verify(Buffer.from('other'), mine, kp.publicKey)).toBe(false);
      expect(signVerify(msg, Buffer.from(tonSign(msg, kp.secretKey)), kp.publicKey)).toBe(true);
    }
  });

  it('cell hashes and BoC round-trip match @ton/core', async () => {
    const mine = new cellLib.Builder().uint(7, 8).uint(123456789n, 128).bytes(new Uint8Array(32).fill(5)).ref(new cellLib.Builder().uint(1, 3).build()).build();
    const theirs = beginCell().storeUint(7, 8).storeUint(123456789n, 128).storeBuffer(Buffer.alloc(32, 5)).storeRef(beginCell().storeUint(1, 3).endCell()).endCell();
    expect(Buffer.from(await mine.hash())).toEqual(theirs.hash());
    const boc = await cellLib.toBoc(mine);
    expect(Cell.fromBoc(Buffer.from(boc))[0].hash()).toEqual(theirs.hash());
    expect(Buffer.from(await cellLib.fromBoc(theirs.toBoc({ idx: false, crc32: true })).hash())).toEqual(theirs.hash());
    expect(toBase64(Buffer.from('hello world!'))).toBe(Buffer.from('hello world!').toString('base64'));
    expect(Buffer.from(fromBase64('aGVsbG8gd29ybGQh')).toString()).toBe('hello world!');
  });

  it('tree: same root, commitment and proofs as the SDK, for many sizes', async () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const leaves = Array.from({ length: n }, (_, i) => ({ owner: addr(i + 1), cumulative: BigInt(i + 1) * 1_000_000_000n }));
      const sdk = new EggTree(leaves);
      const mine = await treeLib.buildTree(leaves.map((l) => ({ owner: l.owner.toRawString(), cumulative: l.cumulative })));
      expect(Buffer.from(mine.treeRoot)).toEqual(sdk.treeRoot);
      expect(Buffer.from(mine.commitment)).toEqual(sdk.commitment);
      expect(mine.total).toBe(sdk.total);
      for (const l of leaves) {
        const p = treeLib.proofCell(mine, l.owner.toRawString());
        expect(Buffer.from(await p.hash())).toEqual(proofToCell(sdk.steps(l.owner)!).hash());
      }
    }
  });

  it('wallet address derivation matches the SDK', async () => {
    const kp = keyPairFromSeed(Buffer.alloc(32, 9));
    const { address } = tgWalletStateInit({ publicKey: kp.publicKey, subwalletId: SUBWALLET_ID.testnet });
    expect(await walletLib.walletAddress(kp.publicKey, walletLib.SUBWALLET.testnet)).toBe(address.toRawString());
  });

  it('a root signed by the Serverless code is accepted by the real minter: signature, proof and claim, nothing published', async () => {
    const chain = await Blockchain.create();
    chain.now = 1_800_000_000;
    const admin = await chain.treasury('admin');
    const alice = await chain.treasury('alice');
    const pub = keyPairFromSeed(Buffer.alloc(32, 21));
    const { init, address: minter } = minterStateInit(
      { maxSupply: toNano('1000000'), admin: admin.address, publisherKey: pub.publicKey, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
      eggMinterCode,
    );
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });

    const leaves = [{ owner: alice.address.toRawString(), cumulative: 5_000_000_000n }, { owner: addr(2).toRawString(), cumulative: 3_000_000_000n }];
    const tree = await treeLib.buildTree(leaves);
    const seq = 7n;
    const digest = await treeLib.signedRootDigest(minter.toRawString(), tree.treeRoot, tree.total, seq);
    expect(Buffer.from(digest)).toEqual(signedRootDigest(minter, Buffer.from(tree.treeRoot), tree.total, seq));
    const signature = await ed.sign(digest, pub.secretKey.subarray(0, 32));
    const root = { treeRoot: Buffer.from(tree.treeRoot).toString('hex'), total: tree.total.toString(), seq: seq.toString(), signature: Buffer.from(signature).toString('hex') };
    expect(verifySignedRoot(minter, root, pub.publicKey)).toBe(true);

    const proof = Cell.fromBoc(Buffer.from(await cellLib.toBoc(treeLib.proofCell(tree, alice.address.toRawString()))))[0];
    const { init: wi, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const res = await alice.send({ to: wallet, value: Attach.claim, init: wi, body: askToClaimBody({ cumulative: 5_000_000_000n, proof, root: signedRootCell(root) }) });
    const bal = new TupleReader((await chain.runGetMethod(wallet, 'get_wallet_data')).stack).readBigNumber();
    expect(bal).toBe(5_000_000_000n);
    expect(res.transactions.length).toBeGreaterThan(3);
    const supply = new TupleReader((await chain.runGetMethod(minter, 'get_jetton_data')).stack).readBigNumber();
    expect(supply).toBe(5_000_000_000n);
  });

  it('a wallet prepared by the bot is handed to the user\'s own key: deployed by the bot, then ONLY the new key works', async () => {
    const chain = await Blockchain.create();
    chain.now = 1_800_000_000;
    const sender = await chain.treasury('sender');
    const botSeed = Buffer.alloc(32, 41);
    const bot = keyPairFromSeed(botSeed);
    const user = keyPairFromSeed(Buffer.alloc(32, 42));
    const { address: wallet } = tgWalletStateInit({ publicKey: bot.publicKey, subwalletId: SUBWALLET_ID.testnet });
    expect(await walletLib.walletAddress(bot.publicKey, walletLib.SUBWALLET.testnet)).toBe(wallet.toRawString());

    // somebody sent money to the prepared (still undeployed) address
    await sender.send({ to: wallet, value: toNano('0.5'), bounce: false });

    // the user's device signs the rotation proof; the bot (old key) sends the change, attaching the StateInit
    const proofSig = rotationSignature(wallet, user.secretKey);
    expect(await ed.verify(await (walletLib.rotationProof(wallet.toRawString())).hash(), proofSig, user.publicKey)).toBe(true);
    const boc = await walletLib.changeKeyExternal({
      wallet: wallet.toRawString(), seed: botSeed, subwalletId: walletLib.SUBWALLET.testnet, seqno: 0, validUntil: 1_800_000_300,
      newPublicKey: user.publicKey, rotationSignature: proofSig, init: walletLib.stateInit(bot.publicKey, walletLib.SUBWALLET.testnet),
    });
    const { loadMessage } = await import('@ton/core');
    await chain.sendMessage(loadMessage(Cell.fromBoc(Buffer.from(boc))[0].beginParse()));
    const key = (await chain.runGetMethod(wallet, 'get_public_key')).stackReader.readBigNumber().toString(16).padStart(64, '0');
    expect(key).toBe(user.publicKey.toString('hex'));
    const seqno = async () => (await chain.runGetMethod(wallet, 'seqno')).stackReader.readNumber();
    expect(await seqno()).toBe(1);

    // the bot's derived key no longer works; the user's does
    const send = (secret: Buffer) => {
      const body = sendOne({ channel: 'external', secretKey: secret, header: { subwalletId: SUBWALLET_ID.testnet, validUntil: 1_800_000_300, seqno: 1 }, message: { to: sender.address, value: toNano('0.01'), bounce: false }, sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS });
      return chain.sendMessage(loadMessage(Cell.fromBoc(externalBoc(wallet, body))[0].beginParse()));
    };
    await expect(send(bot.secretKey)).rejects.toThrow();
    await send(user.secretKey);
    expect(await seqno()).toBe(2);
  });
});
