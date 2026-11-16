import "@stdlib/gas-payments"
import "errors"

// we're working in basechain
const MY_WORKCHAIN = BASECHAIN

// Claims. What is not spent comes back to the owner as excess.
const CLAIM_LOCK_SECONDS = 600

// Upper bounds of the gas a claim can burn at each hop (measured in sdk/tests/audit.test.ts, with a margin).
// They are bounds, not exact values: they decide how much TON must travel with a claim so no hop can run dry.
const GAS_CLAIM_ASK = 9000 // wallet: AskToClaim
const GAS_CLAIM_MINTER = 95000 // minter: ClaimRequest with the deepest proof allowed (64 steps)
const GAS_CLAIM_MINTER_TAIL = 3000 // minter: from the value check to the end of its transaction
const GAS_CLAIM_CREDIT = 12000 // wallet: ClaimCredit, whichever branch it takes without a transfer
const GAS_CLAIM_SURPLUS = 8000 // minter: ClaimSurplus (only when two claims of one wallet crossed)

// Storage costs
// these constants are used to estimate storage fee (how much we should pay for storing a wallet contract);
// the bounds are checked in tests/state-init.test.tolk

const STORAGE_SIZE_MAX_WALLET_BITS = 1026 // generous upper bound (real wallet is ~800 bits)
const STORAGE_SIZE_MAX_WALLET_CELLS = 3
const STORAGE_SIZE_INIT_STATE_WALLET_BITS = 812
const STORAGE_SIZE_INIT_STATE_WALLET_CELLS = 3

const MESSAGE_SIZE_BURN_NOTIFICATION_BITS = 754 // body = 32+64+124+(3+8+256)+(3+8+256)
const MESSAGE_SIZE_BURN_NOTIFICATION_CELLS = 1 // body always in ref

const MIN_STORAGE_DURATION = 5 * 365 * 24 * 3600 // 5 years

// Gas costs
// these constants are used to estimate gas fee (how much we should retain on balance for a transfer to succeed);
// they must be absolutely equal to consumed gas; if not, tests fail;
// actual consumed gas (desired value of these constants) is printed to console after tests run

const GAS_CONSUMPTION_JETTON_TRANSFER = 6327
const GAS_CONSUMPTION_JETTON_RECEIVE = 7443
const GAS_CONSUMPTION_BURN_REQUEST = 4254
const GAS_CONSUMPTION_BURN_NOTIFICATION = 4071

// SAFETY: Uses TVM's read-only GETPRECOMPILEDGAS primitive; callers handle `null` fallback safely.
fun getPrecompiledGasConsumption(): int?
    asm "GETPRECOMPILEDGAS"

fun calculateJettonWalletMinStorageFee(): coins {
    return calculateStorageFee(
        MY_WORKCHAIN,
        MIN_STORAGE_DURATION,
        STORAGE_SIZE_MAX_WALLET_BITS,
        STORAGE_SIZE_MAX_WALLET_CELLS,
    );
}

fun forwardInitStateOverhead(): coins {
    return calculateForwardFeeWithoutLumpPrice(
        MY_WORKCHAIN,
        STORAGE_SIZE_INIT_STATE_WALLET_BITS,
        STORAGE_SIZE_INIT_STATE_WALLET_CELLS,
    );
}

fun calcMinimalTransferAmount(forwardTonAmount: int, fwdFee: int): int {
    val fwdCount = forwardTonAmount != 0
        ? 2
        : 1;                                      // second sending (forward) will be cheaper than first

    val jettonWalletGasConsumption = getPrecompiledGasConsumption();
    val sendTransferGasConsumption = (jettonWalletGasConsumption == null)
        ? GAS_CONSUMPTION_JETTON_TRANSFER
        : jettonWalletGasConsumption;
    val receiveTransferGasConsumption = (jettonWalletGasConsumption == null)
        ? GAS_CONSUMPTION_JETTON_RECEIVE
        : jettonWalletGasConsumption;

    return forwardTonAmount +
        // 3 messages: wal1->wal2, wal2->owner, wal2->response
        // but last one is optional (it is ok if it fails)
        fwdCount * fwdFee +
        forwardInitStateOverhead() +
        // additional fwd fees related to initstate in internal_transfer
        calculateGasFee(MY_WORKCHAIN, sendTransferGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, receiveTransferGasConsumption) +
        calculateJettonWalletMinStorageFee();
}

fun checkAmountIsEnoughToTransfer(msgValue: int, forwardTonAmount: int, fwdFee: int) {
    val minTransferAmount = calcMinimalTransferAmount(forwardTonAmount, fwdFee);
    assert (msgValue > minTransferAmount) throw Errors.NotEnoughGas;
}

fun calcMinimalBurnAmount(): coins {
    val jettonWalletGasConsumption = getPrecompiledGasConsumption();
    val sendBurnGasConsumption = (jettonWalletGasConsumption == null)
        ? GAS_CONSUMPTION_BURN_REQUEST
        : jettonWalletGasConsumption;

    return calculateForwardFee(
        MY_WORKCHAIN,
        MESSAGE_SIZE_BURN_NOTIFICATION_BITS,
        MESSAGE_SIZE_BURN_NOTIFICATION_CELLS,
    ) +
        calculateGasFee(MY_WORKCHAIN, sendBurnGasConsumption) +
        calculateGasFee(MY_WORKCHAIN, GAS_CONSUMPTION_BURN_NOTIFICATION);
}

fun checkAmountIsEnoughToBurn(msgValue: int) {
    val minBurnAmount = calcMinimalBurnAmount();
    assert (msgValue > minBurnAmount) throw Errors.NotEnoughGas;
}

/// The least a claim must carry: every hop's worst-case gas at the current network prices, and the messages between them.
fun calcMinimalClaimAmount(fwdFee: int): coins {
    return calculateGasFee(
        MY_WORKCHAIN,
        GAS_CLAIM_ASK + GAS_CLAIM_MINTER + GAS_CLAIM_CREDIT + GAS_CLAIM_SURPLUS,
    ) +
        4 * fwdFee;
}

fun checkAmountIsEnoughToClaim(msgValue: int, fwdFee: int) {
    assert (msgValue >= calcMinimalClaimAmount(fwdFee)) throw Errors.NotEnoughGas;
}
