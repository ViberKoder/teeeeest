# Architecture and what is actually guaranteed

## The idea

The project owes players tokens. Instead of paying each one on-chain (too expensive) or keeping the debt in a database
(then the server owns the money), the debt is **committed on-chain in a Merkle root**, and each player can *prove* their
share to the token contract themselves.

```
 bot ──ingest──▶ server ledger ──every N min──▶ sum-Merkle tree ──PublishRoot──▶ EggMinter (stores commitment)
                                       │                                              ▲
                              public leaf set + proofs                                 │ verifies proof, mints delta
                                       ▼                                              │
 wallet app ──AskToClaim(epoch, amount, proof)──▶ your EggWallet ──ClaimRequest──▶ EggMinter ──ClaimCredit──▶ your EggWallet
```

## Sum-Merkle tree

```
leaf = H(0x00 | owner:256 | cumulative:128)
node = H(0x01 | leftHash | leftSum:128 | rightHash | rightSum:128)
root = H(0x02 | treeRoot  | total:128)          ← what the minter stores per epoch
```
`H(x)` is the hash of the cell holding `x` (`builder.hash()` / HASHBU). Every node commits to the **sum** of the leaves below it and
a verifier recomputes that sum while walking the proof, so the root commits to the *total promised*. The tree is
implemented twice — Tolk (`contracts/contracts/merkle.tolk`) and TypeScript (`sdk/src/tree.ts`) — and the SDK tests run
trees built in TypeScript through the Acton-compiled bytecode in `@ton/sandbox`, so the two cannot drift.

## Contracts (Tolk, built and tested with Acton)

**EggMinter** — TEP-74/89 minter. Storage: `totalSupply`, `maxSupply`, `lastEpoch`, metadata, `roots: epoch → commitment`,
governance (admin, next admin, publisher), limits.

| Message | Who | Effect |
|---|---|---|
| `PublishRoot(epoch, treeRoot, total)` | publisher | stores `H(0x02|treeRoot|total)`. Requires: `epoch = last+1`, `total ≤ maxSupply`, `total ≥ lastTotal`, `Δtotal` per period ≤ `maxGrowth`, ≥ `minInterval` since the previous one |
| `ClaimRequest(owner, epoch, cumulative, claimedAtWallet, proof)` | **a genuine EggWallet only** (address recomputed from `owner`) | opens the proof, compares with `roots[epoch]`, checks `totalSupply + delta ≤ maxSupply`, adds `delta`, replies `ClaimCredit` |
| `ChangePublisher`, `SetLimits`, `ChangeMetadata`, 2-step admin change, `DropAdmin` | admin | governance. **There is no mint and no code upgrade** |
| `BurnNotification`, `RequestWalletAddress` | wallets / anyone | standard |

**EggWallet** — TEP-74 wallet plus `claimed` and a short lock.

| Message | Who | Effect |
|---|---|---|
| `AskToClaim(epoch, cumulative, proof)` | owner only | locks the wallet for 10 min, forwards `ClaimRequest` to the minter |
| `ClaimCredit(cumulative)` | **minter only** | credits `cumulative − claimed` (never more than the wallet's own state allows), unlocks, returns excess |
| bounce of `ClaimRequest` | system | unlocks (the minter refused: unknown epoch / bad proof) |
| transfer / burn / internal transfer | standard | internal credit only from the minter or a genuine wallet |

Wallet addresses depend on `(owner, minter, code)` only — nothing the project does later can move anyone's address.

## What is guaranteed, and by what

| Statement | Guaranteed by |
|---|---|
| Nobody can be credited an amount that is not in a published root | the minter verifies the proof itself; the wallet accepts `ClaimCredit` only from the minter |
| Nobody can be credited twice for the same amount | `claimed` in the wallet + monotone `cumulative`; replays credit 0 |
| What was published stays claimable forever | roots are never deleted or replaced; there is no admin function that edits them |
| A root cannot promise more than `maxSupply`, and can only grow | checked at publication; the sum is bound by the tree hash |
| Total supply never exceeds `maxSupply` | checked again at claim time |
| A compromised publisher can only release `maxGrowth` per period | on-chain limits |
| The server cannot take back or change a published amount | it holds no key that can touch the minter's roots or any wallet |
| `totalSupply` on-chain is truthful | minted at claim time; burns subtract |

## What is **not** guaranteed (be honest with your users)

* **Amounts not yet published.** The ledger entry for what a player earned in the last minutes is a promise of the
  server, not of the contract. The app shows it as “hatching”, separately from “ready”.
* **The publisher decides entitlements.** It can include or omit a player in a *new* root. It cannot touch old ones, and
  the limits bound the damage, but until the admin is dropped or becomes a multisig, rotating the publisher and raising
  limits is a human power. Decide deliberately who holds it.
* **Data availability.** To build a proof one needs the epoch's leaf set. The server serves it (`GET /v1/epochs/:n`);
  mirror it (IPFS, a public channel) and the app caches each user's last verified proof on the device. If you lose the
  data, an unproven amount cannot be claimed.
* **A malicious publisher can promise the same tokens to different people in different epochs** (each root is below the
  cap, but the sum of everyone's best proof is not). The claim-time cap stops supply from exceeding `maxSupply`, so the
  *later* claimants would be refused. Publishers must keep each user's amount non-decreasing; the public leaf sets make
  this auditable by anyone.
* **A failed claim keeps its TON** in the user's wallet contract (bounced messages return there). The app avoids it by
  verifying the proof locally against the on-chain commitment first.
* **Not externally audited.**

## Cost to the user (measured in the sandbox)

A claim, including deploying the wallet contract, costs about **0.004 TON**; the app attaches 0.08 TON and the rest
returns as excess.

## Components

| Package | Role |
|---|---|
| `contracts/` | Tolk sources, 14 Acton tests, `artifacts/*.json` (bytecode used by the TS packages) |
| `sdk/` | tree + proofs, message builders, contract init, entitlement client — Node and browser |
| `server/` | ledger, publisher loop (pending → sent → confirmed), public entitlement/epoch API, ban/slash |
| `app/` | the wallet Mini App; verifies every proof against the chain before sending |

## Wallet app

* Keys: 24 words, encrypted with AES-256-GCM under PBKDF2-SHA256 (600 000 rounds) of the passcode; keys only in memory while
  unlocked; auto-lock on idle/hide. A 6-digit passcode stops casual access, not offline brute force of a copied vault.
* v5r1 wallet contract; or any wallet over TON Connect through the same `WalletProvider` interface.
* Telegram-native: colours from `--tg-theme-*`, grouped lists, the platform's `MainButton`/`BackButton`, haptics.
