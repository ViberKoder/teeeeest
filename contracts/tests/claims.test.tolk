import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@contracts/errors"
import "@contracts/merkle"
import "@contracts/messages"
import "@wrappers/EggMinter.gen"
import "@wrappers/EggWallet.gen"
import "test-utils"

const ALICE_EGGS = 100000000000 // 100 EGG
const BOB_EGGS = 50000000000 // 50 EGG

get fun `test publish: only the publisher, in order, with a bounded total`() {
    val env = setupMinter(MAX_SUPPLY, grams("200"));
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);

    val stranger = env.minter.sendPublishRoot(env.alice.address, 0, 1, t.root, t.total, { value: grams("0.1") });
    expect(stranger).toHaveFailedTx<PublishRoot>({ to: env.minter.address, exitCode: Errors.NotPublisher });

    val skipped = publish(env, 2, t.root, t.total);
    expect(skipped).toHaveFailedTx<PublishRoot>({ to: env.minter.address, exitCode: Errors.EpochOutOfOrder });

    val tooBig = publish(env, 1, t.root, MAX_SUPPLY + 1);
    expect(tooBig).toHaveFailedTx<PublishRoot>({ to: env.minter.address, exitCode: Errors.SupplyExceeded });

    val ok = publish(env, 1, t.root, t.total);
    expect(ok).toHaveSuccessfulTx<PublishRoot>({ to: env.minter.address });
    expect(env.minter.getLastEpoch()).toEqual(1);
    val record = env.minter.getRoot(1);
    expect(record.total).toEqual(t.total);
    expect(record.commitment).toEqual(rootCommitment(t.root, t.total));

    // totals may never go down
    val down = publish(env, 2, t.root, t.total - 1);
    expect(down).toHaveFailedTx<PublishRoot>({ to: env.minter.address, exitCode: Errors.TotalDecreased });
}

get fun `test publish: growth limit bounds a misbehaving publisher`() {
    // at most 160 EGG may be promised per hour, even though the cap is 1000
    val env = setupMinter(MAX_SUPPLY, grams("160"));
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    expect(publish(env, 1, t.root, t.total)).toHaveSuccessfulTx<PublishRoot>({ to: env.minter.address });

    val big = twoLeafTree(env.alice.address, grams("200"), env.bob.address, BOB_EGGS);
    val res = publish(env, 2, big.root, big.total);
    expect(res).toHaveFailedTx<PublishRoot>({ to: env.minter.address, exitCode: Errors.GrowthLimit });

    // an hour later the window has reset
    testing.setNow(testing.getNow() + 3601);
    expect(publish(env, 2, big.root, big.total)).toHaveSuccessfulTx<PublishRoot>({ to: env.minter.address });
}

get fun `test claim: a published root credits exactly what the proof says, and supply follows`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t.root, t.total);

    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val res = claim(wallet, env.alice.address, 1, ALICE_EGGS, t.aliceProof);
    expect(res).toHaveSuccessfulTx<AskToClaim>({ from: env.alice.address, to: wallet.address });
    expect(res).toHaveSuccessfulTx<ClaimRequest>({ from: wallet.address, to: env.minter.address });
    expect(res).toHaveSuccessfulTx<ClaimCredit>({ from: env.minter.address, to: wallet.address });

    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
    expect(wallet.getClaimState().claimed).toEqual(ALICE_EGGS);
    expect(wallet.getClaimState().claimLockedUntil).toEqual(0);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS);

    // and the other leaf of the same tree is independently claimable
    val bobWallet = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(bobWallet, env.bob.address, 1, BOB_EGGS, t.bobProof);
    expect(bobWallet.getWalletData().jettonBalance).toEqual(BOB_EGGS);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS + BOB_EGGS);
}

get fun `test claim: proofs bind owner, amount and the declared total`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t.root, t.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    // someone else's proof
    val wrongProof = claim(wallet, env.alice.address, 1, ALICE_EGGS, t.bobProof);
    expect(wrongProof).toHaveFailedTx<ClaimRequest>({ to: env.minter.address, exitCode: Errors.ProofMismatch });
    // the minter refused, so the wallet is unlocked again and nothing was credited
    expect(wallet.getClaimState().claimLockedUntil).toEqual(0);
    expect(wallet.getWalletData().jettonBalance).toEqual(0);

    // a different amount than the tree holds
    val wrongAmount = claim(wallet, env.alice.address, 1, ALICE_EGGS + 1, t.aliceProof);
    expect(wrongAmount).toHaveFailedTx<ClaimRequest>({ to: env.minter.address, exitCode: Errors.ProofMismatch });

    // an epoch that was never published
    val unknown = claim(wallet, env.alice.address, 7, ALICE_EGGS, t.aliceProof);
    expect(unknown).toHaveFailedTx<ClaimRequest>({ to: env.minter.address, exitCode: Errors.UnknownEpoch });

    // the real thing still works afterwards
    claim(wallet, env.alice.address, 1, ALICE_EGGS, t.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
}

