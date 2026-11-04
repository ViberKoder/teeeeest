import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano, TupleReader } from '@ton/core';
import { findTransaction } from '@ton/test-utils';
import { keyPairFromSeed } from '@ton/crypto';
import { EggTree, eggMinterCode, eggWalletCode, minterStateInit, onchainMetadata, signRoot, signedRootCell, topUpBody, verifyEntitlement, walletStateInit } from '@egg/sdk';
import { eggClaim, eggTransfer, parseAddress, tonTransfer } from '../src/chain/actions';
import type { EggState } from '../src/chain/egg';
import type { OutMessage } from '../src/provider/types';

const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

/** vitest has no toHaveTransaction matcher, so assert through the helper the matcher uses. */
function expectTx(txs: Parameters<typeof findTransaction>[0], pattern: Parameters<typeof findTransaction>[1]) {
  expect(findTransaction(txs, pattern), `no transaction matching ${JSON.stringify(pattern, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`).toBeDefined();
}

/** What a wallet provider does with an OutMessage — here a sandbox treasury plays the user's wallet. */
async function sendAs(user: SandboxContract<TreasuryContract>, msgs: OutMessage[]) {
  let last: Awaited<ReturnType<typeof user.send>> | undefined;
  for (const m of msgs) last = await user.send({ to: m.to, value: m.value, bounce: m.bounce, body: m.body, init: m.init });
  return last!;
}

describe('messages built by the wallet app are accepted by the real (Tolk) contracts', () => {
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  const pub = keyPairFromSeed(Buffer.alloc(32, 77));
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let minter: Address;

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    [admin, alice, bob] = await Promise.all(['admin', 'alice', 'bob'].map((n) => chain.treasury(n)));
    const s = minterStateInit(
      { maxSupply: E(1_000_000), admin: admin.address, publisherKey: pub.publicKey, metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9 }) },
      eggMinterCode,
    );
    minter = s.address;
    await admin.send({ to: minter, value: toNano('1'), init: s.init, bounce: false, body: topUpBody() });
  });

  // the publisher signs a root; nothing is published on-chain
  const rootOf = (tree: EggTree, seq = 1n) => signRoot(minter, tree.treeRoot, tree.total, seq, pub.secretKey);

  const stateOf = async (owner: Address): Promise<{ s: EggState; init: ReturnType<typeof walletStateInit>['init'] }> => {
    const { init, address } = walletStateInit(owner, minter, eggWalletCode);
    const deployed = (await chain.getContract(address)).accountState?.type === 'active';
    let balance = 0n, claimed = 0n;
    if (deployed) {
      balance = new TupleReader((await chain.runGetMethod(address, 'get_wallet_data')).stack).readBigNumber();
      claimed = new TupleReader((await chain.runGetMethod(address, 'get_claim_state')).stack).readBigNumber();
    }
    return { s: { jettonWallet: address, deployed, balance, claimed, lockedUntil: 0 }, init };
  };

  it('first claim deploys the wallet from the app-built StateInit and credits exactly the proven amount', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(2500) }, { owner: bob.address, cumulative: E(40) }]);

    const { s, init } = await stateOf(alice.address);
    const tx = await sendAs(alice, eggClaim({ state: s, cumulative: E(2500), proof: tree.proof(alice.address)!, root: signedRootCell(rootOf(tree)), init }));
    expectTx(tx.transactions, { to: s.jettonWallet, success: true, deploy: true });
    expectTx(tx.transactions, { from: minter, to: s.jettonWallet, success: true });
    const after = (await stateOf(alice.address)).s;
    expect(after.balance).toBe(E(2500));
    expect(after.claimed).toBe(E(2500));
  });

  it('the proof the app checks locally is the same one the contract accepts', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(10) }, { owner: bob.address, cumulative: E(20) }]);
    const key = Buffer.from(new TupleReader((await chain.runGetMethod(minter, 'get_publisher_key')).stack).readBigNumber().toString(16).padStart(64, '0'), 'hex');
    const ent = {
      owner: alice.address.toRawString(), cumulative: E(10).toString(),
      proof: tree.proof(alice.address)!.toBoc().toString('base64'), root: rootOf(tree),
    };
    expect(verifyEntitlement(ent, minter, key)).toBe(true);
    expect(verifyEntitlement({ ...ent, cumulative: E(11).toString() }, minter, key)).toBe(false);
    expect(verifyEntitlement(ent, minter, Buffer.alloc(32, 9))).toBe(false);
  });

  it('a claim costs the user a few cents, the attached TON comes back, the jetton-wallet stays solvent', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(5) }, { owner: bob.address, cumulative: E(1) }]);
    const { s, init } = await stateOf(alice.address);
    const before = await alice.getBalance();
    await sendAs(alice, eggClaim({ state: s, cumulative: E(5), proof: tree.proof(alice.address)!, root: signedRootCell(rootOf(tree)), init }));
    const spent = before - (await alice.getBalance());
    expect(spent).toBeLessThan(toNano('0.03'));
    expect((await chain.getContract(s.jettonWallet)).balance).toBeGreaterThan(0n);
  });

  it('send with a comment: recipient wallet is created and the recipient is notified', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(500) }, { owner: bob.address, cumulative: E(1) }]);
    const a0 = await stateOf(alice.address);
    await sendAs(alice, eggClaim({ state: a0.s, cumulative: E(500), proof: tree.proof(alice.address)!, root: signedRootCell(rootOf(tree)), init: a0.init }));

    const { s } = await stateOf(alice.address);
    const tx = await sendAs(alice, eggTransfer({ owner: alice.address, state: s, to: bob.address, amount: E(100), comment: 'for coffee' }));
    const b = await stateOf(bob.address);
    expectTx(tx.transactions, { from: s.jettonWallet, to: b.s.jettonWallet, success: true });
    expectTx(tx.transactions, { from: b.s.jettonWallet, to: bob.address, op: 0x7362d09c });
    expect(b.s.balance).toBe(E(100));
    expect((await stateOf(alice.address)).s.balance).toBe(E(400));
  });

  it('TON transfer builder keeps the bounce flag of the address it was given', () => {
    const friendly = parseAddress(new Address(0, Buffer.alloc(32, 1)).toString({ bounceable: false }));
    expect(friendly?.bounceable).toBe(false);
    const [m] = tonTransfer({ to: friendly!, amount: 1n, comment: 'hi' });
    expect(m.bounce).toBe(false);
    expect(m.body).toBeDefined();
    expect(parseAddress('not an address')).toBeNull();
  });
});
