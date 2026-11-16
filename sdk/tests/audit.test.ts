import { Blockchain, SandboxContract, TreasuryContract, internal } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano, TupleReader } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  askToClaimBody, Attach, EggTree, eggMinterCode, eggWalletCode, Err, minterStateInit, onchainMetadata, signRoot, signedRootCell,
  leafHash, nodeHash, Op, proofToCell, ProofStep, transferBody, transferIntent, walletStateInit,
} from '../src';

const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

describe('audit regressions', () => {
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let minter: Address;
  const pub = keyPairFromSeed(Buffer.alloc(32, 77));

  const get = async (a: Address, m: string, args: any[] = []) => new TupleReader((await chain.runGetMethod(a, m, args)).stack);
  const supply = async () => (await get(minter, 'get_jetton_data')).readBigNumber();
  const minted = async () => (await get(minter, 'get_total_minted')).readBigNumber();
  const exitOf = (txs: any[], to: Address) => {
    const tx = txs.find((t) => t.inMessage?.info.dest?.toString() === to.toString() && t.description.type === 'generic');
    return tx?.description.computePhase.type === 'vm' ? tx.description.computePhase.exitCode : undefined;
  };
  const balanceOf = async (owner: Address) => {
    const { address } = walletStateInit(owner, minter, eggWalletCode);
    if ((await chain.getContract(address)).accountState?.type !== 'active') return 0n;
    return (await get(address, 'get_wallet_data')).readBigNumber();
  };
  const rootCell = (tree: EggTree, seq = 1n) => signedRootCell(signRoot(minter, tree.treeRoot, tree.total, seq, pub.secretKey));

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    [admin, alice, bob] = await Promise.all(['admin', 'alice', 'bob'].map((n) => chain.treasury(n)));
    const { init, address } = minterStateInit(
      { maxSupply: E(1_000_000), admin: admin.address, publisherKey: pub.publicKey, launchAt: T0, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
      eggMinterCode,
    );
    minter = address;
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });
  });

  it('a masterchain twin of an owner can not claim the same leaf a second time', async () => {
    // the third leaf leaves room under `maxTotal`, so only the workchain check stands between the twin and a second mint
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }, { owner: admin.address, cumulative: E(500) }]);
    const body = askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) });
    const { init, address: w0 } = walletStateInit(alice.address, minter, eggWalletCode);
    await alice.send({ to: w0, value: Attach.claim, init, body });
    expect(await balanceOf(alice.address)).toBe(E(100));

    const twin = new Address(-1, alice.address.hash);
    const { init: init1, address: w1 } = walletStateInit(twin, minter, eggWalletCode);
    const res = await chain.sendMessage(internal({ from: twin, to: w1, value: Attach.claim, stateInit: init1, bounce: true, body }));
    expect(exitOf(res.transactions, minter)).toBe(Err.wrongWorkchain);
    expect(await balanceOf(twin)).toBe(0n);
    expect(await supply()).toBe(E(100));
  });

  const three = () => new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }, { owner: admin.address, cumulative: E(500) }]);
  const gasOf = (txs: any[], to: Address, op: number) => {
    const tx = txs.find((t) => t.inMessage?.info.dest?.toString() === to.toString() && !t.inMessage.info.bounced && t.inMessage.body.beginParse().loadUint(32) === op);
    return Number(tx?.description.computePhase.gasUsed ?? 0n);
  };

  /** a leaf for `owner` under `depth` synthetic siblings: the deepest proof the contract accepts when depth = 64 */
  const deep = (owner: Address, cumulative: bigint, depth: number) => {
    const steps: ProofStep[] = [];
    let hash = leafHash(owner, cumulative);
    let sum = cumulative;
    for (let i = 0; i < depth; i++) {
      const s: ProofStep = { siblingHash: Buffer.alloc(32, i + 1), siblingSum: 1n, siblingOnRight: i % 2 === 0 };
      hash = s.siblingOnRight ? nodeHash(hash, sum, s.siblingHash, s.siblingSum) : nodeHash(s.siblingHash, s.siblingSum, hash, sum);
      sum += s.siblingSum;
      steps.push(s);
    }
    return { steps, root: signedRootCell(signRoot(minter, hash, sum, 1n, pub.secretKey)), total: sum };
  };

  it('a malformed `next` is refused by the wallet before anything is locked or counted', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const garbage = beginCell().storeUint(1, 3).endCell();
    for (let i = 0; i < 3; i++) {
      const res = await alice.send({ to: wallet, value: Attach.claim, init: i ? undefined : init, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree), next: garbage }) });
      expect(exitOf(res.transactions, wallet)).not.toBe(0);
      expect(res.transactions.some((t) => t.inMessage?.info.dest?.toString() === minter.toString())).toBe(false);
      chain.now = T0 + 700 * (i + 1);
    }
    expect(await supply()).toBe(0n);
    expect(await minted()).toBe(0n);
    // and the wallet is not left locked: a proper claim goes through at once
    await alice.send({ to: wallet, value: Attach.claim, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) }) });
    expect(await balanceOf(alice.address)).toBe(E(100));
    expect(await supply()).toBe(E(100));
  });

  it('a `next` to another workchain is refused up front', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const next = transferIntent({ amount: E(1), to: new Address(-1, bob.address.hash), excessesTo: alice.address });
    const res = await alice.send({ to: wallet, value: Attach.claimAndSend, init, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree), next }) });
    expect(exitOf(res.transactions, wallet)).toBe(Err.wrongWorkchain);
    expect(await supply()).toBe(0n);
  });

  it('a credit its wallet could not take comes back and is taken out of the supply again', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) }) });
    expect(await supply()).toBe(E(100));
    // what the chain delivers when a ClaimCredit{minted: 30} bounces: 0xFFFFFFFF + the first 256 bits of the body
    const bounced = beginCell().storeUint(0xffffffff, 32).storeUint(Op.claimCredit, 32).storeUint(7, 64).storeCoins(E(30)).endCell();
    await chain.sendMessage(internal({ from: wallet, to: minter, value: toNano('0.05'), bounced: true, bounce: false, body: bounced }));
    expect(await supply()).toBe(E(70));
    expect(await minted()).toBe(E(70));
    // the same bytes as an ordinary message do nothing: only a real bounce is read this way
    const plain = await chain.sendMessage(internal({ from: wallet, to: minter, value: toNano('0.05'), bounce: false, body: bounced }));
    expect(exitOf(plain.transactions, minter)).not.toBe(0);
    expect(await supply()).toBe(E(70));
  });

  it('only a genuine wallet can report a surplus, and nobody can credit a wallet except through a claim', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) }) });
    const surplus = (owner: Address) => beginCell().storeUint(Op.claimSurplus, 32).storeUint(0, 64).storeCoins(E(50)).storeAddress(owner).endCell();
    const forged = await bob.send({ to: minter, value: toNano('0.05'), body: surplus(alice.address) });
    expect(exitOf(forged.transactions, minter)).toBe(Err.notValidWallet);
    expect(await supply()).toBe(E(100));

    // ClaimCredit from anyone but the minter
    const credit = beginCell().storeUint(Op.claimCredit, 32).storeUint(0, 64).storeCoins(0).storeCoins(E(999)).storeMaybeRef(null).endCell();
    expect(exitOf((await bob.send({ to: wallet, value: toNano('0.05'), body: credit })).transactions, wallet)).toBe(Err.notMinter);
    // an internal transfer that claims to come from the minter (there is no mint): refused
    const mint = beginCell().storeUint(Op.internalTransfer, 32).storeUint(0, 64).storeCoins(E(999)).storeAddress(null).storeAddress(null).storeCoins(0).storeBit(0).endCell();
    const viaMinter = await chain.sendMessage(internal({ from: minter, to: wallet, value: toNano('0.05'), body: mint }));
    expect(exitOf(viaMinter.transactions, wallet)).not.toBe(0);
    // an internal transfer from a stranger who names alice as the initiator: refused
    const fake = beginCell().storeUint(Op.internalTransfer, 32).storeUint(0, 64).storeCoins(E(999)).storeAddress(bob.address).storeAddress(null).storeCoins(0).storeBit(0).endCell();
    expect(exitOf((await bob.send({ to: wallet, value: toNano('0.05'), body: fake })).transactions, wallet)).toBe(Err.notValidWallet);
    expect(await balanceOf(alice.address)).toBe(E(100));
  });

  it('a proof chain with empty links is refused (it could only burn gas)', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const real = tree.proof(alice.address)!;
    for (const pad of [100, 20, 1]) {
      let tail: Cell = beginCell().storeUint(0, 3).endCell();
      for (let i = 1; i < pad; i++) tail = beginCell().storeUint(1, 1).storeUint(0, 2).storeRef(tail).endCell();
      const s = real.beginParse();
      s.loadUint(1);
      const padded = beginCell().storeUint(1, 1).storeSlice(s).storeRef(tail).endCell();
      const res = await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(100), proof: padded, root: rootCell(tree) }) });
      // a single empty LAST link is the canonical "no more steps"; anything longer is refused
      if (pad > 1) expect(exitOf(res.transactions, minter), `pad ${pad}`).toBe(Err.proofTooDeep);
      chain.now = (chain.now ?? T0) + 700;
      expect(await supply(), `pad ${pad}`).toBe(await balanceOf(alice.address));
    }
  });

  it('two claims in flight (lock expired while the first was still travelling): the surplus goes back, supply = what wallets hold', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const body = askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) });
    const it1 = await chain.sendMessageIter(internal({ from: alice.address, to: wallet, value: Attach.claim, stateInit: init, bounce: true, body }));
    await it1.next(); // the wallet forwarded the first ClaimRequest; it is "in flight"
    chain.now = T0 + 700; // the lock expired
    const it2 = await chain.sendMessageIter(internal({ from: alice.address, to: wallet, value: Attach.claim, bounce: true, body }));
    await it2.next(); // a second ClaimRequest with the same `claimedAtWallet`
    const rest: any[] = [];
    for await (const t of it1) rest.push(t);
    for await (const t of it2) rest.push(t);
    expect(rest.some((t) => t.inMessage?.body.beginParse().loadUint(32) === Op.claimSurplus)).toBe(true);
    expect(await balanceOf(alice.address)).toBe(E(100));
    expect(await supply()).toBe(E(100));
    expect(await minted()).toBe(E(100));
    // nobody else lost room under the promised total
    const bw = walletStateInit(bob.address, minter, eggWalletCode);
    await bob.send({ to: bw.address, value: Attach.claim, init: bw.init, body: askToClaimBody({ cumulative: E(1), proof: tree.proof(bob.address)!, root: rootCell(tree) }) });
    expect(await balanceOf(bob.address)).toBe(E(1));
  });

  it('a claim that can credit nothing is refused by the wallet (it never reaches the minter)', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const body = askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree) });
    await alice.send({ to: wallet, value: Attach.claim, init, body });
    const again = await alice.send({ to: wallet, value: Attach.claim, body });
    expect(exitOf(again.transactions, wallet)).toBe(Err.nothingToClaim);
    expect(await supply()).toBe(E(100));
  });

  // The bounds in contracts/contracts/fees-management.tolk. If a contract change makes a hop burn more than its bound, this fails.
  const BOUND = { ask: 9000, minter: 95000, credit: 12000, surplus: 8000 };

  it('the deepest proof allowed (64 steps) stays within the gas bounds, for every amount of TON attached', async () => {
    const d = deep(alice.address, E(100), 64);
    const proof = proofToCell(d.steps);
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const max = { ask: 0, minter: 0, credit: 0 };
    let credited = false;
    // from far too little to plenty: whatever is attached, either nothing is counted or exactly what is credited
    for (let v = 5_000_000n; v <= 80_000_000n; v += 2_500_000n) {
      const res = await alice.send({ to: wallet, value: v, init, bounce: true, body: askToClaimBody({ cumulative: E(100), proof, root: d.root }) });
      max.ask = Math.max(max.ask, gasOf(res.transactions, wallet, Op.askToClaim));
      max.minter = Math.max(max.minter, gasOf(res.transactions, minter, Op.claimRequest));
      max.credit = Math.max(max.credit, gasOf(res.transactions, wallet, Op.claimCredit));
      expect(await supply(), `value ${v}`).toBe(await balanceOf(alice.address));
      expect(await minted(), `value ${v}`).toBe(await balanceOf(alice.address));
      if ((await balanceOf(alice.address)) > 0n) {
        credited = true;
        break;
      }
      chain.now = (chain.now ?? T0) + 700;
    }
    expect(credited).toBe(true);
    // eslint-disable-next-line no-console
    console.log('gas at depth 64:', max);
    expect(max.ask).toBeLessThanOrEqual(BOUND.ask);
    expect(max.minter).toBeLessThanOrEqual(BOUND.minter);
    expect(max.credit).toBeLessThanOrEqual(BOUND.credit);
  });

  it('65 steps are refused', async () => {
    const d = deep(alice.address, E(100), 64);
    const steps = [...d.steps, { siblingHash: Buffer.alloc(32, 9), siblingSum: 1n, siblingOnRight: true }];
    let next: Cell | null = null;
    for (let i = Math.ceil(steps.length / 2) - 1; i >= 0; i--) {
      const chunk = steps.slice(i * 2, i * 2 + 2);
      const b = beginCell().storeUint(next ? 1 : 0, 1).storeUint(chunk.length, 2);
      for (const s of chunk) b.storeBuffer(s.siblingHash, 32).storeUint(s.siblingSum, 128).storeUint(s.siblingOnRight ? 1 : 0, 1);
      if (next) b.storeRef(next);
      next = b.endCell();
    }
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const res = await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(100), proof: next!, root: d.root }) });
    expect(exitOf(res.transactions, minter)).toBe(Err.proofTooDeep);
    expect(await supply()).toBe(0n);
  });

  it('claim-and-send and the crossed-claims path stay within the gas bounds; "claim and send" with too little TON still credits', async () => {
    const tree = three();
    const { init, address: wallet } = walletStateInit(alice.address, minter, eggWalletCode);
    const next = transferIntent({ amount: E(30), to: bob.address, excessesTo: alice.address, forwardTon: toNano('0.5'), comment: 'x'.repeat(100) });
    // the forward amount does not fit what is attached: the claim is credited, the transfer is skipped, the change returns
    const res = await alice.send({ to: wallet, value: Attach.claim, init, body: askToClaimBody({ cumulative: E(100), proof: tree.proof(alice.address)!, root: rootCell(tree), next }) });
    expect(await balanceOf(alice.address)).toBe(E(100));
    expect(await balanceOf(bob.address)).toBe(0n);
    expect(gasOf(res.transactions, wallet, Op.claimCredit)).toBeLessThanOrEqual(BOUND.credit);
    expect(gasOf(res.transactions, wallet, Op.askToClaim)).toBeLessThanOrEqual(BOUND.ask);

    // crossed claims for bob: measure the surplus hop
    const bw = walletStateInit(bob.address, minter, eggWalletCode);
    const body = askToClaimBody({ cumulative: E(1), proof: tree.proof(bob.address)!, root: rootCell(tree) });
    const a = await chain.sendMessageIter(internal({ from: bob.address, to: bw.address, value: Attach.claim, stateInit: bw.init, bounce: true, body }));
    await a.next();
    chain.now = T0 + 700;
    const b = await chain.sendMessageIter(internal({ from: bob.address, to: bw.address, value: Attach.claim, bounce: true, body }));
    await b.next();
    const rest: any[] = [];
    for await (const t of a) rest.push(t);
    for await (const t of b) rest.push(t);
    const g = { credit: Math.max(...rest.filter((t) => t.inMessage?.body.beginParse().loadUint(32) === Op.claimCredit).map((t) => Number(t.description.computePhase.gasUsed))), surplus: gasOf(rest, minter, Op.claimSurplus) };
    // eslint-disable-next-line no-console
    console.log('gas, crossed claims:', g, 'credit without transfer:', gasOf(res.transactions, wallet, Op.claimCredit));
    expect(g.credit).toBeLessThanOrEqual(BOUND.credit);
    expect(g.surplus).toBeGreaterThan(0);
    expect(g.surplus).toBeLessThanOrEqual(BOUND.surplus);
    expect(await supply()).toBe(E(101));
  });
});
void transferBody;
