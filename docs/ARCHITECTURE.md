# Architecture and trust model

## The one idea

The project keeps a number per player: `cumulative` — everything it has ever owed that player. The jetton-wallet
keeps another: `claimed` — everything already credited on-chain. A **claim** moves the difference:

```
delta = cumulative − claimed      (cumulative must be ≥ claimed: it never goes backwards)
balance += delta;  claimed = cumulative
```

Because `cumulative` only grows and the wallet stores `claimed`, a claim can be replayed, delayed or sent twice
without ever paying twice.

## Keys

| Key | Where | Does | If it leaks |
|---|---|---|---|
| **authority** (cold) | offline, public key baked into the token | signs *certificates* for hot keys | the token must be migrated (it is part of every wallet address) |
| **signer** (hot) | server / KMS | signs claims | attacker can sign claims until its certificate expires; raise `key_id` and issue a short-lived cert to cut it off |

```
cert  = sign_authority( "EGGC", master, signer_pubkey, key_id, not_after )
claim = sign_signer   ( "EGGL", master, owner, cumulative, valid_until )
payload = claim fields + cert fields + both signatures      // one cell, ~600 bits
```

The wallet checks, in order: claim not expired · certificate not expired · `key_id ≥ key_floor` ·
certificate signature (authority) · claim signature (signer) · `cumulative ≥ claimed`. The domain tags and the master
address in both signed messages mean a signature made for one token, network or purpose is worthless anywhere else.

`key_floor` is remembered per wallet: once a wallet has seen `key_id = 2`, signers with `key_id = 1` are refused there.

## Flows

**Earn.** Bot → `POST /v1/ingest {tg_id, amount, idempotency_key}` (bearer key). One transaction updates the event
log, the player's `cumulative` and the global `issued_total`, so a retry is a no-op and the supply cap is exact.

**Link.** Mini App → `POST /v1/link {address}` (Telegram `initData`). The address can change only until the first
claim has been signed; afterwards it is frozen, otherwise the same balance could be collected into a second wallet.

**Hatch (claim).** Mini App → `POST /v1/claim` → claim cell. The app sends either `op::claim` to the jetton-wallet, or
attaches the same cell as `custom_payload` of a normal `transfer`. If the wallet is not deployed yet, the first message
carries its StateInit (the app derives the code from the master's own `get_jetton_data`).

**Supply bookkeeping.** After crediting, the wallet sends the master a small `op::claimed(delta, owner)` message; the
master verifies that the sender is the genuine wallet of `owner` and adds `delta` to `total_supply`. `burn` subtracts.
So `total_supply` on-chain is truthful for explorers, and burns can never underflow.

## What changed from RMJ v1

See [`RMJ_V1_REVIEW.md`](RMJ_V1_REVIEW.md) for the findings. Structurally:

| v1 | now |
|---|---|
| Merkle tree, epochs, root vouchers, on-chain root updates, tree builder, proof API (≈6 000 lines of backend) | one signed claim per request |
| Wallet address depended on the signer key (rotation would orphan every wallet) | address depends only on owner, master, code and the cold authority |
| Two claim formats + compatibility shims for third-party wallets | one format; our wallet is the client |
| Master root/pause had no effect on wallets | no dead controls: expiry of certificates is the kill switch |
| `total_supply` ignored claims | `op::claimed` keeps it exact |
| Unauthenticated reward endpoint with a caller-controlled amount | bearer-authenticated, idempotent, capped per event and globally |

Trade-off accepted: balances are **not** visible in third-party wallets until claimed (they were only shown by wallets
that implement the TEP-177 proof API anyway). A public Merkle commitment can be added later without touching claims.

## Wallet app

* Keys: 24-word phrase, encrypted with AES-256-GCM under a key from PBKDF2-SHA256 (600 000 rounds) of the passcode;
  only ciphertext is stored; keys live in memory only while unlocked; auto-lock after 5 min idle or when the app is hidden.
* Wallet contract: v5r1. Messages are built once (`app/src/chain/actions.ts`) from `contracts/wrappers/messages.ts`, the
  same module the contract tests use, then handed to a `WalletProvider`:
  `BuiltinProvider` (signs locally) or `TonConnectProvider` (Telegram Wallet and any other TON Connect wallet).
* Pending balance = `server.cumulative − wallet.claimed`, shown as “in the nest”.

## Gas

The user attaches 0.1 TON (0.15 with a claim riding on a transfer). The wallet spends only what it needs and returns the
rest as excess; it never touches its own reserve. The test-suite asserts that a first claim, including wallet
deployment, costs the user less than 0.07 TON and that a plain transfer leaves the jetton-wallet's balance intact.

## Known limits

* **Not externally audited.** The contract is ~330 lines of FunC; get it reviewed before mainnet value.
* **The hot key is a custodian of issuance** up to its certificate lifetime. Keep certificates short (days, not months),
  keep the signer in a KMS, and keep `MAX_SUPPLY_UNITS` set. On-chain, the master cannot refuse a claim (the wallet has
  already credited it); the cap is enforced by the server before signing and `total_supply` makes any breach visible.
* **Authority is immutable.** Losing the authority secret means no new certificates can be issued (existing balances stay
  safe). Back it up like a root key.
* **Passcode strength.** A 6-digit passcode protects against casual access, not against someone who copies the encrypted
  vault and brute-forces it offline. The 24 words are the real backup; consider a longer passcode for large balances.
* **Not covered by automated tests yet:** live-network deploy, the Serverless host, real TON Connect sessions,
  Telegram's real `initData` from a device, and hostile-input tests of the contract paths beyond access control.
