# Architecture and what is actually guaranteed

## The idea

The project owes players tokens. Instead of paying each one on-chain (too expensive) or keeping the debt in a database (then the server
owns the money), the debt is committed in a **Merkle root signed by the publisher key**, and each player *proves* their share to the
token contract themselves, in their own claim. **Nothing is published on-chain per update**: the root travels inside the claim.

```
 ledger ──▶ sum-Merkle tree ──▶ root signed by the publisher key (off-chain, free, on demand)
                                         │
 wallet app ──AskToClaim(cumulative, proof, signedRoot)──▶ your EggWallet ──ClaimRequest──▶ EggMinter ──ClaimCredit──▶ your EggWallet
                                                                                  │ checks: signature of the root (key stored in the contract),
                                                                                  │         the proof opens to exactly that root,
                                                                                  │         limits (growth, cap), one root per `seq`
```

The player pays the network fee of their own claim (≈ 0.005 TON, measured), the project pays **nothing per root** — the earlier design
(a PublishRoot transaction every few seconds) cost the project continuously and made the contract's storage grow without bound.

## Sum-Merkle tree

```
leaf = H(0x00 | owner:256 | cumulative:128)
node = H(0x01 | leftHash | leftSum:128 | rightHash | rightSum:128)
root = what the publisher signs, together with `total` (= the root node's sum), the minter's address and a counter `seq`
signed digest = H(0x45474752 | minter hash:256 | treeRoot:256 | total:128 | seq:64)
```
`H(x)` is the hash of the cell holding `x` (`builder.hash()` / HASHBU). Every node commits to the **sum** of the leaves below it and a
verifier recomputes that sum while walking the proof. The tree is implemented three times — Tolk (`contracts/contracts/merkle.tolk`),
TypeScript (`sdk/src/tree.ts`) and plain JS for the Serverless runtime (`app/tgcloud/lib/tree.js`) — and tests run all of them through the
Acton-compiled bytecode in `@ton/sandbox`, so they cannot drift.

## Contracts (Tolk, built and tested with Acton)

**EggMinter** — TEP-74/89 minter. Storage is **constant-size**: supply numbers, metadata, governance, the signing key (+ the previous key and what it had
promised), the growth limits and the last `(seq, root)` slot. There is no per-epoch registry.

| Message | Who | Effect |
|---|---|---|
| `ClaimRequest(owner, cumulative, claimedAtWallet, proof, signedRoot)` | **a genuine EggWallet only** (address recomputed from `owner`) | checks the root's signature (publisher key, or the previous key within what it promised), that the proof opens to **exactly that root**, the one-root-per-`seq` slot, the growth limits and the caps; adds the delta to the supply and replies `ClaimCredit` |
| `ChangePublisherKey(newKey)` | admin | the old key keeps value **only up to the highest total promised so far** (`legacyCap`): what it signed earlier stays claimable, a stolen old key can promise nothing more |
| `SetLimits`, `ChangeMetadata`, 2-step admin change, `DropAdmin` | admin | governance. **No mint, no code upgrade**; limits can only be *tightened* |
| `BurnNotification`, `RequestWalletAddress` | wallets / anyone | standard |

**EggWallet** — TEP-74 wallet plus `claimed`, a short lock, and "claim and send" (a claim can carry a transfer instruction that runs right after the credit).

