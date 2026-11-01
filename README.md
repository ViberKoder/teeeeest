# EGG

A **self-custody TON wallet that lives inside Telegram** (Mini App), and the **EGG jetton** behind it.

Players earn EGG off-chain (hatching eggs in a bot, channel posts, quests). The project owes them a
*cumulative* amount. When they open the wallet they tap **Hatch** — or simply send EGG to someone — and the
amount they are owed is credited to their own jetton-wallet in the same transaction. They pay a normal
network fee; the project pays nothing per user.

```
 bot / game ──ingest──▶ server ──signed claim──▶ wallet app ──one tx──▶ your jetton-wallet
   (rewards)           (ledger, hot key)         (your keys)            (credits delta, notifies master)
```

| Package | What it is |
|---|---|
| [`contracts/`](contracts) | FunC jetton master + jetton-wallet, TypeScript wrappers, sandbox tests |
| [`server/`](server) | Reward ledger, Telegram login check, claim signer (Fastify + SQLite) |
| [`app/`](app) | The wallet Mini App (React + Vite). Built-in self-custody wallet **or** any wallet over TON Connect |
| [`docs/`](docs) | [Architecture & trust model](docs/ARCHITECTURE.md) · [Review of RMJ v1](docs/RMJ_V1_REVIEW.md) · [Deploy](docs/DEPLOY.md) |

## Quick start

```bash
npm install
npm test                      # contracts (15) + server (4) + app (12)

# local design preview, no chain and no server needed
cd app && VITE_DEMO=1 VITE_JETTON_MASTER=0:$(printf 'ab%.0s' {1..32}) npm run dev
# open http://localhost:5180/?demo=home   (also: welcome, locked, empty)
```

Full production setup (keys, master deploy, server, Telegram Serverless): [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Design rules

* **One mechanism.** A claim is a signed statement *“owner X is owed N in total”*. No Merkle trees, epochs, root
  updates, proof APIs or compatibility shims.
* **The wallet verifies everything itself**, so it never has to ask the master and a claim fits in the user's own transfer.
* **Cold authority → hot signer.** A cold key certifies short-lived hot keys; hot keys rotate without moving any address.
* **Money-like numbers never touch floats.** Integers/bigints everywhere, units are jetton nano.
* **The app builds a message once**; providers (built-in wallet, TON Connect) only differ in who signs it.

Status: working prototype. The contracts have **not** been externally audited — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#known-limits) before putting real value behind them.

MIT licensed.
