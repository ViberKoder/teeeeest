# Review of Rolling Mintless Jetton v1 (the previous implementation)

Scope: the FunC contracts, the Node backend and the TEP-177 compatibility layers on `main` before the rewrite. Method: reading the
code and running its 16 sandbox tests (all passed — none exercised hostile input). Findings are listed by severity with how the
current design answers each. No exploit code is included on purpose.

## Critical

1. **A jetton-wallet credited tokens on any `internal_transfer` without checking who sent it.** A TEP-74 wallet must accept
   it only from the minter or a genuine wallet of the same jetton.
   *Now:* `InternalTransferStep` is accepted from the minter or from the address recomputed for `transferInitiator`; `ClaimCredit` only from the minter.
2. **The TEP-177 claim path trusted a root taken from the proof itself** and compared it with itself, so the proof did not have
   to come from the project's tree.
   *Now:* the minter compares the opened proof with the commitment **it stores** for the epoch; wallets never verify proofs.
3. **The reward endpoint was unauthenticated and accepted a caller-chosen amount**, with the documented bounds not
   implemented and the global cap off by default.
   *Now:* bearer-authenticated, idempotent, per-event and global caps; the contract caps the supply independently.

## High

4. **The signer key was part of every wallet's address and could not be rotated**; pausing the master did nothing to wallets.
   *Now:* no hot key can create tokens at all; the publisher can be replaced by the admin, and its output is rate-limited on-chain.
5. **Voucher signatures had no domain separation**, so two tokens sharing a signer could accept each other's vouchers.
   *Now:* no signatures are verified on-chain; commitments are tagged and live in one contract.
6. **The master's on-chain root was decorative**: wallets trusted only an off-chain key.
   *Now:* the on-chain root is the single source of truth.

## Medium / low

7. `total_supply` ignored claims; burning could underflow it.  *Now:* supply grows at claim time, shrinks on burn.
8. `forward_payload` parsed as `Maybe ^Cell` instead of `Either Cell ^Cell`; notifications carried the wrong sender.  *Now:* TEP-74 compliant (template-based).
9. Fee checks counted the inbound value twice.  *Now:* the audited jetton template's fee logic.
10. Admin token compared with `===`, named like a JWT secret.  *Now:* constant-time compare, separate roles.
11. A 2.8 MB database dump (`backup.sql`) and other operational files are in the separate `bot` repository; remove them from git history and rotate anything that was ever stored there.

## What was kept

The TEP-74 shape, the idea of paying fees from the user's own transaction, SQLite/Fastify for the server, the Telegram `initData`
login and the sandbox-test approach. The Merkle idea itself survives — but anchored in the minter instead of an off-chain voucher.
