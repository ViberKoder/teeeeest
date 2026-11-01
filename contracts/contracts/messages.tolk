type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0b0) PayloadInline {
    value: RemainingBitsAndRefs
}

struct (0b1) PayloadInRef {
    value: Cell<RemainingBitsAndRefs>
}

// ---------------- TEP-74 / TEP-89 ----------------

struct (0x0f8a7ea5) AskToTransfer {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address?
    customPayload: cell?
    forwardTonAmount: coins
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

struct (0x7362d09c) TransferNotificationForRecipient {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    sendExcessesTo: address?
    forwardTonAmount: coins
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

struct (0x7bdd97de) BurnNotificationForMinter {
    queryId: uint64
    jettonAmount: coins
    burnInitiator: address
    sendExcessesTo: address?
}

struct (0x2c76b973) RequestWalletAddress {
    queryId: uint64
    ownerAddress: address
    includeOwnerAddress: bool
}

struct (0xd1735400) ResponseWalletAddress {
    queryId: uint64
    jettonWalletAddress: address?
    ownerAddress: Cell<address>?
}

// ---------------- claims ----------------

/// owner -> own wallet. `cumulative` + `proof` come from the published tree of `epoch`.
struct (0x28dac35b) AskToClaim {
    queryId: uint64
    epoch: uint32
    cumulative: coins
    proof: cell
}

/// wallet -> minter. The wallet is identified by its address, so `claimedAtWallet` is trustworthy.
struct (0x87a42c7c) ClaimRequest {
    queryId: uint64
    ownerAddress: address
    epoch: uint32
    cumulative: coins
    claimedAtWallet: coins
    proof: cell
}

/// minter -> wallet.
struct (0x49e1974f) ClaimCredit {
    queryId: uint64
    cumulative: coins
}

// ---------------- governance ----------------

struct (0x0e7ccd64) PublishRoot {
    queryId: uint64
    epoch: uint32
    treeRoot: uint256
    total: coins
}

struct (0x97d70ce0) ChangePublisher {
    queryId: uint64
    newPublisher: address
}

struct (0x0cc58dbc) SetLimits {
    queryId: uint64
    maxGrowth: coins
    periodSeconds: uint32
    minInterval: uint32
}

struct (0x6501f354) ChangeMinterAdmin {
    queryId: uint64
    newAdminAddress: address
}

struct (0xfb88e119) ClaimMinterAdmin {
    queryId: uint64
}

struct (0x7431f221) DropMinterAdmin {
    queryId: uint64
}

struct (0xcb862902) ChangeMinterMetadata {
    queryId: uint64
    newMetadata: cell
}

struct (0xd372158c) TopUpGrams {}

// "forward payload" is TL/B `(Either Cell ^Cell)`;
// we want to test, that if ^Cell, no other data exists in a slice
fun ForwardPayloadRemainder.checkIsCorrectTlbEither(self) {
    var mutableCopy = self;
    if (mutableCopy.loadMaybeRef() != null) {
        // throw "cell underflow" if there is data besides a ref
        mutableCopy.assertEnd();
    }
}