get fun `test claim: a root that lies about its total can never be proven`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    // publisher declares a smaller total than the tree really sums to
    publish(env, 1, t.root, t.total - 1);

    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val res = claim(wallet, env.alice.address, 1, ALICE_EGGS, t.aliceProof);
    expect(res).toHaveFailedTx<ClaimRequest>({ to: env.minter.address, exitCode: Errors.ProofMismatch });
}

get fun `test claim: repeating a claim never pays twice, a larger one pays the difference`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t1.root, t1.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    claim(wallet, env.alice.address, 1, ALICE_EGGS, t1.aliceProof);
    claim(wallet, env.alice.address, 1, ALICE_EGGS, t1.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS);

    // epoch 2: alice earned 40 more
    val t2 = twoLeafTree(env.alice.address, ALICE_EGGS + 40000000000, env.bob.address, BOB_EGGS);
    publish(env, 2, t2.root, t2.total);
    claim(wallet, env.alice.address, 2, ALICE_EGGS + 40000000000, t2.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS + 40000000000);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS + 40000000000);
}

get fun `test claim: what was published stays claimable forever, even if a later root drops it`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t1.root, t1.total);

    // the project "forgets" alice in epoch 2 (a revocation attempt)
    val t2 = twoLeafTree(env.bob.address, BOB_EGGS, env.bob.address, 1);
    publish(env, 2, t2.root, t1.total);

    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(wallet, env.alice.address, 1, ALICE_EGGS, t1.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
}

get fun `test claim: the supply cap is enforced on-chain at claim time`() {
    val env = setupMinter(120000000000, 120000000000); // cap 120 EGG
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    // promised 150 > cap 120: refused at publication already
    expect(publish(env, 1, t.root, t.total)).toHaveFailedTx<PublishRoot>({
        to: env.minter.address,
        exitCode: Errors.SupplyExceeded,
    });

    // an honest tree within the cap
    val ok = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, 20000000000);
    publish(env, 1, ok.root, ok.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(aw, env.alice.address, 1, ALICE_EGGS, ok.aliceProof);
    claim(bw, env.bob.address, 1, 20000000000, ok.bobProof);
    expect(env.minter.getJettonData().totalSupply).toEqual(120000000000);
    expect(env.minter.getJettonData().mintable).toEqual(false);
}

get fun `test claim: only the wallet owner can ask, and not while another claim is in flight`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t.root, t.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    val notOwner = claim(wallet, env.bob.address, 1, ALICE_EGGS, t.aliceProof);
    expect(notOwner).toHaveFailedTx<AskToClaim>({ to: wallet.address, exitCode: Errors.NotOwner });

    val lowGas = wallet.sendAskToClaim(env.alice.address, 0, 1, ALICE_EGGS, t.aliceProof, { value: 10000000 });
    expect(lowGas).toHaveFailedTx<AskToClaim>({ to: wallet.address, exitCode: Errors.NotEnoughGas });

    // a wallet whose lock is still running refuses a second request
    val locked = EggWallet.fromStorage({
        jettonBalance: 0,
        ownerAddress: env.bob.address,
        minterAddress: env.minter.address,
        claimed: 0,
        claimLockedUntil: testing.getNow() + 500,
    });
    net.send(env.bob.address, createMessage({ bounce: false, value: grams("0.5"), dest: { stateInit: locked.stateInit!, workchain: 0 }, body: TopUpGrams {} }));
    val again = claim(locked, env.bob.address, 1, BOB_EGGS, t.bobProof);
    expect(again).toHaveFailedTx<AskToClaim>({ to: locked.address, exitCode: Errors.ClaimInProgress });
}

get fun `test tokens: claimed EGG moves like any jetton and burns reduce supply`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t.root, t.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, 1, ALICE_EGGS, t.aliceProof);

    val send = aw.sendAskToTransfer(
        env.alice.address, 0, 30000000000, env.bob.address, env.alice.address, null, 10000000,
        PayloadInline { value: beginCell().toSlice() },
        { value: TRANSFER_VALUE },
    );
    expect(send).toHaveSuccessfulTx<AskToTransfer>({ from: env.alice.address, to: aw.address });
    expect(aw.getWalletData().jettonBalance).toEqual(ALICE_EGGS - 30000000000);
    expect(userWallet(env.minter, env.bob.address).getWalletData().jettonBalance).toEqual(30000000000);

    val burn = aw.sendAskToBurn(env.alice.address, 0, 20000000000, env.alice.address, null, { value: BURN_VALUE });
    expect(burn).toHaveSuccessfulTx<AskToBurn>({ from: env.alice.address, to: aw.address });
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS - 20000000000);
}

