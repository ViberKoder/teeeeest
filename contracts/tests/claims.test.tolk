import "@acton/crypto"
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

get fun `test claim: a signed root credits exactly what the proof says, and supply follows`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val root = signRoot(env, 1, t.root, t.total);

    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val res = claim(wallet, env.alice.address, root, ALICE_EGGS, t.aliceProof);
    expect(res).toHaveSuccessfulTx<AskToClaim>({ from: env.alice.address, to: wallet.address });
    expect(res).toHaveSuccessfulTx<ClaimRequest>({ from: wallet.address, to: env.minter.address });
    expect(res).toHaveSuccessfulTx<ClaimCredit>({ from: env.minter.address, to: wallet.address });

    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
    expect(wallet.getClaimState().claimed).toEqual(ALICE_EGGS);
    expect(wallet.getClaimState().claimLockedUntil).toEqual(0);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS);
    expect(env.minter.getMaxTotal()).toEqual(t.total);

    // the other leaf of the same root is independently claimable, with the same signed root
    val bobWallet = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(bobWallet, env.bob.address, root, BOB_EGGS, t.bobProof);
    expect(bobWallet.getWalletData().jettonBalance).toEqual(BOB_EGGS);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS + BOB_EGGS);
}

get fun `test claim: only the publisher's signature makes a root; proofs bind owner, amount and the signed total`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val root = signRoot(env, 1, t.root, t.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    // a root signed by someone else
    val stranger = crypto.seedToKeyPair(7654321);
    val forged = signRootWith(stranger.privateKey, env.minter.address, 1, t.root, t.total);
    expect(claim(wallet, env.alice.address, forged, ALICE_EGGS, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.BadSignature,
    });
    // a signature made for ANOTHER minter does not work here
    val other = signRootWith(env.kp.privateKey, env.bob.address, 1, t.root, t.total);
    expect(claim(wallet, env.alice.address, other, ALICE_EGGS, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.BadSignature,
    });
    // the minter refused, so the wallet is unlocked again and nothing was credited
    expect(wallet.getClaimState().claimLockedUntil).toEqual(0);
    expect(wallet.getWalletData().jettonBalance).toEqual(0);

    // someone else's proof, or a different amount than the tree holds
    expect(claim(wallet, env.alice.address, root, ALICE_EGGS, t.bobProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.ProofMismatch,
    });
    expect(claim(wallet, env.alice.address, root, ALICE_EGGS + 1, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.ProofMismatch,
    });
    // a signed root that lies about its total can never be proven
    val lying = signRoot(env, 1, t.root, t.total - 1);
    expect(claim(wallet, env.alice.address, lying, ALICE_EGGS, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.ProofMismatch,
    });

    // the real thing still works afterwards
    claim(wallet, env.alice.address, root, ALICE_EGGS, t.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
}

get fun `test limits: growth is bounded however many roots the publisher signs`() {
    // at most 160 EGG of new promises per hour, even though the cap is 1000
    val env = setupMinter(MAX_SUPPLY, 160000000000);
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, signRoot(env, 1, t1.root, t1.total), ALICE_EGGS, t1.aliceProof);
    expect(env.minter.getMaxTotal()).toEqual(t1.total);

    // a root that promises 100 EGG more would push this hour's growth to 250 > 160
    val t2 = twoLeafTree(env.alice.address, ALICE_EGGS + 100000000000, env.bob.address, BOB_EGGS);
    val big = signRoot(env, 2, t2.root, t2.total);
    expect(claim(aw, env.alice.address, big, ALICE_EGGS + 100000000000, t2.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.GrowthLimit,
    });
    expect(env.minter.getMaxTotal()).toEqual(t1.total);

    // an hour later the window has reset
    testing.setNow(testing.getNow() + 3601);
    claim(aw, env.alice.address, big, ALICE_EGGS + 100000000000, t2.aliceProof);
    expect(env.minter.getMaxTotal()).toEqual(t2.total);

    // and nothing above the cap, ever
    val t3 = twoLeafTree(env.alice.address, MAX_SUPPLY + 1, env.bob.address, 0);
    testing.setNow(testing.getNow() + 7200);
    expect(claim(aw, env.alice.address, signRoot(env, 3, t3.root, t3.total), MAX_SUPPLY + 1, t3.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.SupplyExceeded,
    });
}

