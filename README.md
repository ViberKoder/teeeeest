# Rolling Mintless Jetton (RMJ)

A **growing-balance on-chain token system** for Telegram games, tap-to-earn apps,
inline-button bots, mini-apps, and any real-time web application that needs to
reward users with a Jetton on TON, **without the project paying claim gas**.

RMJ is a backwards-extended [TEP-176/177 Mintless Jetton](https://docs.ton.org/standard/tokens/jettons/mintless/overview)
that supports **rolling/cumulative claims** instead of a single-shot airdrop.

- Off-chain game server counts user actions (taps, clicks, inline-button
  presses) and stores cumulative balances.
- Every N minutes a new Merkle tree is rebuilt and its root is committed
  on-chain by the admin.
- When a user actually transfers or swaps their Jetton, Tonkeeper / MyTonWallet
  / TON Space automatically fetch a fresh Merkle proof from the project's
  Custom Payload API and attach it to the transfer. The jetton-wallet then
  **mints the delta between the new cumulative amount and the last claimed
  amount**, and forwards the user's transfer in the same transaction.

The user pays their normal transfer gas. The project pays only a few cents a
day for root updates. Nothing else.

---

## Repository layout

```
.
├── contracts/                # FunC smart contracts + TS wrappers + Blueprint tests
│   ├── func/                 # RollingMintlessMaster.fc, RollingMintlessWallet.fc, imports
│   ├── wrappers/             # TypeScript wrappers, Dictionary helpers, Voucher helpers
│   ├── tests/                # @ton/sandbox end-to-end tests
│   └── scripts/              # deploy + cli tools
├── backend/                  # Unified Node.js service (Fastify)
│   ├── src/                  # game-server + tree-builder + proof-api + root-updater
│   └── migrations/           # SQLite schema
├── sdk/                      # Headless TS SDK for game servers, bots, TMAs
├── examples/
│   ├── telegram-bot/         # Public-channel bot with inline TAP button
│   ├── tma/                  # Telegram Mini App tap-to-earn
│   └── minter/               # Simple web minter for Rolling Mintless Jetton
└── docs/                     # ARCHITECTURE / INTEGRATION / OPERATIONS / CONTRACTS
```

---

## Quick start

```bash
# 1. Install dependencies
npm install --workspaces

# 2. Compile + test contracts
npm run -w contracts build
npm run -w contracts test

# 3. Run backend (dev mode; SQLite без DATABASE_URL, см. backend/README.md)
cp backend/.env.example backend/.env
npm run backend:dev

# 4. Try the Telegram bot example
cp examples/telegram-bot/.env.example examples/telegram-bot/.env
npm run -w examples/telegram-bot dev

# 5. Run the web minter
cp examples/minter/.env.example examples/minter/.env
npm run -w examples/minter dev
```

See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) for full integration guides
for tap-to-earn games, public-channel bots, and TMAs.

Fast path (wizard + Docker + bot/TMA env): [`docs/QUICKSTART_ONE_CLICK.md`](docs/QUICKSTART_ONE_CLICK.md).

Только бэкенд (локально / Docker / Railway): [`backend/README.md`](backend/README.md).

---

## Why RMJ

Traditional approaches to continuous on-chain rewards either:

1. **Burn huge amounts of gas** (server pushes a jetton transfer per reward
   event via a Highload Wallet).
2. **Break UX** (user clicks "Claim" every N minutes and pays their own gas
   every time).

RMJ inherits Mintless's trick — **the claim is piggy-backed on any regular
transfer the user already wants to make** — but removes the one-shot
limitation by storing `already_claimed: Coins` instead of `already_claimed:
Boolean` and by letting the Merkle root be updated by the admin.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architectural
rationale and cost model.

---

## Status

Reference implementation + production-ready backend + two examples. **Audit is
a prerequisite for mainnet deployment** — the code in this repo has not been
externally audited.

## License

MIT.
