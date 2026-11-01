import "@stdlib/gas-payments"
import "@stdlib/strings"
import "@acton/build"
import "@acton/emulation/config"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/big_array"
import "@acton/types/out_actions"
import "@acton/types/transaction"
import "@contracts/errors"
import "@contracts/jetton-utils"
import "@contracts/merkle"
import "@contracts/messages"
import "@contracts/storage"
import "@wrappers/EggMinter.gen"
import "@wrappers/EggWallet.gen"

const MAX_SUPPLY = 1000000000000 // 1000 EGG (decimals 9)
const CLAIM_VALUE = 120000000 // 0.12 TON attached by the user
const TRANSFER_VALUE = 300000000
const BURN_VALUE = 200000000

fun testMetadata(): cell {
    var metadata: OnchainMetadataReply = { contentDict: [] };
    metadata.contentDict.set("uri".sha256(), "https://egg.test/jetton.json".prefixWith00());
    return metadata.toCell();
}

struct Env {
    minter: EggMinter
    admin: Treasury
    publisher: Treasury
    alice: Treasury
    bob: Treasury
}

fun setupMinter(maxSupply: coins = MAX_SUPPLY, maxGrowth: coins = MAX_SUPPLY): Env {
    testing.setNow(1800000000);
    val admin = testing.treasury("admin");
    val publisher = testing.treasury("publisher");
    val alice = testing.treasury("alice");
    val bob = testing.treasury("bob");

    val governance: Governance = {
        adminAddress: admin.address,
        nextAdminAddress: null,
        publisherAddress: publisher.address,
    };
    val limits: Limits = {
        maxGrowth,
        periodSeconds: 3600,
        minInterval: 0,
        windowStart: 0,
        windowGrowth: 0,
        lastPublishedAt: 0,
        lastTotal: 0,
    };
    val minter = EggMinter.fromStorage({
        totalSupply: 0,
        maxSupply,
        lastEpoch: 0,
        metadata: testMetadata(),
        roots: [],
        governance: governance.toCell(),
        limits: limits.toCell(),
    });
    // the generated .deploy() sends an empty body; this contract expects TopUpGrams
    val res = net.send(
        admin.address,
        createMessage({
            bounce: false,
            value: grams("1"),
            dest: { workchain: BASECHAIN, stateInit: minter.stateInit! },
            body: TopUpGrams {},
        }),
    );
    expect(res).toHaveSuccessfulDeploy({ to: minter.address });
    return { minter, admin, publisher, alice, bob };
}

fun userWallet(minter: EggMinter, owner: address): EggWallet {
    return EggWallet { address: minter.getWalletAddress(owner) };
}

/// Deploys a user's wallet (TopUp carries the StateInit), like the app does with its first claim.
fun deployUserWallet(minter: EggMinter, owner: address, payer: address): EggWallet {
    val init = calcDeployedJettonWallet(owner, minter.address, build("EggWallet"));
    val address = init.calculateAddress();
    val res = net.send(
        payer,
        createMessage({ bounce: false, value: grams("0.5"), dest: init, body: TopUpGrams {} }),
    );
    expect(res).toHaveSuccessfulDeploy({ to: address });
    return EggWallet { address };
}

// ---------------- a tiny two-leaf sum tree ----------------

struct Pair {
    root: int
    total: int
    aliceProof: cell
    bobProof: cell
}

fun oneStepProof(sibHash: int, sibSum: int, sibOnRight: bool): cell {
    return beginCell()
        .storeUint(0, 1)
        .storeUint(1, 2)
        .storeUint(sibHash, 256)
        .storeUint(sibSum, 128)
        .storeUint(sibOnRight ? 1 : 0, 1)
        .endCell();
}

fun twoLeafTree(a: address, aSum: int, b: address, bSum: int): Pair {
    val la = leafHash(a, aSum);
    val lb = leafHash(b, bSum);
    return {
        root: nodeHash(la, aSum, lb, bSum),
        total: aSum + bSum,
        aliceProof: oneStepProof(lb, bSum, true),
        bobProof: oneStepProof(la, aSum, false),
    };
}

fun publish(env: Env, epoch: int, root: int, total: int): SendResultList {
    return env.minter.sendPublishRoot(env.publisher.address, 0, epoch, root, total, { value: grams("0.1") });
}

fun claim(wallet: EggWallet, owner: address, epoch: int, cumulative: int, proof: cell): SendResultList {
    return wallet.sendAskToClaim(owner, 0, epoch, cumulative, proof, { value: CLAIM_VALUE });
}