get fun `test claim: repeating a claim never pays twice, a larger one pays the difference`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val r1 = signRoot(env, 1, t1.root, t1.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    claim(wallet, env.alice.address, r1, ALICE_EGGS, t1.aliceProof);
    claim(wallet, env.alice.address, r1, ALICE_EGGS, t1.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS);

    // later: alice earned 40 more (a new signed root, nothing published)
    val t2 = twoLeafTree(env.alice.address, ALICE_EGGS + 40000000000, env.bob.address, BOB_EGGS);
    claim(wallet, env.alice.address, signRoot(env, 2, t2.root, t2.total), ALICE_EGGS + 40000000000, t2.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS + 40000000000);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS + 40000000000);
}

get fun `test claim: a signed root stays valid forever, even when later roots drop the player`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val r1 = signRoot(env, 1, t1.root, t1.total);
    // the project "forgets" alice in a later root, and someone claims with it first
    val t2 = twoLeafTree(env.bob.address, BOB_EGGS, env.bob.address, 1);
    val r2 = signRoot(env, 2, t2.root, t2.total);
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(bw, env.bob.address, r2, BOB_EGGS, t2.aliceProof);
    expect(env.minter.getLastSeq()).toEqual(2);

    // days later, with the older root she was given:
    testing.setNow(testing.getNow() + 10 * 24 * 3600);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(wallet, env.alice.address, r1, ALICE_EGGS, t1.aliceProof);
    expect(wallet.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
}

get fun `test supply: everything ever created stays within the highest total promised`() {
    // a publisher that promises the same total to different people in different roots cannot mint more than that total
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val t2 = twoLeafTree(env.admin.address, t1.total, env.bob.address, 0);
    val r1 = signRoot(env, 1, t1.root, t1.total);
    val r2 = signRoot(env, 2, t2.root, t2.total);

    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(aw, env.alice.address, r1, ALICE_EGGS, t1.aliceProof);
    claim(bw, env.bob.address, r1, BOB_EGGS, t1.bobProof);
    expect(env.minter.getTotalMinted()).toEqual(t1.total);

    val cw = deployUserWallet(env.minter, env.admin.address, env.admin.address);
    expect(claim(cw, env.admin.address, r2, t1.total, t2.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.SupplyExceeded,
    });
    expect(cw.getWalletData().jettonBalance).toEqual(0);
    expect(env.minter.getTotalMinted()).toEqual(t1.total);
}

get fun `test supply: two different roots for the same slot are refused`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val t2 = twoLeafTree(env.admin.address, t1.total, env.bob.address, 0);
    val a = signRoot(env, 5, t1.root, t1.total);
    val b = signRoot(env, 5, t2.root, t2.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, a, ALICE_EGGS, t1.aliceProof);
    expect(env.minter.getLastSeq()).toEqual(5);

    val cw = deployUserWallet(env.minter, env.admin.address, env.admin.address);
    expect(claim(cw, env.admin.address, b, t1.total, t2.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.Equivocation,
    });
    // the same root is of course fine again
    claim(deployUserWallet(env.minter, env.bob.address, env.bob.address), env.bob.address, a, BOB_EGGS, t1.bobProof);
}

get fun `test claim: the supply cap is enforced on-chain at claim time`() {
    val env = setupMinter(120000000000, 120000000000); // cap 120 EGG
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    // promised 150 > cap 120: refused
    expect(claim(aw, env.alice.address, signRoot(env, 1, t.root, t.total), ALICE_EGGS, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.SupplyExceeded,
    });

    // an honest tree within the cap
    val ok = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, 20000000000);
    val root = signRoot(env, 2, ok.root, ok.total);
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(aw, env.alice.address, root, ALICE_EGGS, ok.aliceProof);
    claim(bw, env.bob.address, root, 20000000000, ok.bobProof);
    expect(env.minter.getJettonData().totalSupply).toEqual(120000000000);
    expect(env.minter.getJettonData().mintable).toEqual(false);
}

