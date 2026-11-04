# Showing EGG in other products

EGG is an ordinary **TEP-74 jetton** (with TEP-89 wallet discovery and TEP-64 metadata stored **on-chain**). Anything that
supports jettons supports it — there is nothing EGG-specific to implement for balances, transfers, supply or holders.

The only EGG-specific idea is the *claim*: tokens that are committed in a published root but not yet in the player's
wallet. That part is optional and has a one-screen integration.

## 1. Explorers and DEXes (tonviewer, tonscan, STON.fi, …)

What they read, and what EGG provides (all asserted by tests in `contracts/tests/standards.test.tolk` and the SDK suite):

| They read | EGG |
|---|---|
| `get_jetton_data()` → `(supply, mintable, admin, content, wallet_code)` | standard shape; `supply` is truthful (minted at claim, reduced by burn) |
| `get_wallet_address(owner)` on the minter | standard; deterministic |
| `get_wallet_data()` on a wallet → `(balance, owner, minter, code)` | standard |
| TEP-74 `transfer` / `internal_transfer` / `transfer_notification` / `burn` | standard, forward payloads as `Either Cell ^Cell` |
| TEP-89 `provide_wallet_address` / `take_wallet_address` | standard |
| TEP-64 metadata | **on-chain**: `name`, `symbol`, `decimals`, `description`, `image` are stored in the minter, so nothing depends on a web server (an optional `uri` can be added) |

So nothing needs to be special-cased: an indexer that follows jettons will list the token, holders and transfers once the
minter is deployed and has activity.

**Things only you can do** (no code trick replaces them):

* **Deploy and use it** — explorers discover a jetton by its on-chain activity. Run the testnet flow in `DEPLOY.md`,
  then mainnet.
* **Curated lists / verification.** Wallets and explorers keep their own "verified" lists (for example the community
  `tonkeeper/ton-assets` repository). Submit the token through each project's published process, with the real master address,
  logo and links. Verification is granted by them; it cannot and should not be forced.
* **Trading.** STON.fi (or any DEX) shows pairs that have a pool. Create one with liquidity through the DEX's own interface
  or SDK, with a treasury address that claimed its allocation like any other holder (`team`, `liquidity` allocations are just
  leaves in the tree).
* Each explorer has its own contact / listing form for logos and token pages; use those.

What this repository deliberately does **not** do: no spoofed metadata, no imitation of other tokens' names, symbols or
logos, no tricks to make indexers believe the token is something it is not. Any of that would mislead users, get the
project delisted, and has no place in a token whose point is that users can verify what they own.

> About `actonscan.com`: I could not find or verify that site, so nothing here targets it. If it is an explorer built on
> the standards above, it needs nothing special either. If you can share what it is, I will check it.

## 2. Wallets and dApps that want to show "pending EGG"

Unclaimed EGG is **not** a balance in the wallet contract, so standard jetton UIs cannot show it. Anything that wants to can
use the public entitlement API and the SDK:

```ts
import { Address, Cell } from '@ton/core';
import { verifyEntitlement, signedRootCell, askToClaimBody, Attach, walletStateInit, eggWalletCode } from '@egg/sdk';

const owner = Address.parse(userAddress);
const ent = await callBot('entitlement', { address: owner.toRawString() });   // { owner, cumulative, proof, root:{treeRoot,total,seq,signature} } | not found
if (ent) {
  // never trust the bot: the signature is checked against the key stored in the minter contract
  const key = await minterGetPublisherKey(minter);                            // get_publisher_key()  (32 bytes)
  if (verifyEntitlement(ent, minter, key)) {
    const pending = BigInt(ent.cumulative) - claimedByWallet;                 // get_claim_state().claimed, 0 if not deployed
    // show `pending` as "ready to claim"
  }
}

// claim: one internal message from the user's wallet to their jetton-wallet
const { init, address } = walletStateInit(owner, minter, eggWalletCode);
send({
  to: address,
  value: Attach.claim,                                  // 0.08 TON; ~0.005 is spent, the rest returns
  stateInit: deployed ? undefined : init,               // the first claim deploys the wallet
  body: askToClaimBody({ cumulative: BigInt(ent.cumulative), proof: Cell.fromBase64(ent.proof), root: signedRootCell(ent.root) }),
});
```

### Bot endpoints (Telegram Serverless; `tgcloud` calls, no key)

| Endpoint | Answer |
|---|---|
| `entitlement {address}` | `{ owner, cumulative, proof(base64 BoC), root }` where `root` is the newest root the publisher signed, or "no-entitlement" |
| `me` | the caller's ledger total, linked wallet and the same entitlement |

### Message layouts

```
AskToClaim   (to the user's own jetton-wallet) op 0x28dac35b  query_id:uint64  cumulative:Coins  ^proof  ^signedRoot  next:Maybe ^cell
ClaimRequest (wallet → minter, internal)        op 0x87a42c7c
ClaimCredit  (minter → wallet, internal)        op 0x49e1974f
signedRoot   treeRoot:256 total:Coins seq:64 signature:512      (signature over H(0x45474752 | minter hash | treeRoot | total | seq))
proof cell   hasNext:1 count:2 (siblingHash:256 siblingSum:128 siblingOnRight:1)×count [^next]
```

Minter getters for integrators: `get_publisher_key()`, `get_max_total()`, `get_limits()`, `get_last_seq()`, `get_max_supply()`, `get_total_minted()`.
Wallet getter: `get_claim_state() → (claimed, claimLockedUntil)`.

### Why this is safe to show

The numbers an integrator displays are checked against the key the contract stores, and the contract re-checks them when
the user claims. An integrator that shows a wrong number cannot cause a wrong credit; a user cannot claim more than the root
holds.
