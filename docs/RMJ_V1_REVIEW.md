# Review of Rolling Mintless Jetton v1 (the previous implementation)

Scope: `contracts/*.fc`, the Node backend and the TEP-177 compatibility layers as they stood on `main`.
Method: reading the code and running the existing 16 sandbox tests (all passed — none exercised hostile input).
Findings are listed by severity with the fix applied in this rewrite. No exploit code is included on purpose.

## Critical

1. **Jetton-wallet credited tokens on any `internal_transfer` without checking who sent it.**
   A TEP-74 wallet must accept it only from the master or a genuine wallet of the same jetton.
   *Fix:* `receive_tokens` verifies `sender == master` or `sender == wallet_address(from)`.
2. **TEP-177 claim path trusted a root taken from the proof itself.**
   The claim then compared that root with itself, so the proof did not have to come from the project's tree.
   *Fix:* removed. Only a claim signed by a certified key is accepted.
3. **Reward endpoint was unauthenticated and accepted a caller-chosen amount** (`POST /v1/action {reward}`), with the
   documented bounds not implemented and the global cap off by default.
   *Fix:* bearer-authenticated server-to-server ingest, idempotency keys, per-event cap, atomic global cap.

## High

4. **Signer key was part of every wallet's address and could not be rotated**; `update_signer` would have changed all
   addresses. Pause on the master did not affect wallets. There was no way to stop a leaked key.
   *Fix:* cold authority + short-lived certificates + `key_floor`; address independent of the hot key.
5. **Voucher signature had no domain separation** (no master address, no network, no purpose). Two tokens sharing a signer
   (the config allowed it) could accept each other's vouchers.
   *Fix:* tagged, master-bound digests for certificates and claims.
6. **Master's on-chain root was decorative**: wallets trusted only the off-chain signer, so the on-chain commitment gave
   no assurance it appeared to. *Fix:* no pretence — the trust model is stated in `ARCHITECTURE.md`.

## Medium / low

7. `total_supply` ignored claims; `burn_notification` could underflow it and the burned tokens were not restored on bounce.
   *Fix:* `op::claimed` bookkeeping; bounced burns restore the balance.
8. `forward_payload` was parsed as `Maybe ^Cell` instead of TEP-74's `Either Cell ^Cell`, silently dropping inline payloads;
   `transfer_notification` carried the wallet address instead of the sender's owner. *Fix:* TEP-74 compliant.
9. Fee check counted the inbound value twice (`my_balance` already includes it). *Fix:* single, tested accounting with
   `raw_reserve` so the wallet's own TON is never spent.
10. Admin token compared with `===` and named `JWT_SECRET` although it is a static bearer. *Fix:* constant-time compare.
11. A 2.8 MB database dump (`backup.sql`) and other operational files live in the separate `bot` repository; remove them
    from git history and rotate anything that was ever stored there.

## What was kept

TEP-74 shape, the idea of piggy-backing the claim on the user's own transfer, SQLite/Fastify for the server,
the Telegram `initData` login, and the sandbox-test approach.
