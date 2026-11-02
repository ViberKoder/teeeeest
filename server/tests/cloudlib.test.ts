// The Serverless publisher is pure JS (no npm in that runtime). These tests pin it to the SDK and to the real contracts.
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { keyPairFromSeed, sign as tonSign, signVerify } from '@ton/crypto';
import { Blockchain } from '@ton/sandbox';
import { describe, expect, it } from 'vitest';
import { EggTree, eggMinterCode, minterStateInit, onchainMetadata, proofToCell, publishRootBody, SUBWALLET_ID, tgWalletStateInit, tgWalletCode } from '@egg/sdk';
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

  it('a root published by the Serverless code is accepted by the real minter, through the real wallet contract', async () => {
    const chain = await Blockchain.create();
    chain.now = 1_800_000_000;
    const admin = await chain.treasury('admin');
    const kp = keyPairFromSeed(Buffer.alloc(32, 21));
    const { init: wInit, address: wallet } = tgWalletStateInit({ publicKey: kp.publicKey, subwalletId: SUBWALLET_ID.testnet });
    const { init, address: minter } = minterStateInit(
      { maxSupply: toNano('1000000'), admin: admin.address, publisher: wallet, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
      eggMinterCode,
    );
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });
    // deploy the wallet with some TON
    await admin.send({ to: wallet, value: toNano('2'), init: wInit, bounce: false });

    const leaves = [{ owner: addr(1).toRawString(), cumulative: 5_000_000_000n }, { owner: addr(2).toRawString(), cumulative: 3_000_000_000n }];
    const tree = await treeLib.buildTree(leaves);
    const body = treeLib.publishRootBody(1, tree.treeRoot, tree.total);
    expect(Buffer.from(await body.hash())).toEqual(publishRootBody({ epoch: 1, treeRoot: Buffer.from(tree.treeRoot), total: tree.total }).hash());

    const boc = await walletLib.externalSend({
      wallet: wallet.toRawString(), seed: kp.secretKey.subarray(0, 32), subwalletId: walletLib.SUBWALLET.testnet,
      seqno: 0, validUntil: 1_800_000_300, to: minter.toRawString(), value: toNano('0.05'), body,
    });
    const msg = Cell.fromBoc(Buffer.from(boc))[0];
    const { loadMessage } = await import('@ton/core');
    await chain.sendMessage(loadMessage(msg.beginParse()));
    const r = await chain.runGetMethod(minter, 'get_last_epoch');
    expect(r.stackReader.readBigNumber()).toBe(1n);
    const root = await chain.runGetMethod(minter, 'get_root', [{ type: 'int', value: 1n }]);
    expect(root.stackReader.readBigNumber().toString(16).padStart(64, '0')).toBe(Buffer.from(tree.commitment).toString('hex'));
    void SendMode; void tgWalletCode;
  });
});