get fun `test claim: only the wallet owner can ask, and not while another claim is in flight`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val root = signRoot(env, 1, t.root, t.total);
    val wallet = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    val notOwner = claim(wallet, env.bob.address, root, ALICE_EGGS, t.aliceProof);
    expect(notOwner).toHaveFailedTx<AskToClaim>({ to: wallet.address, exitCode: Errors.NotOwner });

    val lowGas = wallet.sendAskToClaim(env.alice.address, 0, ALICE_EGGS, t.aliceProof, root, null, { value: 10000000 });
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
    val again = claim(locked, env.bob.address, root, BOB_EGGS, t.bobProof);
    expect(again).toHaveFailedTx<AskToClaim>({ to: locked.address, exitCode: Errors.ClaimInProgress });
}

get fun `test tokens: claimed EGG moves like any jetton and burns reduce supply`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, signRoot(env, 1, t.root, t.total), ALICE_EGGS, t.aliceProof);

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

get fun `test governance: the signing key rotates, the old key keeps only what it promised, limits only tighten`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val old = signRoot(env, 1, t.root, t.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, old, ALICE_EGGS, t.aliceProof); // maxTotal = 150

    val newKp = crypto.seedToKeyPair(99887766);
    val denied = env.minter.sendChangePublisherKey(env.alice.address, 0, newKp.publicKey, { value: grams("0.05") });
    expect(denied).toHaveFailedTx<ChangePublisherKey>({ to: env.minter.address, exitCode: Errors.NotAdmin });
    expect(env.minter.sendChangePublisherKey(env.admin.address, 0, 0, { value: grams("0.05") })).toHaveFailedTx<ChangePublisherKey>({
        to: env.minter.address,
        exitCode: Errors.ZeroKey,
    });
    val ok = env.minter.sendChangePublisherKey(env.admin.address, 0, newKp.publicKey, { value: grams("0.05") });
    expect(ok).toHaveSuccessfulTx<ChangePublisherKey>({ to: env.minter.address });
    expect(env.minter.getPublisherKey()).toEqual(newKp.publicKey);
    expect(env.minter.getLegacyKey().legacyCap).toEqual(t.total);

    // what the old key signed before stays claimable (bob, with the very same root)
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(bw, env.bob.address, old, BOB_EGGS, t.bobProof);
    expect(bw.getWalletData().jettonBalance).toEqual(BOB_EGGS);

    // but a stolen old key can not promise more than it had
    val more = twoLeafTree(env.alice.address, ALICE_EGGS + 1000000000, env.bob.address, BOB_EGGS);
    val inflated = signRoot(env, 2, more.root, more.total); // signed with the OLD key (env.kp)
    expect(claim(aw, env.alice.address, inflated, ALICE_EGGS + 1000000000, more.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.LegacyCap,
    });
    // the new key can
    val fresh = signRootWith(newKp.privateKey, env.minter.address, 3, more.root, more.total);
    claim(aw, env.alice.address, fresh, ALICE_EGGS + 1000000000, more.aliceProof);
    expect(aw.getWalletData().jettonBalance).toEqual(ALICE_EGGS + 1000000000);

    // limits only tighten
    val looser = env.minter.sendSetLimits(env.admin.address, 0, MAX_SUPPLY + 1, 3600, MAX_SUPPLY, MAX_SUPPLY, { value: grams("0.05") });
    expect(looser).toHaveFailedTx<SetLimits>({ to: env.minter.address, exitCode: Errors.LimitsLoosened });
    val tighter = env.minter.sendSetLimits(env.admin.address, 0, 100000000000, 7200, MAX_SUPPLY, MAX_SUPPLY, { value: grams("0.05") });
    expect(tighter).toHaveSuccessfulTx<SetLimits>({ to: env.minter.address });

    // a dropped admin is final
    val drop = env.minter.sendDropMinterAdmin(env.admin.address, 0, { value: grams("0.05") });
    expect(drop).toHaveSuccessfulTx<DropMinterAdmin>({ to: env.minter.address });
    val after = env.minter.sendChangePublisherKey(env.admin.address, 0, env.kp.publicKey, { value: grams("0.05") });
    // with the admin dropped, `adminAddress!` on null aborts (TVM type-check error 7): nothing can be changed any more
    expect(after).toHaveFailedTx<ChangePublisherKey>({ to: env.minter.address, exitCode: 7 });
    expect(env.minter.getPublisherKey()).toEqual(newKp.publicKey);
}

