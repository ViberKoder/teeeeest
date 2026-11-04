import "@stdlib/strings"

/// `claimed` is the largest cumulative amount this wallet has ever been credited.
/// `claimLockedUntil` is set while a claim is travelling wallet -> minter -> wallet,
/// so two overlapping requests can never be counted twice in the minter's supply.
struct WalletStorage {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    claimed: coins
    claimLockedUntil: uint32
}

/// Who may do what. Kept in its own cell so the root storage cell stays small.
struct Governance {
    /// can rotate the publisher key, tighten limits, change metadata; may drop itself for good
    adminAddress: address?
    nextAdminAddress: address?
}

/// The key that signs Merkle roots. After a rotation the old key stays valid ONLY up to `legacyCap`
/// (the total promised when it was replaced), so roots it signed earlier keep their value forever but a stolen
/// old key can never promise more.
struct Keys {
    publisherKey: uint256
    legacyKey: uint256
    legacyCap: coins
    /// set by a proven fraud (`ProveFraud`): the key may no longer raise the promised total; only a key rotation lifts it
    frozen: bool
}

/// Brakes on the publisher. However many roots it signs, the amount that can ever be created is bounded:
/// `maxTotal` (the highest total of any root a claim has used) can grow by at most `maxGrowth` per `periodSeconds`,
/// and never above `maxSupply`.
struct Limits {
    maxGrowth: coins
    periodSeconds: uint32
    windowStart: uint32
    windowGrowth: coins
    maxTotal: coins
    /// No single wallet can ever be owed more than `walletBurst + walletDaily x days since launchAt`:
    /// the publisher (or a stolen key) can not hand one wallet a fortune, whatever it signs.
    walletDaily: coins
    walletBurst: coins
    launchAt: uint32
}

/// A root the publisher signed (the contract checks the signature; nothing has to be published on-chain).
///   digest = H(tag | minter address hash | treeRoot | total | seq)
struct SignedRoot {
    treeRoot: uint256
    total: coins
    seq: uint64
    signature: bits512
}

struct MinterStorage {
    totalSupply: coins
    maxSupply: coins
    metadata: cell
    governance: Cell<Governance>
    keys: Cell<Keys>
    limits: Cell<Limits>
    /// everything ever created by claims (burns do not lower it). Never above `limits.maxTotal`.
    totalMinted: coins
    /// the newest root slot seen: one `seq` can only ever mean one root (a second one is refused)
    lastSeq: uint64
    lastRoot: uint256
}

fun MinterStorage.load(): MinterStorage {
    return MinterStorage.fromCell(contract.getData());
}

fun MinterStorage.save(self) {
    contract.setData(self.toCell());
}

fun WalletStorage.load(): WalletStorage {
    return WalletStorage.fromCell(contract.getData());
}

fun WalletStorage.save(self) {
    contract.setData(self.toCell());
}

struct JettonWalletDataReply {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    jettonWalletCode: cell
}

struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address?
    jettonContent: Cell<OnchainMetadataReply>
    jettonWalletCode: cell
}

struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, string_prefixed0x>
}

struct ClaimStateReply {
    claimed: coins
    claimLockedUntil: uint32
}



struct LegacyKeyReply {
    legacyKey: uint256
    legacyCap: coins
}

struct LimitsReply {
    maxGrowth: coins
    periodSeconds: uint32
    windowStart: uint32
    windowGrowth: coins
    maxTotal: coins
    walletDaily: coins
    walletBurst: coins
    launchAt: uint32
    frozen: bool
}