get fun `test governance: admin rotates the publisher, non-admin cannot, a dropped admin is final`() {
    val env = setupMinter();
    val rogue = env.alice.address;
    val denied = env.minter.sendChangePublisher(rogue, 0, rogue, { value: grams("0.05") });
    expect(denied).toHaveFailedTx<ChangePublisher>({ to: env.minter.address, exitCode: Errors.NotAdmin });

    val ok = env.minter.sendChangePublisher(env.admin.address, 0, env.bob.address, { value: grams("0.05") });
    expect(ok).toHaveSuccessfulTx<ChangePublisher>({ to: env.minter.address });
    expect(env.minter.getPublisher()).toEqual(env.bob.address);

    // the old publisher is out
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    expect(publish(env, 1, t.root, t.total)).toHaveFailedTx<PublishRoot>({
        to: env.minter.address,
        exitCode: Errors.NotPublisher,
    });

    val drop = env.minter.sendDropMinterAdmin(env.admin.address, 0, { value: grams("0.05") });
    expect(drop).toHaveSuccessfulTx<DropMinterAdmin>({ to: env.minter.address });
    val after = env.minter.sendChangePublisher(env.admin.address, 0, env.alice.address, { value: grams("0.05") });
    // with the admin dropped, `adminAddress!` on null aborts (TVM type-check error 7): nothing can be changed any more
    expect(after).toHaveFailedTx<ChangePublisher>({ to: env.minter.address, exitCode: 7 });
    expect(env.minter.getPublisher()).toEqual(env.bob.address);
}

get fun `test proof: depth beyond one cell is followed through the chain`() {
    // four-leaf tree (a b | c d): proof for `a` is two steps, stored in one cell, and for 3+ steps in a chain
    val env = setupMinter();
    val a = env.alice.address;
    val b = env.bob.address;
    val c = env.admin.address;
    val d = env.publisher.address;
    val la = leafHash(a, 10); val lb = leafHash(b, 20); val lc = leafHash(c, 30); val ld = leafHash(d, 40);
    val nab = nodeHash(la, 10, lb, 20);
    val ncd = nodeHash(lc, 30, ld, 40);
    val root = nodeHash(nab, 30, ncd, 70);

    // chain: [hasNext=1, count=1, step(lb)] -> [hasNext=0, count=1, step(ncd)]
    val tail = beginCell().storeUint(0, 1).storeUint(1, 2).storeUint(ncd, 256).storeUint(70, 128).storeUint(1, 1).endCell();
    val head = beginCell().storeUint(1, 1).storeUint(1, 2).storeUint(lb, 256).storeUint(20, 128).storeUint(1, 1).storeRef(tail).endCell();

    publish(env, 1, root, 100);
    val wallet = deployUserWallet(env.minter, a, a);
    claim(wallet, a, 1, 10, head);
    expect(wallet.getWalletData().jettonBalance).toEqual(10);
}

get fun `test supply: what was ever created stays within the newest published total`() {
    // a publisher that promises the same total to different people in different roots cannot mint more than that total
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    publish(env, 1, t1.root, t1.total);
    val t2 = twoLeafTree(env.admin.address, t1.total, env.bob.address, 0);
    testing.setNow(testing.getNow() + 3601);
    publish(env, 2, t2.root, t2.total);

    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(aw, env.alice.address, 1, ALICE_EGGS, t1.aliceProof);
    claim(bw, env.bob.address, 1, BOB_EGGS, t1.bobProof);
    expect(env.minter.getTotalMinted()).toEqual(t1.total);

    val cw = deployUserWallet(env.minter, env.admin.address, env.admin.address);
    claim(cw, env.admin.address, 2, t1.total, t2.aliceProof);
    expect(cw.getWalletData().jettonBalance).toEqual(0);
    expect(env.minter.getTotalMinted()).toEqual(t1.total);
    expect(env.minter.getJettonData().totalSupply).toEqual(t1.total);
}

get fun `test governance: limits can only be tightened`() {
    val env = setupMinter(MAX_SUPPLY, 500000000000);
    val looser = env.minter.sendSetLimits(env.admin.address, 0, MAX_SUPPLY, 3600, 0, { value: grams("0.05") });
    expect(looser).toHaveFailedTx<SetLimits>({ to: env.minter.address, exitCode: Errors.LimitsLoosened });
    val tighter = env.minter.sendSetLimits(env.admin.address, 0, 100000000000, 7200, 60, { value: grams("0.05") });
    expect(tighter).toHaveSuccessfulTx<SetLimits>({ to: env.minter.address });
}