get fun `test proof: depth beyond one cell is followed through the chain`() {
    // four-leaf tree (a b | c d): proof for `a` is two steps, stored in one cell, and for 3+ steps in a chain
    val env = setupMinter();
    val a = env.alice.address;
    val b = env.bob.address;
    val c = env.admin.address;
    val d = testing.treasury("dee").address;
    val la = leafHash(a, 10); val lb = leafHash(b, 20); val lc = leafHash(c, 30); val ld = leafHash(d, 40);
    val nab = nodeHash(la, 10, lb, 20);
    val ncd = nodeHash(lc, 30, ld, 40);
    val root = nodeHash(nab, 30, ncd, 70);

    // chain: [hasNext=1, count=1, step(lb)] -> [hasNext=0, count=1, step(ncd)]
    val tail = beginCell().storeUint(0, 1).storeUint(1, 2).storeUint(ncd, 256).storeUint(70, 128).storeUint(1, 1).endCell();
    val head = beginCell().storeUint(1, 1).storeUint(1, 2).storeUint(lb, 256).storeUint(20, 128).storeUint(1, 1).storeRef(tail).endCell();

    val wallet = deployUserWallet(env.minter, a, a);
    claim(wallet, a, signRoot(env, 1, root, 100), 10, head);
    expect(wallet.getWalletData().jettonBalance).toEqual(10);
}

get fun `test claim and send: one signed request credits the claim and passes part of it on`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val root = signRoot(env, 1, t.root, t.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);

    val intent = TransferIntent {
        jettonAmount: 30000000000,
        transferRecipient: env.bob.address,
        sendExcessesTo: env.alice.address,
        forwardTonAmount: 0,
        forwardPayload: beginCell().storeUint(0, 1).toSlice(),
    }.toCell();
    val res = aw.sendAskToClaim(env.alice.address, 0, ALICE_EGGS, t.aliceProof, root, intent, { value: grams("0.3") });
    expect(res).toHaveSuccessfulTx<AskToClaim>({ from: env.alice.address, to: aw.address });
    expect(aw.getWalletData().jettonBalance).toEqual(ALICE_EGGS - 30000000000);
    expect(aw.getClaimState().claimed).toEqual(ALICE_EGGS);
    expect(userWallet(env.minter, env.bob.address).getWalletData().jettonBalance).toEqual(30000000000);
    expect(env.minter.getJettonData().totalSupply).toEqual(ALICE_EGGS);
}

get fun `test claim and send: asking for more than the balance still credits the claim and sends nothing`() {
    val env = setupMinter();
    val t = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    val intent = TransferIntent {
        jettonAmount: ALICE_EGGS + 1,
        transferRecipient: env.bob.address,
        sendExcessesTo: null,
        forwardTonAmount: 0,
        forwardPayload: beginCell().storeUint(0, 1).toSlice(),
    }.toCell();
    aw.sendAskToClaim(env.alice.address, 0, ALICE_EGGS, t.aliceProof, signRoot(env, 1, t.root, t.total), intent, { value: grams("0.3") });
    expect(aw.getWalletData().jettonBalance).toEqual(ALICE_EGGS);
}

