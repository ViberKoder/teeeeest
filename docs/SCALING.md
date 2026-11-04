# Scaling later: claim shards (designed, NOT built)

Today every claim goes through one minter contract. That is fine for the launch target (around **100 claims/s at peak**, ≈ 500 transactions/s in total), but a single
account is a hot spot and can not be split between TON's shards. If measurements show it becoming the bottleneck, move to **claim shards** *without changing the token's
trust model*. This note keeps the design so it can be built later; the wallet contract would have to know the shard rule from the start, so decide **before** minting at scale.

## Idea

1. **Split the tree by owner-hash prefix into K sub-trees**, then a small top tree over the K sub-tree roots. Each sub-tree's sum is part of the signed root, so
   it is *exact*: the sum of what the publisher promised to that shard's owners.
2. **A claim goes to the owner's shard** (`shard = hash(owner) mod K`), not to the minter. The wallet derives the shard's address from `(minter, index, code)`, the same
   way it derives its own address. The shard checks: the root's signature (key copied from the minter), the proof, and **`mintedByShard ≤ sub-tree sum`** — no leases needed.
3. **Global ceiling.** The minter keeps the growth limits and a `ceiling` (the highest total roots may carry), raised by the publisher at most `maxGrowth` per period
   and **fanned out to the K shards by message**. A shard refuses a root whose total exceeds its copy of the ceiling. Raising it hourly costs `24 × (K+1)` transactions a day.
4. **Key changes** are also fanned out through the minter; shard addresses do not depend on the key, so nothing moves.
5. **`total_supply`** for explorers is reported by shards to the minter in batches (at most once a minute each); the exact value is the sum over shards.

## Properties

* Claims run in parallel on K contracts; K=16 gives ≈ 6 claims/s per shard at 100/s total, K can grow later if it is built into the address rule.
* The same guarantees: a signed root never expires, the caps hold, a compromised key can raise the ceiling by `maxGrowth` per period only, the admin can not mint.
* Costs: ≈ 1 TON once to deploy 16 shards, < 0.2 TON/day to raise the ceiling.

## Beyond the contracts (needed at 50 M DAU regardless)

* The ledger and the tree move off Telegram Serverless to a service with a sharded database; an incremental sparse sum-tree, proofs served from storage.
* Earn events are accepted in the Mini App in batches (bot callbacks hit Telegram's rate limits long before that).
* Balance reads come from our own indexer, on open and after actions — not by polling public APIs.
* Claim only when tokens leave the app (Send / withdraw), not on every earn: 100 M claims/day would cost players ≈ 500 000 TON/day in fees.
