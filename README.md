# EGG

A **self-custody TON wallet that lives inside Telegram** (Mini App) and the **EGG jetton** behind it — a token whose
distribution is enforced by the contract, not by a server.

Players earn EGG in a bot or game. What they have earned is committed in a **Merkle root signed by the publisher key**; to receive it they
*prove* their share to the token contract with their own wallet, and pay the ≈ 0.005 TON network fee of that claim. Nobody — including the project — can take back or alter what a
signed root contains, and nobody can be credited more than it contains. Nothing is published on-chain per update.

```
bot ledger ─▶ sum-Merkle tree ─▶ root signed by the publisher key (free, on demand) ─▶ player's claim carries root + proof ─▶ minter verifies both ─▶ EGG credited
```

| Package | What it is |
|---|---|
| [`contracts/`](contracts) | **Tolk** minter + jetton wallet (Acton, 20 tests) and the vendored Telegram wallet contract `WalletTg` |
| [`sdk/`](sdk) | Tree + proofs, message builders, entitlement client — for the server, the app and *other projects* |
| [`server/`](server) | Operator tools (deploy the minter, generate wallets) and the tests that pin the Serverless pure-JS library to the SDK and the contracts |
| [`app/`](app) | The wallet Mini App: Telegram-native (Money-style), seedless, deployable to Telegram Serverless |
| [`docs/`](docs) | [Architecture & guarantees](docs/ARCHITECTURE.md) · [Showing EGG elsewhere](docs/INTEGRATIONS.md) · [Deploy](docs/DEPLOY.md) · [Scaling](docs/SCALING.md) · [Explorer](docs/EXPLORER.md) · [Review of v1](docs/RMJ_V1_REVIEW.md) · [Security review](docs/SECURITY_REVIEW.md) |

## Quick start

```bash
npm install
(cd contracts && acton test)          # needs Acton: https://ton-blockchain.github.io/acton/
npm test                              # contracts + sdk + server + app
# design preview, no chain and no server needed
cd app && VITE_DEMO=1 VITE_JETTON_MASTER=0:$(printf 'ab%.0s' {1..32}) npm run dev   # http://localhost:5180/?demo=home
```

## Principles

* **One mechanism.** A claim is a Merkle proof the minter checks against a root the publisher key signed; the signature is checked on-chain too.
* **Everyone can verify.** The app checks the signature (against the key stored in the contract) and the proof before sending anything; every signed root is logged publicly.
* **Bounded authority.** The publisher can only publish roots, at most `maxGrowth` per period and never above `maxSupply`; the admin can rotate it, can't mint, and can drop itself.
* **A standard token.** TEP-74/89 with on-chain TEP-64 metadata — explorers, wallets and DEXes treat it like any other jetton.
* **Money-like numbers never touch floats.**

Status: working prototype. **Not externally audited** — read the “not guaranteed” list in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before putting value behind it.
The jetton logic is derived from the MIT-licensed jetton template shipped with Acton. MIT licensed.