get fun `test fraud: conflicting roots signed by the key are provable on-chain and freeze it`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val r1 = signRoot(env, 1, t1.root, t1.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    claim(aw, env.alice.address, r1, ALICE_EGGS, t1.aliceProof);

    // an honest pair (later root, everyone's amount grows) is NOT fraud
    val t2 = twoLeafTree(env.alice.address, ALICE_EGGS + 1000000000, env.bob.address, BOB_EGGS);
    val r2 = signRoot(env, 2, t2.root, t2.total);
    val honest = env.minter.sendProveFraud(env.bob.address, 0, r1, r2, env.alice.address, ALICE_EGGS, ALICE_EGGS + 1000000000, t1.aliceProof, t2.aliceProof, { value: grams("0.1") });
    expect(honest).toHaveFailedTx<ProveFraud>({ to: env.minter.address, exitCode: Errors.NoFraud });

    // a later root that lowers alice's amount: anyone can prove it
    val t3 = twoLeafTree(env.alice.address, ALICE_EGGS - 1000000000, env.bob.address, BOB_EGGS + 2000000000);
    val r3 = signRoot(env, 3, t3.root, t3.total);
    val proven = env.minter.sendProveFraud(env.bob.address, 0, r1, r3, env.alice.address, ALICE_EGGS, ALICE_EGGS - 1000000000, t1.aliceProof, t3.aliceProof, { value: grams("0.1") });
    expect(proven).toHaveSuccessfulTx<ProveFraud>({ to: env.minter.address });
    expect(env.minter.getLimits().frozen).toEqual(true);

    // a frozen key can not raise the promised total any more ...
    val t4 = twoLeafTree(env.alice.address, ALICE_EGGS + 5000000000, env.bob.address, BOB_EGGS);
    expect(claim(aw, env.alice.address, signRoot(env, 4, t4.root, t4.total), ALICE_EGGS + 5000000000, t4.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.KeyFrozen,
    });
    // ... but what it promised before stays claimable
    val bw = deployUserWallet(env.minter, env.bob.address, env.bob.address);
    claim(bw, env.bob.address, r1, BOB_EGGS, t1.bobProof);
    expect(bw.getWalletData().jettonBalance).toEqual(BOB_EGGS);

    // a key rotation lifts the freeze
    val newKp = crypto.seedToKeyPair(5551);
    env.minter.sendChangePublisherKey(env.admin.address, 0, newKp.publicKey, { value: grams("0.05") });
    expect(env.minter.getLimits().frozen).toEqual(false);
}

get fun `test fraud: a smaller total in a later root is fraud`() {
    val env = setupMinter();
    val t1 = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, BOB_EGGS);
    val smaller = twoLeafTree(env.alice.address, ALICE_EGGS, env.bob.address, 1);
    expect(env.minter.sendProveFraud(env.bob.address, 0, signRoot(env, 1, t1.root, t1.total), signRoot(env, 2, smaller.root, smaller.total), null, 0, 0, null, null, { value: grams("0.1") })).toHaveSuccessfulTx<ProveFraud>({ to: env.minter.address });
    expect(env.minter.getLimits().frozen).toEqual(true);
}

get fun `test fraud: two roots for one seq are fraud; roots not signed by the key prove nothing`() {
    val env2 = setupMinter();
    val t1 = twoLeafTree(env2.alice.address, ALICE_EGGS, env2.bob.address, BOB_EGGS);
    val smaller = twoLeafTree(env2.alice.address, ALICE_EGGS, env2.bob.address, 1);
    val other = twoLeafTree(env2.admin.address, ALICE_EGGS, env2.bob.address, BOB_EGGS);
    val fork = env2.minter.sendProveFraud(env2.bob.address, 0, signRoot(env2, 7, t1.root, t1.total), signRoot(env2, 7, other.root, other.total), null, 0, 0, null, null, { value: grams("0.1") });
    expect(fork).toHaveSuccessfulTx<ProveFraud>({ to: env2.minter.address });
    // roots NOT signed by the key prove nothing
    val stranger = crypto.seedToKeyPair(4242);
    val fake = env2.minter.sendProveFraud(env2.bob.address, 0, signRoot(env2, 1, t1.root, t1.total), signRootWith(stranger.privateKey, env2.minter.address, 2, smaller.root, smaller.total), null, 0, 0, null, null, { value: grams("0.1") });
    expect(fake).toHaveFailedTx<ProveFraud>({ to: env2.minter.address, exitCode: Errors.BadSignature });
}

get fun `test limits: no wallet can be owed more than the game could have paid it`() {
    // 10 EGG per day per wallet, 20 EGG at launch
    val env = setupMinter(MAX_SUPPLY, MAX_SUPPLY, 10000000000, 20000000000);
    val t = twoLeafTree(env.alice.address, 30000000000, env.bob.address, BOB_EGGS);
    val root = signRoot(env, 1, t.root, t.total);
    val aw = deployUserWallet(env.minter, env.alice.address, env.alice.address);
    expect(claim(aw, env.alice.address, root, 30000000000, t.aliceProof)).toHaveFailedTx<ClaimRequest>({
        to: env.minter.address,
        exitCode: Errors.WalletRate,
    });
    // a day later the allowance has grown to 30 EGG
    testing.setNow(testing.getNow() + 86400);
    claim(aw, env.alice.address, root, 30000000000, t.aliceProof);
    expect(aw.getWalletData().jettonBalance).toEqual(30000000000);
}
