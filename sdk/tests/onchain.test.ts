import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano, TupleReader } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  askToClaimBody, Attach, burnBody, commentPayload, EggTree, eggMinterCode, eggWalletCode, Err, minterStateInit,
  onchainMetadata, signRoot, signedRootCell, verifyEntitlement, changePublisherKeyBody, proveFraudBody, transferBody, transferIntent, verifyProof, walletStateInit,
} from '../src';

const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

describe('TypeScript SDK against the Tolk contracts built by Acton', () => {
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  const pub = keyPairFromSeed(Buffer.alloc(32, 77));
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let minter: Address;

  const get = async (a: Address, m: string, args: any[] = []) => new TupleReader((await chain.runGetMethod(a, m, args)).stack);
  const exitOf = (txs: any[], to: Address) => {
    const tx = txs.find((t) => t.inMessage?.info.dest?.toString() === to.toString() && t.description.type === 'generic');
    return tx?.description.computePhase.type === 'vm' ? tx.description.computePhase.exitCode : undefined;
  };

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    [admin, alice, bob] = await Promise.all(['admin', 'alice', 'bob'].map((n) => chain.treasury(n)));
    const { init, address } = minterStateInit(
      {
        maxSupply: E(1_000_000),
        admin: admin.address,
        publisherKey: pub.publicKey,
        metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9, description: 'test', image: 'https://x.test/egg.png' }),
      },
      eggMinterCode,
    );
    minter = address;
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });
  });

  // a root signed by the publisher: nothing is published, the player carries it into the claim
  const rootOf = (tree: EggTree, seq = 1n, key = pub.secretKey) => signRoot(minter, tree.treeRoot, tree.total, seq, key);

  const claim = async (owner: SandboxContract<TreasuryContract>, tree: EggTree, seq = 1n) => {
    const { init, address } = walletStateInit(owner.address, minter, eggWalletCode);
    const deployed = (await chain.getContract(address)).accountState?.type === 'active';
    const cumulative = tree.cumulativeOf(owner.address);
    const res = await owner.send({
      to: address,
      value: Attach.claim,
      bounce: true,
      init: deployed ? undefined : init,
      body: askToClaimBody({ cumulative, proof: tree.proof(owner.address)!, root: signedRootCell(rootOf(tree, seq)) }),
    });
    return { res, wallet: address };
  };

  const balanceOf = async (owner: Address) => {
    const { address } = walletStateInit(owner, minter, eggWalletCode);
    if ((await chain.getContract(address)).accountState?.type !== 'active') return 0n;
    return (await get(address, 'get_wallet_data')).readBigNumber();
  };

  it('the TS init data is a valid minter, and standard getters agree', async () => {
    const s = await get(minter, 'get_jetton_data');
    expect(s.readBigNumber()).toBe(0n); // supply
    s.readBigNumber(); // mintable
    expect((await get(minter, 'get_max_supply')).readBigNumber()).toBe(E(1_000_000));
    expect((await get(minter, 'get_publisher_key')).readBigNumber().toString(16).padStart(64, '0')).toBe(pub.publicKey.toString('hex'));
    const w = await get(minter, 'get_wallet_address', [{ type: 'slice', cell: beginCell().storeAddress(alice.address).endCell() }]);
    expect(w.readAddress().equals(walletStateInit(alice.address, minter, eggWalletCode).address)).toBe(true);
  });

  it('on-chain metadata is complete (this is what explorers read)', async () => {
    const s = await get(minter, 'get_jetton_data');
    s.skip(3);
    const content = s.readCell();
    const sl = content.beginParse();
    expect(sl.loadUint(8)).toBe(0);
    const dict = sl.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    expect(dict.size).toBe(5);
  });

  it('signed root → claim with proofs built by the SDK: one tree, many users, exact amounts', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => chain.treasury('u' + i)));
    const tree = new EggTree([
      { owner: alice.address, cumulative: E(2500) },
      { owner: bob.address, cumulative: E(40) },
      ...users.map((u, i) => ({ owner: u.address, cumulative: E(10 + i) })),
    ]);

    // the SDK's verification is exactly what the minter will check (signature against the key stored in the contract, then the proof)
    const key = Buffer.from((await get(minter, 'get_publisher_key')).readBigNumber().toString(16).padStart(64, '0'), 'hex');
    const ent = { owner: alice.address.toRawString(), cumulative: E(2500).toString(), proof: tree.proof(alice.address)!.toBoc().toString('base64'), root: rootOf(tree) };
    expect(verifyEntitlement(ent, minter, key)).toBe(true);
    expect(verifyEntitlement({ ...ent, cumulative: E(2501).toString() }, minter, key)).toBe(false);
    expect(verifyEntitlement(ent, minter, Buffer.alloc(32, 1))).toBe(false);
    expect(verifyProof(alice.address, E(2500), tree.proof(alice.address)!, tree.commitment)).toBe(true);

    for (const u of [alice, bob, ...users]) {
      const { res, wallet } = await claim(u, tree);
      expect(exitOf(res.transactions, wallet), `claim of ${u.address}`).toBe(0);
      expect(await balanceOf(u.address)).toBe(tree.cumulativeOf(u.address));
    }
    const supply = (await get(minter, 'get_jetton_data')).readBigNumber();
    expect(supply).toBe(tree.total);
    expect((await get(minter, 'get_max_total')).readBigNumber()).toBe(tree.total);
  });

  it('a claim, including deploying the wallet, costs the user less than 0.1 TON', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    const before = await alice.getBalance();
    await claim(alice, tree);
    const spent = before - (await alice.getBalance());
    // eslint-disable-next-line no-console
    console.log('claim cost (TON):', Number(spent) / 1e9);
    expect(spent).toBeLessThan(toNano('0.1'));
    expect(await balanceOf(alice.address)).toBe(E(100));
  });

  it('claimed EGG transfers with a comment, and burning lowers the supply', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    const { wallet } = await claim(alice, tree);

    const send = await alice.send({
      to: wallet,
      value: Attach.transfer,
      body: transferBody({ amount: E(30), to: bob.address, responseTo: alice.address, forwardTon: 1n, forwardPayload: commentPayload('for coffee') }),
    });
    const bw = walletStateInit(bob.address, minter, eggWalletCode).address;
    expect(exitOf(send.transactions, bw)).toBe(0);
    expect(send.transactions.some((t) => t.inMessage?.info.dest?.toString() === bob.address.toString() && t.inMessage.body.beginParse().loadUint(32) === 0x7362d09c)).toBe(true);
    expect(await balanceOf(bob.address)).toBe(E(30));

    await alice.send({ to: wallet, value: Attach.burn, body: burnBody({ amount: E(20), responseTo: alice.address }) });
    expect((await get(minter, 'get_jetton_data')).readBigNumber()).toBe(E(80));
  });

  it('claim and send in ONE request: the claim is credited, then the amount (with a comment) reaches the recipient', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const res = await alice.send({
      to: wallet,
      value: Attach.claimAndSend,
      bounce: true,
      init,
      body: askToClaimBody({
        cumulative: E(100), proof: tree.proof(alice.address)!, root: signedRootCell(rootOf(tree)),
        next: transferIntent({ amount: E(30), to: bob.address, excessesTo: alice.address, forwardTon: 1n, comment: 'for coffee' }),
      }),
    });
    expect(exitOf(res.transactions, wallet)).toBe(0);
    expect(await balanceOf(alice.address)).toBe(E(70));
    expect(await balanceOf(bob.address)).toBe(E(30));
    expect(res.transactions.some((t) => t.inMessage?.info.dest?.toString() === bob.address.toString() && t.inMessage.body.beginParse().loadUint(32) === 0x7362d09c)).toBe(true);
    expect((await get(minter, 'get_jetton_data')).readBigNumber()).toBe(E(100));
  });

  it('claim and send to the username vault: 0.06 TON travels with the EGG so the vault can pay it out', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const fwd = toNano('0.06');
    const res = await alice.send({
      to: wallet, value: Attach.claimAndSend + fwd, bounce: true, init,
      body: askToClaimBody({
        cumulative: E(100), proof: tree.proof(alice.address)!, root: signedRootCell(rootOf(tree)),
        next: transferIntent({ amount: E(10), to: bob.address, excessesTo: alice.address, forwardTon: fwd, comment: '@someone' }),
      }),
    });
    expect(exitOf(res.transactions, wallet)).toBe(0);
    expect(await balanceOf(bob.address)).toBe(E(10));
    const note = res.transactions.find((t) => t.inMessage?.info.dest?.toString() === bob.address.toString() && t.inMessage.body.beginParse().loadUint(32) === 0x7362d09c);
    expect(note).toBeTruthy();
    expect((note!.inMessage!.info as any).value.coins).toBeGreaterThanOrEqual(fwd - toNano('0.001'));
  });

  it('a signed root stays valid forever: a later root that drops the user does not revoke it', async () => {
    const t1 = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    const t2 = new EggTree([{ owner: bob.address, cumulative: E(1) }, { owner: admin.address, cumulative: E(100) }]);
    await claim(bob, t2, 2n); // the newer root (without alice) is used first
    chain.now = T0 + 30 * 24 * 3600;
    const { res, wallet } = await claim(alice, t1, 1n);
    expect(exitOf(res.transactions, wallet)).toBe(0);
    expect(await balanceOf(alice.address)).toBe(E(100));
  });

  it('only the publisher key makes a root; only the admin can change that key, and the old key keeps what it promised', async () => {
    const t = new EggTree([{ owner: alice.address, cumulative: E(1) }]);
    const stranger = keyPairFromSeed(Buffer.alloc(32, 78));
    const forged = signedRootCell(signRoot(minter, t.treeRoot, t.total, 1n, stranger.secretKey));
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const bad = await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(1), proof: t.proof(alice.address)!, root: forged }) });
    expect(exitOf(bad.transactions, minter)).toBe(Err.badSignature);

    const rogue = await alice.send({ to: minter, value: toNano('0.05'), body: changePublisherKeyBody(stranger.publicKey) });
    expect(exitOf(rogue.transactions, minter)).toBe(Err.notAdmin);
    const ok = await admin.send({ to: minter, value: toNano('0.05'), body: changePublisherKeyBody(stranger.publicKey) });
    expect(exitOf(ok.transactions, minter)).toBe(0);

    // the new key's roots work; the previous key's roots are limited to what was promised when it was replaced (nothing yet: maxTotal 0)
    const fresh = await alice.send({ to: wallet, value: Attach.claim, body: askToClaimBody({ cumulative: E(1), proof: t.proof(alice.address)!, root: forged }) });
    expect(exitOf(fresh.transactions, minter)).toBe(0);
    const t2 = new EggTree([{ owner: alice.address, cumulative: E(1) }, { owner: bob.address, cumulative: E(5) }]);
    const old = await alice.send({ to: wallet, value: Attach.claim, body: askToClaimBody({ cumulative: E(1), proof: t2.proof(alice.address)!, root: signedRootCell(rootOf(t2, 2n)) }) });
    expect(exitOf(old.transactions, minter)).toBe(Err.legacyCap);
  });
});
void Cell;

