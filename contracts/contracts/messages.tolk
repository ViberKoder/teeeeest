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

/// owner -> own wallet. `root` is a `SignedRoot` the publisher signed; `cumulative` + `proof` open to that root.
struct (0x28dac35b) AskToClaim {
    queryId: uint64
    cumulative: coins
    proof: cell
    root: cell
    /// optional `TransferIntent`: after the credit lands, send this much to someone, in the same flow
    next: cell?
}

/// What the owner wants done right after the claim is credited: claim and send in one signed request.
struct TransferIntent {
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address?
    forwardTonAmount: coins
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

/// wallet -> minter. The wallet is identified by its address, so `claimedAtWallet` is trustworthy.
struct (0x87a42c7c) ClaimRequest {
    queryId: uint64
    ownerAddress: address
    cumulative: coins
    claimedAtWallet: coins
    proof: cell
    root: cell
    next: cell?
}

/// minter -> wallet.
struct (0x49e1974f) ClaimCredit {
    queryId: uint64
    cumulative: coins
    /// echoed unchanged from the owner's request; only the genuine minter can send it
    next: cell?
}

// ---------------- governance ----------------

/// admin -> minter: the key that signs roots changes; the old one keeps only what it already promised.
struct (0x4b2e9d11) ChangePublisherKey {
    queryId: uint64
    newKey: uint256
}

struct (0x0cc58dbc) SetLimits {
    queryId: uint64
    maxGrowth: coins
    periodSeconds: uint32
    walletDaily: coins
    walletBurst: coins
}

/// Anyone -> minter: two roots signed by the CURRENT key that an honest publisher can never produce together.
/// Proven fraud freezes the key: it can no longer raise the promised total (everything already promised stays claimable).
///   - the same `seq` with two different roots;
///   - a later root (`b.seq > a.seq`) that promises a smaller total;
///   - a later root in which some owner's amount went DOWN (`owner`, `cumA` + `proofA` in `a`, `cumB` + `proofB` in `b`).
struct (0x5fa0d0f1) ProveFraud {
    queryId: uint64
    a: cell
    b: cell
    owner: address?
    cumA: coins
    cumB: coins
    proofA: cell?
    proofB: cell?
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
