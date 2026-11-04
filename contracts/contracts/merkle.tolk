import "errors"

// Sum-Merkle tree.
//
//   leaf  = H(0x00 | ownerHash:256 | cumulative:128)
//   node  = H(0x01 | leftHash:256 | leftSum:128 | rightHash:256 | rightSum:128)
//   root  = H(0x02 | treeRoot:256 | total:128)          <- what the minter stores
//
// H(x) is `builder.hash()` (TVM HASHBU): the hash of the cell holding x. Every node commits to the SUM of the leaves below it, and a
// verifier recomputes that sum while walking the proof. So the root commits, cryptographically,
// to the total amount promised by the whole tree — a publisher cannot promise more than it declares.
//
// The same layout is implemented in TypeScript in sdk/src/tree.ts; tests keep them identical.

const TAG_LEAF = 0
const TAG_NODE = 1
const TAG_ROOT = 2
const MAX_PROOF_DEPTH = 64

fun leafHash(owner: address, cumulative: int): int {
    val (_, ownerHash) = owner.getWorkchainAndHash();
    return beginCell()
        .storeUint(TAG_LEAF, 8)
        .storeUint(ownerHash, 256)
        .storeUint(cumulative, 128)
        .hash();
}

fun nodeHash(leftHash: int, leftSum: int, rightHash: int, rightSum: int): int {
    return beginCell()
        .storeUint(TAG_NODE, 8)
        .storeUint(leftHash, 256)
        .storeUint(leftSum, 128)
        .storeUint(rightHash, 256)
        .storeUint(rightSum, 128)
        .hash();
}

fun rootCommitment(treeRoot: int, total: int): int {
    return beginCell()
        .storeUint(TAG_ROOT, 8)
        .storeUint(treeRoot, 256)
        .storeUint(total, 128)
        .hash();
}

// Proof layout, a chain of cells, two steps per cell:
//   hasNext:uint1  count:uint2  (siblingHash:uint256  siblingSum:uint128  siblingOnRight:uint1) * count
//   [^next]
// Steps run from the leaf up to the root.
fun foldProof(leaf: int, leafSum: int, proof: cell): (int, int) {
    var hash = leaf;
    var sum = leafSum;
    var cur = proof.beginParse();
    var depth = 0;
    var more = true;
    while (more) {
        more = cur.loadUint(1) == 1;
        var count = cur.loadUint(2);
        while (count > 0) {
            val sibHash = cur.loadUint(256);
            val sibSum = cur.loadUint(128);
            val sibOnRight = cur.loadUint(1) == 1;
            hash = sibOnRight
                ? nodeHash(hash, sum, sibHash, sibSum)
                : nodeHash(sibHash, sibSum, hash, sum);
            sum += sibSum;
            depth += 1;
            assert (depth <= MAX_PROOF_DEPTH) throw Errors.ProofTooDeep;
            count -= 1;
        }
        if (more) {
            cur = cur.loadRef().beginParse();
        }
    }
    return (hash, sum);
}

const TAG_SIGNED_ROOT = 0x45474752 // "EGGR"

/// What the publisher signs. It binds the minter's address, so a signature can not be replayed on another contract.
fun signedRootDigest(minter: address, treeRoot: int, total: int, seq: int): int {
    val (_, minterHash) = minter.getWorkchainAndHash();
    return beginCell()
        .storeUint(TAG_SIGNED_ROOT, 32)
        .storeUint(minterHash, 256)
        .storeUint(treeRoot, 256)
        .storeCoins(total)
        .storeUint(seq, 64)
        .hash();
}
