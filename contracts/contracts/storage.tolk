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
    /// can rotate the publisher, tune limits, change metadata; may drop itself for good
    adminAddress: address?
    nextAdminAddress: address?
    /// may publish new Merkle roots, nothing else
    publisherAddress: address
}

/// Brakes on the publisher. A compromised publisher can never release more than
/// `maxGrowth` per `periodSeconds`, and never more than `maxSupply` in total.
struct Limits {
    maxGrowth: coins
    periodSeconds: uint32
    minInterval: uint32
    windowStart: uint32
    windowGrowth: coins
    lastPublishedAt: uint32
    lastTotal: coins
}

/// One published root. `commitment` = H(tag, treeRoot, total) binds the total the
/// tree commits to, so the amount promised in an epoch is public and capped.
struct RootRecord {
    commitment: uint256
    total: coins
    publishedAt: uint32
}

struct MinterStorage {
    totalSupply: coins
    maxSupply: coins
    lastEpoch: uint32
    metadata: cell
    roots: map<uint32, RootRecord>
    governance: Cell<Governance>
    limits: Cell<Limits>
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

struct RootReply {
    commitment: uint256
    total: coins
    publishedAt: uint32
}
