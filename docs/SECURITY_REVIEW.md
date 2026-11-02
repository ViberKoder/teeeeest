# Security review of the EGG token and its stack (v2, pre-launch)

Scope: `contracts/` (EggMinter, EggWallet, Merkle), `sdk/`, `server/`, `app/`. This is a self-review, **not an external audit**.
Every finding below has a regression test unless marked *doc*.

## Fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High** | **The growth limit could be bypassed.** The tree's inner sums are only checked along the claimed path, so `total` is not a binding bound on the leaves. A compromised publisher could publish many roots with the *same* `total` and different recipients, and every recipient could mint — up to `maxSupply`, ignoring `maxGrowth`. | The minter tracks `totalMinted` (never lowered by burns) and refuses a claim that would push it past the **newest published total**, which the limits bound. Test: `supply: what was ever created stays within the newest published total`. |
| 2 | **High** (governance) | `SetLimits` let the admin raise `maxGrowth` to the cap, so a stolen admin key could open the tap (change publisher → raise limits → mint up to `maxSupply`). | Limits can **only be tightened** on-chain (`LimitsLoosened`). Choose them at deployment; the deploy script now requires `MAX_GROWTH` explicitly and refuses `admin == publisher`. |
| 3 | Medium | **Address squatting**: `/v1/link` accepted any address, so anyone could bind a victim's address to their own Telegram account and lock the victim out of linking it. | Linking requires the wallet's own signature (`egg-link:v1:<tg_id>:<address>`) and the address must be the WalletTg of that key. A signature for another account or by another key is refused. |
| 4 | Medium | **Publication stall**: if the ledger grew by more than `maxGrowth` within one epoch, the contract would refuse every root and the publisher would resend forever. | `MAX_GROWTH_UNITS`: the ingest API answers `429 growth-budget` (the bot retries with its idempotency key) instead of letting the ledger outrun what the contract accepts. |
| 6 | **High** | **Two wallets for one Telegram account → the same EGG claimed twice.** A second device that did not find the key (slow or failed Telegram CloudStorage) created a *different* wallet and silently re-linked the account to it. The ledger is per account, but each wallet's leaf from an older root stays claimable forever, so both wallets could claim the same amount. | (a) An address becomes the account's wallet **for good** the moment it enters a root that is sent (`users.locked`); the server refuses any other address afterwards. (b) A verified address is never replaced silently; replacing is possible only before it was ever published. (c) The app never creates a wallet before asking the account whether it already has one, and treats "Telegram storage did not answer" as *unknown*, not *none*; `create` re-reads the backup right before writing. (d) A device whose wallet differs from the account's shows "This account already has a wallet — enter its Secret Phrase". |
| 5 | Doc | The README/architecture claimed "a publisher cannot promise more than it declares". True only for what an honest auditor recomputes from the public leaf set; on-chain, the binding bound is #1's. | Docs corrected. |

## Checked and fine

* Claims verify a proof against a root the minter itself stores; the wallet accepts credit only from the minter; leaf/node/root hashes carry distinct tags and lengths (no second-preimage reuse of a node as a leaf); sums are `uint128` and range-checked on serialisation; proof depth is capped (64 steps).
* Replays credit nothing (`claimed` is monotone in the wallet); concurrent claims are serialised by a wallet lock; a bounced `ClaimRequest` unlocks.
* Wallet address depends only on `(owner, minter, code)`; there is no upgrade path, no mint message, no admin function that edits or deletes a root.
* Server: initData HMAC and freshness, constant-time key comparison, zod validation, body limit, rate limits, idempotent ingest, relay re-derives the wallet and checks the message and value.

## Username transfers (vault)

Deposits are identified by an on-chain comment `@username`; payout goes only to the verified wallet of the Telegram account whose (platform-verified) username matches, once per deposit (unique `event_key`); refunds only to the depositing wallet after 7 days. The vault is custodial for funds in transit (see `docs/BOT.md`). A username is a mutable handle: if it changes hands before collection, the new owner collects.

## Residual risks (known, accepted — decide before mainnet)

1. **Publisher can still choose who gets what** in *new* roots, within `maxGrowth` per period (and up to twice that across a window boundary). Until the admin is dropped or is a multisig, the admin can also replace the publisher. Keep the admin cold, then `DropAdmin` once parameters are proven.
2. **Window-edge burst**: `maxGrowth` per period can be used at the end of one window and again at the start of the next (≤ 2× in a short span).
3. **Lock expiry race** (10 min): if a `ClaimCredit` were delayed beyond the lock, a second claim could be counted twice in the minter's supply (the wallet still credits once). The excess only consumes cap, never a wallet balance. Delays of that size are not expected on TON.
4. **Data availability**: if every copy of an epoch's leaf set is lost, proofs for it cannot be rebuilt. Mirror `GET /v1/epochs/latest` publicly.
5. **Relayer budget**: sponsorship is capped per Telegram account (default 3) but Telegram accounts are cheap; the relayer wallet is a hot wallet with a bounded balance — fund it accordingly.
6. **Telegram CloudStorage backup**: whoever controls the Telegram account can restore the wallet (same trust model as Money). Users can switch to self-custody.
7. **Not externally audited.** Get an audit before real value is at stake.
