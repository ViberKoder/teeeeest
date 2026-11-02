# EGG

A **self-custody TON wallet that lives inside Telegram** (Mini App) and the **EGG jetton** behind it — a token whose
distribution is enforced by the contract, not by a server.

Players earn EGG in a bot or game. What they have earned is committed **on-chain in a Merkle root**; to receive it they
*prove* their share to the token contract with their own wallet. Nobody — including the project — can take back or alter what a
published root contains, and nobody can be credited more than it contains.

```
bot ─▶ server ledger ─▶ sum-Merkle tree ─▶ root published on-chain ─▶ player's wallet proves its share ─▶ minter verifies ─▶ EGG credited
```

| Package | What it is |
|---|---|
| [`contracts/`](contracts) | **Tolk** minter + jetton wallet (Acton, 14 tests) and the vendored Telegram wallet contract `WalletTg` |
| [`sdk/`](sdk) | Tree + proofs, message builders, entitlement client — for the server, the app and *other projects* |
| [`server/`](server) | Reward ledger, root publisher, public proof API (Fastify + SQLite) |
| [`app/`](app) | The wallet Mini App: Telegram-native (Money-style), seedless, deployable to Telegram Serverless |
| [`docs/`](docs) | [Architecture & guarantees](docs/ARCHITECTURE.md) · [Showing EGG elsewhere](docs/INTEGRATIONS.md) · [Deploy](docs/DEPLOY.md) · [Review of v1](docs/RMJ_V1_REVIEW.md) · [Security review](docs/SECURITY_REVIEW.md) |

## Quick start

```bash
npm install
(cd contracts && acton test)          # needs Acton: https://ton-blockchain.github.io/acton/
npm test                              # contracts + sdk + server + app
# design preview, no chain and no server needed
cd app && VITE_DEMO=1 VITE_JETTON_MASTER=0:$(printf 'ab%.0s' {1..32}) npm run dev   # http://localhost:5180/?demo=home
```

## Principles

* **One mechanism.** A claim is a Merkle proof the minter checks against a root it stores. No signatures, no off-chain trust anchor.
* **Everyone can verify.** The app checks the server's proof against the on-chain commitment before sending anything; the full leaf set of
  every epoch is public.
* **Bounded authority.** The publisher can only publish roots, at most `maxGrowth` per period and never above `maxSupply`; the admin can rotate it, can't mint, and can drop itself.
* **A standard token.** TEP-74/89 with on-chain TEP-64 metadata — explorers, wallets and DEXes treat it like any other jetton.
* **Money-like numbers never touch floats.**

Status: working prototype. **Not externally audited** — read the “not guaranteed” list in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before putting value behind it.
The jetton logic is derived from the MIT-licensed jetton template shipped with Acton. MIT licensed.
