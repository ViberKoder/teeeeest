# Deploy

Do everything on **testnet** first. Tools: Node 20+, [Acton](https://ton-blockchain.github.io/acton/) 1.2+ (only to rebuild the
contracts; the compiled bytecode is committed in `contracts/artifacts`).

## 0. Build and test

```bash
npm install
cd contracts && acton build && acton test && npm run build   # 14 tests; refreshes artifacts/
cd .. && npm test                                            # contracts + sdk + server + app
```

## 1. Wallets

```bash
npm run gen-wallet -w @egg/server     # run twice: publisher (hot, on the server) and admin (cold, offline / multisig)
```
Fund the publisher and the deployer with a little TON (testnet faucet on testnet).

## 2. Token

```bash
cd server
DEPLOYER_MNEMONIC="…" ADMIN_ADDRESS=<cold admin> PUBLISHER_ADDRESS=<publisher> \
MAX_SUPPLY=100000000000000000000 MAX_GROWTH=1000000000000000 PERIOD_SECONDS=3600 MIN_INTERVAL=60 \
NAME=Egg SYMBOL=EGG IMAGE=https://… NETWORK=testnet npm run deploy-minter
```
Amounts are jetton units (decimals 9 ⇒ 1 EGG = 1 000 000 000). Think about `MAX_GROWTH`: it is the most a compromised
publisher can ever release per `PERIOD_SECONDS`. Note the printed **minter address**.

Governance later: the admin can `ChangePublisher`, `SetLimits`, `ChangeMetadata`, hand the admin role over (2 steps) or `DropAdmin`
(irreversible: publisher and limits are then frozen forever).

## 3. Server

```bash
cd server && cp .env.example .env     # BOT_TOKEN, INGEST_API_KEY, JETTON_MASTER_ADDRESS, PUBLISHER_MNEMONIC, MAX_SUPPLY_UNITS (= the on-chain max)
npm start                             # SQLite at DB_PATH: persistent volume + backups
```
Your bot credits rewards with `POST /v1/ingest` (`Authorization: Bearer <INGEST_API_KEY>`):
```json
{ "tg_id": 123, "amount": "2500000000000", "kind": "hatch", "idempotency_key": "<unique per reward>" }
```
Every `PUBLISH_INTERVAL_SECONDS` the server builds a tree from everyone who linked a wallet and publishes a root if something
changed. `GET /health` shows the last epoch and its status (`conflict` means the chain disagrees with the database — stop and look).
Fraud: `POST /v1/slash {tg_id}` cancels what was **not yet published** for a player and bans them.

Mirror `GET /v1/epochs/latest` somewhere public and permanent after every epoch (IPFS, a channel): it is what lets players claim
without you.

## 4. Wallet Mini App on Telegram Serverless

The front-end is static and fits Serverless hosting (`https://app<id>.tgcloud.ai/`). The CLI is [`@tgcloud/cli`](https://www.npmjs.com/package/@tgcloud/cli),
a dev-dependency of `app/`.

```bash
cd app
cp .env.example .env     # VITE_NETWORK, VITE_JETTON_MASTER, VITE_API_URL, VITE_PUBLIC_URL=https://app<id>.tgcloud.ai
npm run manifest         # public/tonconnect-manifest.json for that origin
export TGCLOUD_TOKEN='app<id>:…'      # from @BotFather's Serverless section; never commit it
npm run deploy           # build + `tgcloud push`
```
Without `VITE_JETTON_MASTER` the app is a plain TON wallet (EGG parts are hidden) — that is how the first deployment runs.
`app/tgcloud/` holds a minimal bot handler (`/start` → "Open wallet" button) and a `health` endpoint.
Add the Mini App origin to `CORS_ORIGINS` on the server. Treat any token you pasted in a chat as burnt and revoke it afterwards.

## 5. "Money" / Telegram's native wallet

There is no public developer documentation for it yet. The app already works with any wallet that speaks TON Connect (welcome screen →
*Connect Telegram Wallet or another*); if Telegram publishes a dedicated API it plugs in as another `WalletProvider` (`app/src/provider/`).
