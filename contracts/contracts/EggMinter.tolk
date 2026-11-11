import "@gen/EggWallet.code"
import "errors"
import "fees-management"
import "jetton-utils"
import "merkle"
import "messages"
import "storage"

contract EggMinter {
    author: "EGG"
    version: "2.0.0"
    description: "TEP-74 / TEP-89 jetton minter. Supply is created only by claims that prove a share of a publisher-signed Merkle root"
    storage: MinterStorage
    incomingMessages: AllowedMessageToMinter
}

type AllowedMessageToMinter =
    | ClaimRequest
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangePublisherKey
    | ProveFraud
    | SetLimits
    | ChangeMinterAdmin
    | ClaimMinterAdmin
    | DropMinterAdmin
    | ChangeMinterMetadata
    | TopUpGrams

/// The digest of a signed root, and whether the CURRENT publisher key signed it.
fun signedByCurrentKey(sr: SignedRoot, keys: Keys): (int, bool) {
    val digest = signedRootDigest(contract.getAddress(), sr.treeRoot, sr.total, sr.seq);
    return (digest, isSignatureValid(digest, sr.signature as slice, keys.publisherKey));
}

fun assertSenderIsAdmin(senderAddress: address, adminAddress: address?) {
    // a dropped admin is null: `!` throws, so no admin operation is possible any more
    assert (senderAddress == adminAddress!) throw Errors.NotAdmin;
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);

    match (msg) {
        // -------------------------------------------------------------------------------
        // The heart of the design: the minter checks the user's proof against a root it
        // stores itself. No signature, no off-chain key is consulted.
        // -------------------------------------------------------------------------------
        ClaimRequest => {
            var storage = lazy MinterStorage.load();
            assert (
                in.senderAddress ==
                calcAddressOfJettonWallet(
                    msg.ownerAddress,
                    contract.getAddress(),
                    eggWalletCompiledCode(),
                )
            ) throw Errors.NotValidWallet;

            // 1. the root is authentic: signed by the publisher key (or by the previous key, within what it had promised)
            val sr = SignedRoot.fromCell(msg.root);
            val digest = signedRootDigest(contract.getAddress(), sr.treeRoot, sr.total, sr.seq);
            val keys = storage.keys.load();
            val signature = sr.signature as slice;
            var byCurrentKey = true;
            if (!isSignatureValid(digest, signature, keys.publisherKey)) {
                assert (keys.legacyKey != 0 && isSignatureValid(digest, signature, keys.legacyKey)) throw Errors.BadSignature;
                assert (sr.total <= keys.legacyCap) throw Errors.LegacyCap;
                byCurrentKey = false;
            }

            // 2. the proof opens to exactly that root
            val (treeRoot, total) = foldProof(
                leafHash(msg.ownerAddress, msg.cumulative),
                msg.cumulative,
                msg.proof,
            );
            assert (treeRoot == sr.treeRoot && total == sr.total) throw Errors.ProofMismatch;

            // 3. one slot, one root: a second, different root for the same `seq` is refused
            // (a rotated-out key may still be honoured for old roots, but it must not move the slot: a stolen old key could
            // otherwise claim a huge `seq` and blind the same-`seq` fork check for every root of the new key)
            if (sr.seq > storage.lastSeq) {
                if (byCurrentKey) {
                    storage.lastSeq = sr.seq;
                    storage.lastRoot = digest;
                }
            } else if (sr.seq == storage.lastSeq) {
                assert (storage.lastRoot == digest) throw Errors.Equivocation;
            }

            // 4. limits: a root that promises more than anything seen before may raise `maxTotal`, but only within the growth budget
            var limits = storage.limits.load();
            if (sr.total > limits.maxTotal) {
                assert (!keys.frozen) throw Errors.KeyFrozen;
                assert (sr.total <= storage.maxSupply) throw Errors.SupplyExceeded;
                val now = blockchain.now();
                if (now >= limits.windowStart + limits.periodSeconds) {
                    limits.windowStart = now;
                    limits.windowGrowth = 0;
                }
                limits.windowGrowth += sr.total - limits.maxTotal;
                assert (limits.windowGrowth <= limits.maxGrowth) throw Errors.GrowthLimit;
                limits.maxTotal = sr.total;
                storage.limits = limits.toCell();
            }

            // 5. no wallet can be owed more than the game could ever have paid it
            val days = blockchain.now() > limits.launchAt ? (blockchain.now() - limits.launchAt) : 0;
            assert (msg.cumulative <= limits.walletBurst + mulDivFloor(limits.walletDaily, days, 86400)) throw Errors.WalletRate;

            // 6. new supply = only what this wallet has not been credited yet
            if (msg.cumulative > msg.claimedAtWallet) {
                val delta = msg.cumulative - msg.claimedAtWallet;
                assert (storage.totalSupply + delta <= storage.maxSupply) throw Errors.SupplyExceeded;
                // What was ever created can never exceed the highest total promised, which the growth limits bound.
                assert (storage.totalMinted + delta <= limits.maxTotal) throw Errors.SupplyExceeded;
                storage.totalSupply += delta;
                storage.totalMinted += delta;
            }
            storage.save();

            val creditMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ClaimCredit {
                    queryId: msg.queryId,
                    cumulative: msg.cumulative,
                    next: msg.next,
                },
            });
            creditMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        BurnNotificationForMinter => {
            var storage = lazy MinterStorage.load();
            assert (
                in.senderAddress ==
                calcAddressOfJettonWallet(
                    msg.burnInitiator,
                    contract.getAddress(),
                    eggWalletCompiledCode(),
                )
            ) throw Errors.NotValidWallet;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            if (msg.sendExcessesTo == null) {
                return;
            }

            val excessesMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo,
                value: 0,
                body: ReturnExcessesBack { queryId: msg.queryId },
            });
            excessesMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        RequestWalletAddress => {
            val ownerAddress: Cell<address>? = msg.includeOwnerAddress
                ? msg.ownerAddress.toCell()
                : null;

            var walletAddress: address? = null;
            if (msg.ownerAddress.getWorkchain() == MY_WORKCHAIN) {
                walletAddress = calcAddressOfJettonWallet(
                    msg.ownerAddress,
                    contract.getAddress(),
                    eggWalletCompiledCode(),
                );
            }

            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseWalletAddress {
                    queryId: msg.queryId,
                    jettonWalletAddress: walletAddress,
                    ownerAddress,
                },
            });
            respondMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        ChangePublisherKey => {
            val storage = lazy MinterStorage.load();
            val gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            assert (msg.newKey != 0) throw Errors.ZeroKey;
            var keys = storage.keys.load();
            val limits = storage.limits.load();
            // the replaced key keeps value only for what was already promised
            keys.legacyKey = keys.publisherKey;
            keys.legacyCap = limits.maxTotal;
            keys.publisherKey = msg.newKey;
            keys.frozen = false;
            var next = storage;
            next.keys = keys.toCell();
            next.save();
        }

        SetLimits => {
            val storage = lazy MinterStorage.load();
            val gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            var limits = storage.limits.load();
            // limits can only be tightened: a compromised admin must not be able to open the tap
            assert (msg.maxGrowth <= limits.maxGrowth) throw Errors.LimitsLoosened;
            assert (msg.periodSeconds >= limits.periodSeconds) throw Errors.LimitsLoosened;
            assert (msg.walletDaily <= limits.walletDaily && msg.walletBurst <= limits.walletBurst) throw Errors.LimitsLoosened;
            limits.maxGrowth = msg.maxGrowth;
            limits.periodSeconds = msg.periodSeconds;
            limits.walletDaily = msg.walletDaily;
            limits.walletBurst = msg.walletBurst;
            var next = storage;
            next.limits = limits.toCell();
            next.save();
        }

        ChangeMinterAdmin => {
            val storage = lazy MinterStorage.load();
            var gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            gov.nextAdminAddress = msg.newAdminAddress;
            var next = storage;
            next.governance = gov.toCell();
            next.save();
        }

        ClaimMinterAdmin => {
            val storage = lazy MinterStorage.load();
            var gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.nextAdminAddress);
            gov.adminAddress = gov.nextAdminAddress;
            gov.nextAdminAddress = null;
            var next = storage;
            next.governance = gov.toCell();
            next.save();
        }

        DropMinterAdmin => {
            val storage = lazy MinterStorage.load();
            var gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            gov.adminAddress = null;
            gov.nextAdminAddress = null;
            var next = storage;
            next.governance = gov.toCell();
            next.save();
        }

        ChangeMinterMetadata => {
            var storage = lazy MinterStorage.load();
            val gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            storage.metadata = msg.newMetadata;
            storage.save();
        }

        ProveFraud => {
            var storage = lazy MinterStorage.load();
            var keys = storage.keys.load();
            val a = SignedRoot.fromCell(msg.a);
            val b = SignedRoot.fromCell(msg.b);
            val (da, okA) = signedByCurrentKey(a, keys);
            val (db, okB) = signedByCurrentKey(b, keys);
            assert (okA && okB) throw Errors.BadSignature;

            var fraud = false;
            if (a.seq == b.seq) {
                fraud = da != db;
            } else if (a.seq < b.seq) {
                if (b.total < a.total) {
                    fraud = true;
                } else if (msg.owner != null && msg.proofA != null && msg.proofB != null && msg.cumB < msg.cumA) {
                    val owner = msg.owner!;
                    val (rootA, totalA) = foldProof(leafHash(owner, msg.cumA), msg.cumA, msg.proofA!);
                    val (rootB, totalB) = foldProof(leafHash(owner, msg.cumB), msg.cumB, msg.proofB!);
                    fraud = rootA == a.treeRoot && totalA == a.total && rootB == b.treeRoot && totalB == b.total;
                }
            }
            assert (fraud) throw Errors.NoFraud;

            keys.frozen = true;
            storage.keys = keys.toCell();
            storage.save();
        }

        TopUpGrams => {
            // just accept grams
        }

        else => throw 0xFFFF,
    }
}