describe('fraud proofs built by the SDK', () => {
  it('a later root that lowers an owner\'s amount freezes the key; the SDK message is what the contract parses', async () => {
    const chain = await Blockchain.create();
    chain.now = T0;
    const [admin, alice, bob] = await Promise.all(['admin', 'alice', 'bob'].map((n) => chain.treasury(n)));
    const pub = keyPairFromSeed(Buffer.alloc(32, 77));
    const { init, address: minter } = minterStateInit({ maxSupply: E(1_000_000), admin: admin.address, publisherKey: pub.publicKey, launchAt: T0, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) }, eggMinterCode);
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });
    const t1 = new EggTree([{ owner: alice.address, cumulative: E(10) }, { owner: bob.address, cumulative: E(5) }]);
    const t2 = new EggTree([{ owner: alice.address, cumulative: E(9) }, { owner: bob.address, cumulative: E(50) }]);
    const r = (t: EggTree, seq: bigint) => signedRootCell(signRoot(minter, t.treeRoot, t.total, seq, pub.secretKey));
    const res = await bob.send({ to: minter, value: toNano('0.1'), body: proveFraudBody({ a: r(t1, 1n), b: r(t2, 2n), owner: alice.address, cumA: E(10), cumB: E(9), proofA: t1.proof(alice.address)!, proofB: t2.proof(alice.address)! }) });
    const tx = res.transactions.find((t) => t.inMessage?.info.dest?.toString() === minter.toString());
    expect((tx!.description as any).computePhase.exitCode).toBe(0);
    const l = new TupleReader((await chain.runGetMethod(minter, 'get_limits')).stack);
    for (let i = 0; i < 8; i++) l.readBigNumber();
    expect(l.readBoolean()).toBe(true);
  });
});