| Message | Who | Effect |
|---|---|---|
| `AskToClaim(cumulative, proof, signedRoot, next?)` | owner only | locks the wallet for 10 min, forwards `ClaimRequest` to the minter |
| `ClaimCredit(cumulative, next?)` | **minter only** | credits `cumulative − claimed` (never more than the wallet's own state allows), unlocks, then runs `next` if it fits |
| bounce of `ClaimRequest` | system | unlocks (the minter refused: bad signature / proof / limit) |

Wallet addresses depend on `(owner, minter, code)` only — nothing the project does later can move anyone's address.

## What is guaranteed, and by what

| Statement | Guaranteed by |
|---|---|
| Nobody can be credited more than their leaf in a root the publisher key signed | the minter verifies the signature **and** the proof; the wallet accepts `ClaimCredit` only from the minter |
| Nobody can be credited twice for the same amount | `claimed` in the wallet + monotone `cumulative`; replays credit 0 |
| **A signed root can not be revoked** | the signature never expires and amounts only grow; a later root that omits someone does not invalidate an earlier one |
| Everything ever created ≤ the highest total ever promised ≤ `maxSupply` | `totalMinted ≤ maxTotal ≤ maxSupply`, checked at every claim |
| A compromised publisher key can raise the promised total by at most `maxGrowth` per period | the minter's growth window (a claim whose root raises `maxTotal` must fit it) |
| After a key rotation the old key can promise nothing new | `legacyCap` |
| Two different roots can not share a `seq` | the last-slot check at claim time |
| Admin can not mint, and can only tighten limits | contract code |
| `totalSupply` on-chain is truthful | minted at claim time; burns subtract |

## What is **not** guaranteed (be honest with your users)

* **Who is in the tree and for how much** is the publisher's decision: the contract bounds the total, not the allocation.
* **Amounts earned but not yet in a signed root** (seconds, or until the player's next request) are the bot's promise, shown as "hatching".
* **Equivocation.** The publisher *can* sign two different roots at different `seq` values; the contract bounds the total they can promise, and the public log of every signed root (`roots` table, mirrored) makes it detectable by anyone. It can not be prevented on-chain without publishing every root.
* **Data availability.** To build a proof one needs the leaf set; the wallet app caches the last verified (signed root + proof) on the device and a signed root never expires.
* **A failed claim keeps its TON** in the user's wallet contract (bounced messages return there). The app avoids it by verifying locally first.
* **Not externally audited.**

## Cost to the user (measured in the sandbox)

A claim, including deploying the jetton wallet, costs about **0.0027 TON** (4 leaves) to **0.0045 TON** (131 000 leaves) in network fees; each tree level adds ≈ 0.00013 TON.
The app attaches 0.08 TON and the rest returns as excess (0.2 for "claim and send"). Measured on testnet with a real claim: **0.0051 TON**, credited in ~4 s after the transaction was accepted.

## The player's wallet (modelled on Telegram's Money)

Studied: [`tg-wallet-contract`](https://github.com/ton-blockchain/tg-wallet-contract) (the `WalletTg` contract) and the `Wallet` component of Telegram-iOS.

**Contract.** Every player's wallet is `WalletTg` (MIT, TON Core), deployed *byte for byte* from the published revision 00
(`contracts/contracts/TgWallet`). Its storage is `seqno, subwalletId, publicKey`; requests are `SignedRequest = signature(512) + request`
with a replay header `(subwalletId, validUntil, seqno)`; external and internal requests differ only in opcode, so a request
signed for one channel is useless on the other; the key can be rotated (signed by the old key, proven by the new one) and the
address stays the same. Telegram runs it behind a "trampoline" that jumps to code stored in the network config (updated by validator voting). EGG can't
do that, so the same code simply is the account's code.

**No seed phrase on the way in.** Like Money, the wallet is part of the Telegram account: opening the Mini App creates it, nobody is
asked to write anything down.
* Keys are generated on the device. The working copy is on the device; the account-bound backup is in Telegram **CloudStorage**, so the wallet
  opens on every device where the user is signed in. *(Trust: Telegram, and anyone who controls the Telegram account, can restore the wallet — the same as Money with its backup on. The
  operator of this app can not read it.)*
* **Keys & Backup** (like Money's screen): *Encrypted Backup* on/off (off ⇒ the Secret Phrase is needed in every new Telegram session), *Show Secret Phrase*, and
  **Switch to self-custody**, which shows a NEW phrase first, stages it on the device, rotates the wallet's key on-chain, erases Telegram's copy and keeps the address.
  If the app dies mid-rotation, the staged phrase is adopted once the chain shows the new key.

**First hatch costs the player nothing.** A new wallet has no TON, so the first claim is signed offline as an *internal* request and delivered by the
server's relayer (`POST /v1/relay`). The relayer only ever forwards *the player's own claim* (it re-derives the wallet from the
public key, the player's jetton-wallet from the wallet, and checks the message and its value), a few times per Telegram account, and not for players who can pay.
The change from the claim returns to the player's own wallet, which then pays its own fees with ordinary external requests.

## Wallet app (Mini App)

* Telegram-native: colours from `--tg-theme-*`, grouped lists, the platform's `MainButton`/`BackButton`, haptics. The EGG card, pager, "Hatch" + "Send" buttons and the
  amount screen with its own keypad follow Money's layout; the identity is EGG's (the egg, a warm card, "nest" progress), with TON as the secondary card for fees.
* Every proof is checked locally against the on-chain commitment before anything is sent.
* **Home hero.** A real-time 3D egg (raw WebGL, no 3D library): drag to rotate with inertia, pinch / wheel to zoom (it always eases back to its resting pose and zoom on release), idle spin, tap for a burst of sparkles
  (point-sprite particles, Telegram-Premium style). Below it the egg counter (count-up), then Hatch / Send / Receive / Swap.
* **Launch splash.** The `egghatch.tgs` sticker (gzip Lottie, played with `lottie-web` light) while the wallet opens; it falls back to the SVG egg where unsupported.
* **Font.** Onest (open licence, bundled through `@fontsource-variable/onest`, Latin + Cyrillic).