// ------------------------------- TEP-74 getters -------------------------------

get fun get_jetton_data(): JettonDataReply {
    val storage = lazy MinterStorage.load();
    val gov = storage.governance.load();

    return {
        totalSupply: storage.totalSupply,
        // supply can still be created by claims until the cap is reached
        mintable: storage.totalSupply < storage.maxSupply,
        adminAddress: gov.adminAddress,
        jettonContent: storage.metadata as Cell<OnchainMetadataReply>,
        jettonWalletCode: eggWalletCompiledCode(),
    };
}

get fun get_wallet_address(ownerAddress: address): address {
    return calcAddressOfJettonWallet(
        ownerAddress,
        contract.getAddress(),
        eggWalletCompiledCode(),
    );
}

// ------------------------------- EGG getters -------------------------------

get fun get_total_minted(): int {
    val storage = lazy MinterStorage.load();
    return storage.totalMinted;
}

get fun get_max_supply(): int {
    val storage = lazy MinterStorage.load();
    return storage.maxSupply;
}

get fun get_max_total(): int {
    val storage = lazy MinterStorage.load();
    return storage.limits.load().maxTotal;
}

get fun get_limits(): LimitsReply {
    val storage = lazy MinterStorage.load();
    val l = storage.limits.load();
    return {
        maxGrowth: l.maxGrowth, periodSeconds: l.periodSeconds, windowStart: l.windowStart, windowGrowth: l.windowGrowth, maxTotal: l.maxTotal,
        walletDaily: l.walletDaily, walletBurst: l.walletBurst, launchAt: l.launchAt, frozen: storage.keys.load().frozen,
    };
}

get fun get_last_seq(): int {
    val storage = lazy MinterStorage.load();
    return storage.lastSeq;
}

get fun get_publisher_key(): int {
    val storage = lazy MinterStorage.load();
    return storage.keys.load().publisherKey;
}

get fun get_legacy_key(): LegacyKeyReply {
    val storage = lazy MinterStorage.load();
    val keys = storage.keys.load();
    return { legacyKey: keys.legacyKey, legacyCap: keys.legacyCap };
}

get fun get_next_admin_address(): address? {
    val storage = lazy MinterStorage.load();
    return storage.governance.load().nextAdminAddress;
}
