import { findTransaction } from '@ton/test-utils';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, Cell, toNano } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildClaim, EggMaster, EggWallet, offchainContent, signCert } from '@egg/contracts';
import { eggClaim, eggTransfer, parseAddress, tonTransfer } from '../src/chain/actions';
import type { OutMessage } from '../src/provider/types';
import type { EggState } from '../src/chain/egg';
import { eggWalletStateInit } from '@egg/contracts/wrappers/messages';

const boc = (n: string) => Cell.fromBoc(readFileSync(join(__dirname, '../../contracts/build', `${n}.boc`)))[0];
const T0 = 1_800_000_000;
const authority = keyPairFromSeed(Buffer.alloc(32, 1));
const hot = keyPairFromSeed(Buffer.alloc(32, 2));
const authorityInt = BigInt('0x' + authority.publicKey.toString('hex'));

/** vitest has no toHaveTransaction matcher, so assert through the same helper the matcher uses. */
function expectTx(txs: Parameters<typeof findTransaction>[0], pattern: Parameters<typeof findTransaction>[1]) {
  expect(findTransaction(txs, pattern), `no transaction matching ${JSON.stringify(pattern, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`).toBeDefined();
}

/** What a wallet provider does with an OutMessage — here the sandbox treasury plays the user's wallet. */
async function sendAs(user: SandboxContract<TreasuryContract>, msgs: OutMessage[]) {
  let last: Awaited<ReturnType<typeof user.send>> | undefined;
  for (const m of msgs) {
    last = await user.send({ to: m.to, value: m.value, bounce: m.bounce, body: m.body, init: m.init });
  }
  return last!;
}

describe('messages built by the wallet app are accepted by the real contracts', () => {
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let alice: SandboxContract<TreasuryContract>;
  let bob: SandboxContract<TreasuryContract>;
  let master: SandboxContract<EggMaster>;
  let walletCode: Cell;

  const claimFor = (owner: SandboxContract<TreasuryContract>, cumulative: bigint) =>
    buildClaim({
      master: master.address,
      owner: owner.address,
      cumulative,
      validUntil: T0 + 600,
      signerSecret: hot.secretKey,
      cert: signCert(authority.secretKey, master.address, hot.publicKey, 1, T0 + 86_400 * 30),
    });

  const stateOf = async (owner: SandboxContract<TreasuryContract>): Promise<{ s: EggState; init: { code: Cell; data: Cell } }> => {
    const { init, address } = eggWalletStateInit({ owner: owner.address, master: master.address, walletCode, authority: authorityInt });
    const deployed = (await chain.getContract(address)).accountState?.type === 'active';
    let balance = 0n;
    let claimed = 0n;
    if (deployed) {
      const w = chain.openContract(EggWallet.createFromAddress(address));
      balance = (await w.getWalletData()).balance;
      claimed = (await w.getClaimState()).claimed;
    }
    return { s: { jettonWallet: address, deployed, balance, claimed }, init };
  };

  beforeEach(async () => {
    chain = await Blockchain.create();
    chain.now = T0;
    admin = await chain.treasury('admin');
    alice = await chain.treasury('alice');
    bob = await chain.treasury('bob');
    walletCode = boc('EggWallet');
    master = chain.openContract(
      EggMaster.createFromConfig(
        { maxSupply: 0n, admin: admin.address, content: offchainContent('https://x.test/j.json'), walletCode, authority: authorityInt },
        boc('EggMaster'),
      ),
    );
    await master.sendDeploy(admin.getSender());
  });

  it('first claim deploys the wallet from the app-built StateInit', async () => {
    const { s, init } = await stateOf(alice);
    const tx = await sendAs(alice, eggClaim({ state: s, claim: claimFor(alice, toNano('2500')), init }));
    expectTx(tx.transactions, { to: s.jettonWallet, success: true, deploy: true });
    const after = await stateOf(alice);
    expect(after.s.balance).toBe(toNano('2500'));
    expect(after.s.claimed).toBe(toNano('2500'));
    expect((await master.getJettonData()).totalSupply).toBe(toNano('2500'));
  });

  it('send with a comment and a claim attached: one transaction, recipient is notified', async () => {
    const { s, init } = await stateOf(alice);
    const tx = await sendAs(
      alice,
      eggTransfer({ owner: alice.address, state: s, to: bob.address, amount: toNano('100'), comment: 'for coffee', claim: claimFor(alice, toNano('500')), init }),
    );
    expectTx(tx.transactions, { to: s.jettonWallet, success: true });
    const a = await stateOf(alice);
    const b = await stateOf(bob);
    expect(a.s.balance).toBe(toNano('400'));
    expect(b.s.balance).toBe(toNano('100'));
    expectTx(tx.transactions, { from: b.s.jettonWallet, to: bob.address, op: 0x7362d09c });
  });

  it('plain send of already-claimed tokens works and leaves the wallet contract solvent', async () => {
    const first = await stateOf(alice);
    await sendAs(alice, eggClaim({ state: first.s, claim: claimFor(alice, toNano('50')), init: first.init }));
    const before = (await chain.getContract(first.s.jettonWallet)).balance;

    const { s, init } = await stateOf(alice);
    const tx = await sendAs(alice, eggTransfer({ owner: alice.address, state: s, to: bob.address, amount: toNano('20'), init }));
    expectTx(tx.transactions, { to: s.jettonWallet, success: true });

    const after = (await chain.getContract(first.s.jettonWallet)).balance;
    // The user's attached TON pays for the operation; the jetton-wallet's own reserve is not drained.
    expect(after).toBeGreaterThanOrEqual(before - toNano('0.002'));
    expect((await stateOf(bob)).s.balance).toBe(toNano('20'));
  });

  it('most of the attached TON comes back as excess', async () => {
    const { s, init } = await stateOf(alice);
    const start = await alice.getBalance();
    await sendAs(alice, eggClaim({ state: s, claim: claimFor(alice, toNano('1')), init }));
    const spent = start - (await alice.getBalance());
    expect(spent).toBeLessThan(toNano('0.07'));
  });

  it('TON transfer builder keeps bounce semantics of the address it was given', () => {
    const friendly = parseAddress(new Address(0, Buffer.alloc(32, 1)).toString({ bounceable: false }));
    expect(friendly?.bounceable).toBe(false);
    const [m] = tonTransfer({ to: friendly!, amount: 1n, comment: 'hi' });
    expect(m.bounce).toBe(false);
    expect(m.body).toBeDefined();
    expect(parseAddress('not an address')).toBeNull();
  });
});
