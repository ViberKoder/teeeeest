import "@stdlib/gas-payments"
import "errors"
import "fees-management"
import "jetton-utils"
import "messages"
import "storage"

contract EggWallet {
    author: "EGG"
    version: "2.0.0"
    description: "TEP-74 / TEP-89 jetton wallet that can be credited from Merkle roots committed in its minter"
    storage: WalletStorage
    incomingMessages: AllowedMessageToWallet
}

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | InternalTransferStep
    | AskToClaim
    | ClaimCredit
    | TopUpGrams

type BounceOpToHandle = InternalTransferStep | BurnNotificationForMinter | ClaimRequest

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();

    val msg = lazy BounceOpToHandle.fromSlice(in.bouncedBody);
    var storage = lazy WalletStorage.load();
    match (msg) {
        // tokens that never left come back
        InternalTransferStep => {
            storage.jettonBalance += msg.jettonAmount;
        }
        BurnNotificationForMinter => {
            storage.jettonBalance += msg.jettonAmount;
        }
        // the minter refused the claim (unknown epoch, bad proof): unlock so the user can retry
        ClaimRequest => {
            storage.claimLockedUntil = 0;
        }
    }
    storage.save();
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);

    match (msg) {
        InternalTransferStep => {
            var storage = lazy WalletStorage.load();
            if (in.senderAddress != storage.minterAddress) {
                assert (
                    in.senderAddress ==
                    calcAddressOfJettonWallet(
                        msg.transferInitiator!,
                        storage.minterAddress,
                        contract.getCode(),
                    )
                ) throw Errors.NotValidWallet;
            }
            storage.jettonBalance += msg.jettonAmount;
            storage.save();

            if (msg.forwardTonAmount != 0) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: msg.forwardTonAmount,
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferInitiator,
                        forwardPayload: msg.forwardPayload,
                    },
                });
                notifyOwnerMsg.send(
                    SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
                );
            }

            if (msg.sendExcessesTo != null) {
                returnExcesses(msg.sendExcessesTo, msg.queryId, in.valueCoins);
            }
        }

        AskToTransfer => {
            msg.forwardPayload.checkIsCorrectTlbEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw Errors.WrongWorkchain;
            checkAmountIsEnoughToTransfer(
                in.valueCoins,
                msg.forwardTonAmount,
                in.originalForwardFee,
            );

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (storage.jettonBalance >= msg.jettonAmount) throw Errors.BalanceError;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployedJettonWallet(
                    msg.transferRecipient,
                    storage.minterAddress,
                    contract.getCode(),
                ),
                value: 0,
                body: InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    transferInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload,
                },
            });
            deployMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (storage.jettonBalance >= msg.jettonAmount) throw Errors.BalanceError;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: storage.minterAddress,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                },
            });
            notifyMinterMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        // The owner asks the minter to verify a proof against a root it has published.
        // The wallet only forwards: the decision is made by the minter's own on-chain state.
        AskToClaim => {
            checkAmountIsEnoughToClaim(in.valueCoins);

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (blockchain.now() >= storage.claimLockedUntil) throw Errors.ClaimInProgress;
            storage.claimLockedUntil = blockchain.now() + CLAIM_LOCK_SECONDS;
            storage.save();

            val requestMsg = createMessage({
                // bounceable: if the minter rejects the claim the wallet unlocks itself
                bounce: BounceMode.Only256BitsOfBody,
                dest: storage.minterAddress,
                value: 0,
                body: ClaimRequest {
                    queryId: msg.queryId,
                    ownerAddress: storage.ownerAddress,
                    epoch: msg.epoch,
                    cumulative: msg.cumulative,
                    claimedAtWallet: storage.claimed,
                    proof: msg.proof,
                    next: msg.next,
                },
            });
            requestMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        // Only the minter can credit, and only after it verified a proof.
        ClaimCredit => {
            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.minterAddress) throw Errors.NotMinter;

            // Credit the difference against what THIS wallet has really claimed so far.
            if (msg.cumulative > storage.claimed) {
                storage.jettonBalance += msg.cumulative - storage.claimed;
                storage.claimed = msg.cumulative;
            }
            storage.claimLockedUntil = 0;
            storage.save();

            // "claim and send": the owner asked, in the same signed request, to pass part of it on right away.
            // Best effort: if anything does not fit (balance, gas), the claim stays credited and the rest is returned.
            if (msg.next != null) {
                val intent = TransferIntent.fromCell(msg.next);
                if (
                    intent.transferRecipient.getWorkchain() == MY_WORKCHAIN
                    && storage.jettonBalance >= intent.jettonAmount
                    && in.valueCoins > calcMinimalTransferAmount(intent.forwardTonAmount, in.originalForwardFee)
                ) {
                    storage.jettonBalance -= intent.jettonAmount;
                    storage.save();
                    val deployMsg = createMessage({
                        bounce: BounceMode.Only256BitsOfBody,
                        dest: calcDeployedJettonWallet(
                            intent.transferRecipient,
                            storage.minterAddress,
                            contract.getCode(),
                        ),
                        value: 0,
                        body: InternalTransferStep {
                            queryId: msg.queryId,
                            jettonAmount: intent.jettonAmount,
                            transferInitiator: storage.ownerAddress,
                            sendExcessesTo: intent.sendExcessesTo ?? storage.ownerAddress,
                            forwardTonAmount: intent.forwardTonAmount,
                            forwardPayload: intent.forwardPayload,
                        },
                    });
                    deployMsg.send(
                        SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
                    );
                    return;
                }
            }

            returnExcesses(storage.ownerAddress, msg.queryId, in.valueCoins);
        }

        TopUpGrams => {
            // just accept grams
        }

        else => throw 0xFFFF,
    }
}

fun returnExcesses(to: address?, queryId: int, inValue: coins) {
    val toLeaveOnBalance = contract.getOriginalBalance() - inValue +
        contract.getStorageDuePayment();
    reserveGramsOnBalance(
        max(toLeaveOnBalance, calculateJettonWalletMinStorageFee()),
        RESERVE_MODE_AT_MOST,
    );

    val excessesMsg = createMessage({
        bounce: BounceMode.NoBounce,
        dest: to!,
        value: 0,
        body: ReturnExcessesBack { queryId },
    });
    // SAFETY: mode SEND_MODE_CARRY_ALL_BALANCE is used after reserveGramsOnBalance()
    excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
}

get fun get_wallet_data(): JettonWalletDataReply {
    val storage = lazy WalletStorage.load();

    return {
        jettonBalance: storage.jettonBalance,
        ownerAddress: storage.ownerAddress,
        minterAddress: storage.minterAddress,
        jettonWalletCode: contract.getCode(),
    };
}

get fun get_claim_state(): ClaimStateReply {
    val storage = lazy WalletStorage.load();
    return { claimed: storage.claimed, claimLockedUntil: storage.claimLockedUntil };
}
