import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, Dictionary, toNano, TupleReader } from '@ton/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  askToClaimBody, Attach, burnBody, commentPayload, EggTree, eggMinterCode, eggWalletCode, Err, minterStateInit,
  onchainMetadata, publishRootBody, transferBody, verifyProof, walletStateInit, changePublisherBody,
} from '../src';

const T0 = 1_800_000_000;
const E = (n: number) => toNano(String(n));

describe('TypeScript SDK against the Tolk contracts built by Acton', () => {
  let chain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let publisher: SandboxContract<TreasuryContract>;
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
    [admin, publisher, alice, bob] = await Promise.all(['admin', 'publisher', 'alice', 'bob'].map((n) => chain.treasury(n)));
    const { init, address } = minterStateInit(
      {
        maxSupply: E(1_000_000),
        admin: admin.address,
        publisher: publisher.address,
        metadata: onchainMetadata({ name: 'Egg', symbol: 'EGG', decimals: 9, description: 'test', image: 'https://x.test/egg.png' }),
      },
      eggMinterCode,
    );
    minter = address;
    await admin.send({ to: minter, value: toNano('1'), init, bounce: false, body: beginCell().storeUint(0xd372158c, 32).endCell() });
  });

  const publish = async (epoch: number, tree: EggTree, from = publisher) =>
    from.send({ to: minter, value: toNano('0.1'), body: publishRootBody({ epoch, treeRoot: tree.treeRoot, total: tree.total }) });

  const claim = async (owner: SandboxContract<TreasuryContract>, epoch: number, tree: EggTree) => {
    const { init, address } = walletStateInit(owner.address, minter, eggWalletCode);
    const deployed = (await chain.getContract(address)).accountState?.type === 'active';
    const cumulative = tree.cumulativeOf(owner.address);
    const res = await owner.send({
      to: address,
      value: Attach.claim,
      bounce: true,
      init: deployed ? undefined : init,
      body: askToClaimBody({ epoch, cumulative, proof: tree.proof(owner.address)! }),
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
    expect((await get(minter, 'get_publisher')).readAddress().equals(publisher.address)).toBe(true);
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

  it('publish → claim with proofs built by the SDK: one tree, many users, exact amounts', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, (_, i) => chain.treasury('u' + i)));
    const tree = new EggTree([
      { owner: alice.address, cumulative: E(2500) },
      { owner: bob.address, cumulative: E(40) },
      ...users.map((u, i) => ({ owner: u.address, cumulative: E(10 + i) })),
    ]);
    const pub = await publish(1, tree);
    expect(exitOf(pub.transactions, minter)).toBe(0);

    // the SDK's verification agrees with what is stored on-chain
    const onchain = (await get(minter, 'get_root', [{ type: 'int', value: 1n }])).readBigNumber();
    expect(onchain.toString(16).padStart(64, '0')).toBe(tree.commitment.toString('hex'));
    expect(verifyProof(alice.address, E(2500), tree.proof(alice.address)!, tree.commitment)).toBe(true);

    for (const u of [alice, bob, ...users]) {
      const { res, wallet } = await claim(u, 1, tree);
      expect(exitOf(res.transactions, wallet), `claim of ${u.address}`).toBe(0);
      expect(await balanceOf(u.address)).toBe(tree.cumulativeOf(u.address));
    }
    const supply = (await get(minter, 'get_jetton_data')).readBigNumber();
    expect(supply).toBe(tree.total);
  });

  it('a claim, including deploying the wallet, costs the user less than 0.1 TON', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    await publish(1, tree);
    const before = await alice.getBalance();
    await claim(alice, 1, tree);
    const spent = before - (await alice.getBalance());
    // eslint-disable-next-line no-console
    console.log('claim cost (TON):', Number(spent) / 1e9);
    expect(spent).toBeLessThan(toNano('0.1'));
    expect(await balanceOf(alice.address)).toBe(E(100));
  });

  it('claimed EGG transfers with a comment, and burning lowers the supply', async () => {
    const tree = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    await publish(1, tree);
    const { wallet } = await claim(alice, 1, tree);

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

  it('the commitment is binding: what is published stays claimable after a later root drops the user', async () => {
    const t1 = new EggTree([{ owner: alice.address, cumulative: E(100) }, { owner: bob.address, cumulative: E(1) }]);
    await publish(1, t1);
    const t2 = new EggTree([{ owner: bob.address, cumulative: E(1) }, { owner: publisher.address, cumulative: E(100) }]);
    await publish(2, t2);
    const { res, wallet } = await claim(alice, 1, t1);
    expect(exitOf(res.transactions, wallet)).toBe(0);
    expect(await balanceOf(alice.address)).toBe(E(100));
  });

  it('roots can be published only by the publisher, which only the admin can change', async () => {
    const t = new EggTree([{ owner: alice.address, cumulative: E(1) }]);
    const bad = await publish(1, t, alice);
    expect(exitOf(bad.transactions, minter)).toBe(Err.notPublisher);

    const rogue = await admin.send({ to: minter, value: toNano('0.05'), body: changePublisherBody(bob.address) });
    expect(exitOf(rogue.transactions, minter)).toBe(0);
    expect((await get(minter, 'get_publisher')).readAddress().equals(bob.address)).toBe(true);
    const old = await publish(1, t);
    expect(exitOf(old.transactions, minter)).toBe(Err.notPublisher);
  });
});
void Cell;
