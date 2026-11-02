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
    description: "TEP-74 / TEP-89 jetton minter. Supply is created only by verified claims against published Merkle roots"
    storage: MinterStorage
    incomingMessages: AllowedMessageToMinter
}

type AllowedMessageToMinter =
    | ClaimRequest
    | PublishRoot
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangePublisher
    | SetLimits
    | ChangeMinterAdmin
    | ClaimMinterAdmin
    | DropMinterAdmin
    | ChangeMinterMetadata
    | TopUpGrams

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

            val record = storage.roots.get(msg.epoch);
            assert (record.isFound) throw Errors.UnknownEpoch;

            val (treeRoot, total) = foldProof(
                leafHash(msg.ownerAddress, msg.cumulative),
                msg.cumulative,
                msg.proof,
            );
            assert (
                rootCommitment(treeRoot, total) == record.loadValue().commitment
            ) throw Errors.ProofMismatch;

            // new supply = only what this wallet has not been credited yet
            if (msg.cumulative > msg.claimedAtWallet) {
                val delta = msg.cumulative - msg.claimedAtWallet;
                assert (storage.totalSupply + delta <= storage.maxSupply) throw Errors.SupplyExceeded;
                // What has ever been created can never exceed the NEWEST published total, which the growth limits bound.
                // A tree's internal sums are only checked along the claimed path, so a dishonest publisher could otherwise
                // promise the same total to different people in different roots and mint past the limits.
                assert (storage.totalMinted + delta <= storage.limits.load().lastTotal) throw Errors.SupplyExceeded;
                storage.totalSupply += delta;
                storage.totalMinted += delta;
                storage.save();
            }

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

        PublishRoot => {
            var storage = lazy MinterStorage.load();
            val gov = storage.governance.load();
            assert (in.senderAddress == gov.publisherAddress) throw Errors.NotPublisher;
            assert (msg.epoch == storage.lastEpoch + 1) throw Errors.EpochOutOfOrder;
            assert (msg.total <= storage.maxSupply) throw Errors.SupplyExceeded;

            var limits = storage.limits.load();
            val now = blockchain.now();
            assert (now >= limits.lastPublishedAt + limits.minInterval) throw Errors.PublishTooSoon;
            assert (msg.total >= limits.lastTotal) throw Errors.TotalDecreased;

            if (now >= limits.windowStart + limits.periodSeconds) {
                limits.windowStart = now;
                limits.windowGrowth = 0;
            }
            limits.windowGrowth += msg.total - limits.lastTotal;
            assert (limits.windowGrowth <= limits.maxGrowth) throw Errors.GrowthLimit;
            limits.lastTotal = msg.total;
            limits.lastPublishedAt = now;

            storage.roots.set(msg.epoch, {
                commitment: rootCommitment(msg.treeRoot, msg.total),
                total: msg.total,
                publishedAt: now,
            });
            storage.lastEpoch = msg.epoch;
            storage.limits = limits.toCell();
            storage.save();
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

        ChangePublisher => {
            val storage = lazy MinterStorage.load();
            var gov = storage.governance.load();
            assertSenderIsAdmin(in.senderAddress, gov.adminAddress);
            gov.publisherAddress = msg.newPublisher;
            var next = storage;
            next.governance = gov.toCell();
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
            assert (msg.minInterval >= limits.minInterval) throw Errors.LimitsLoosened;
            limits.maxGrowth = msg.maxGrowth;
            limits.periodSeconds = msg.periodSeconds;
            limits.minInterval = msg.minInterval;
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

get fun get_last_epoch(): int {
    val storage = lazy MinterStorage.load();
    return storage.lastEpoch;
}

/// (commitment, total, publishedAt) of a published root; exit code 9 style failure if unknown
get fun get_root(epoch: int): RootReply {
    val storage = lazy MinterStorage.load();
    val record = storage.roots.mustGet(epoch, Errors.UnknownEpoch as int);
    return { commitment: record.commitment, total: record.total, publishedAt: record.publishedAt };
}

get fun get_publisher(): address {
    val storage = lazy MinterStorage.load();
    return storage.governance.load().publisherAddress;
}

get fun get_next_admin_address(): address? {
    val storage = lazy MinterStorage.load();
    return storage.governance.load().nextAdminAddress;
}
