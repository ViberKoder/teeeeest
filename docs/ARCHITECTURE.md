# Rolling Mintless Jetton — Architecture

## Problem and goals

Tap-to-earn games, inline-button bots, and other real-time reward products on
TON face a three-way trade-off between:

1. **User friction** — nobody wants to press "Claim" every few minutes.
2. **Project gas burn** — paying a jetton transfer per reward event kills
   unit economics at scale.
3. **Verifiability** — the user's balance should be provably on-chain, not
   a centralized IOU.

Rolling Mintless Jetton (RMJ) reaches all three by extending the standard
[TEP-176/177 Mintless Jetton](https://docs.ton.org/standard/tokens/jettons/mintless/overview)
with a **cumulative** claim state stored inside every jetton-wallet.
The user's claim is piggy-backed on any regular jetton transfer they
already make. The user pays their normal transfer gas; the project pays
only for the occasional on-chain Merkle root update.

## High-level flow

```
┌──────────────┐    taps / clicks     ┌──────────────────────────┐
│  Telegram    │ ───────────────────▶ │       Game Server         │
│  Bot / TMA   │                      │  (rate-limits, anti-cheat)│
└──────┬───────┘                      └──────────────┬───────────┘
       │                                              │ writes cumulative
       │ connects                                     ▼
       │                         ┌───────────────────────────────┐
       │                         │        Tree Builder           │
       │                         │ (every N min: rebuild Merkle) │
       │                         └───────┬───────────┬───────────┘
       │                                 │           │
       │                       signs root│           │ commit root
       │                                 ▼           ▼
       │                    ┌──────────────┐  ┌──────────────────┐
       │                    │Voucher Signer│  │  Root Updater    │
       │                    │  (ed25519)   │  │ (admin wallet)   │
       │                    └──────┬───────┘  └────────┬─────────┘
       │                           │                   │
       │          proof + voucher  │                   │ on-chain tx
       │◀──────────────────────────┼──────────────     │
       │      (Proof API)          │                   ▼
       ▼                           │         ┌───────────────────┐
┌──────────────┐  transfer with    │         │ Jetton Master     │
│  Tonkeeper   │  custom_payload   │         │  (merkle_root,    │
│              │ ─────────────────▶│         │   epoch, signer)  │
└──────┬───────┘                   │         └─────────┬─────────┘
       │                           │                   │
       │          custom_payload includes:             │ delegates
       │              - merkle proof                   │ claim to
       │              - root voucher (lazy sync)       ▼
       ▼                                     ┌───────────────────┐
┌──────────────┐                             │ Jetton Wallet     │
│  Recipient   │◀────────────────────────────│ (already_claimed, │
│  (DEX/self)  │         regular transfer    │  cached_root,     │
└──────────────┘                             │  signer_pubkey)   │
                                             └───────────────────┘
```

## User journey (the 5 moments)

1. User earns `N` jettons off-chain (taps / clicks / any game action).
   The server increments `user_balances.cumulative_amount` in SQLite.
2. Every epoch (default 10 min) the Tree Builder rebuilds an Airdrop
   HashMap (`HashMap 267 AirdropItem`) with every active user's
   **cumulative** amount, produces a new root, signs a voucher, and
   the Root Updater posts `op::update_merkle_root` on-chain.
3. Tonkeeper (or any wallet honoring TEP-177's `custom_payload_api_uri`)
   periodically polls the Proof API and displays the user's unclaimed
   cumulative as a "pending" balance.
4. The user eventually transfers or swaps their jetton. Tonkeeper attaches
   the Proof API response as `custom_payload`. The jetton-wallet:
   - Verifies the root voucher signature against its cached
     `signer_pubkey` and lazily updates `cached_merkle_root/epoch`.
   - Verifies the Merkle proof commits to the cached root.
   - Reads the user's leaf and computes
     `delta = cumulative_amount - already_claimed`.
   - Credits `delta` to the wallet balance and sets
     `already_claimed := cumulative_amount`.
   - Continues the regular TEP-74 transfer to the destination.
5. Later the user earns another `M` jettons. Steps 2-4 repeat with a new
   root, new voucher, new proof — and the wallet credits an incremental
   `M`-jetton delta on the next user-initiated transfer.

## Key design decisions

### `already_claimed: Coins`, not `Boolean`

The sole mechanical difference from TEP-177 is that the jetton-wallet
stores the **last claimed cumulative amount**, not a one-shot flag. The
claim logic reduces to:

```
if new_cumulative > already_claimed:
    mint_delta = new_cumulative - already_claimed
    already_claimed = new_cumulative
```

This makes the claim **monotonically cumulative** and safely replay-proof.

### Lazy root propagation via voucher

The jetton-wallet caches the last merkle root it verified, so claims are
purely local and don't require an RPC round trip to the master. A new
root is delivered to the wallet by the Proof API attaching a small
signed voucher (`epoch`, `new_root`, ed25519 signature) alongside the
proof. The wallet verifies the signature against its `signer_pubkey`
(set at deploy) and updates its cache before proof verification.

### Signer isolation

`signer_pubkey` (baked into every wallet at deploy time) is **separate
from** `admin_address` on the master. A compromised signer can poison
root vouchers; a compromised admin can poison the on-chain root. Using
distinct keys — and ideally multisig for admin — requires two
independent compromises before funds can be stolen.

### Empty-tree safety

A freshly deployed master has a zero Merkle root. No user has a proof to
submit against a zero root, so no claims succeed until the first epoch
advance. This is intentional: the wallet rejects stale-amount claims
(`cumulative_amount <= already_claimed`) even against a valid proof.

### Bans happen at tree boundary, not instantly

Banned users are excluded from subsequent tree rebuilds. An in-flight
transaction against the previous epoch's root can still settle once
(because the root is still valid for up to the current epoch). This is
an acceptable trade-off — for stricter control, pause the master.

## Cost model

For 100 000 DAU with adaptive settlement (epoch every 10 min, root
committed only when activity caused change), expected TON spend:

| Cost                | Units      | TON/day | USD/day (TON=$3) |
|---------------------|------------|---------|------------------|
| Root updates        | 144/day    | ~1.5    | ~$4.5            |
| Backend hosting     | Node + DB  | —       | ~$10             |
| **Total project**   |            |         | **~$15/day**     |
| **User-paid claims**| piggy-back | **0**   | **$0**           |

Contrast with sponsored signed-receipt push that costs the project
roughly $0.01 TON per settlement × frequency.

## Failure modes and mitigations

| Mode                          | Mitigation                                      |
|-------------------------------|-------------------------------------------------|
| Signer key compromised        | `op::update_signer` + pause + re-key migration  |
| Admin key compromised         | multisig admin (2/3)                            |
| Proof API down                | wallets keep cached balance; resumes when back  |
| Tree builder crash mid-epoch  | idempotent replay; SQLite WAL journal           |
| Chain congestion              | Root Updater retries with fresh seqno           |
| User never transfers          | pending balance remains visible in Tonkeeper    |
| Race on epoch boundary        | wallet rejects stale voucher → TC retries       |

See also [`OPERATIONS.md`](./OPERATIONS.md).
