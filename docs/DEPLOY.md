# Deploy

Do everything on **testnet** first (`VITE_NETWORK=testnet`, `NETWORK=testnet`).

## 1. Keys

```bash
npm install
npm run keys -w @egg/server
```
* `AUTHORITY_SEED_HEX` — **cold**. Write it down offline; never put it on a server.
* `AUTHORITY_PUBKEY_HEX`, `SIGNER_SEED_HEX` (hot), `SIGNER_PUBKEY_HEX`.

## 2. Token

```bash
cd contracts
DEPLOYER_MNEMONIC="…24 words…" AUTHORITY_PUBKEY_HEX=… \
METADATA_URL=https://api.example.org/jetton.json \
MAX_SUPPLY=100000000000000000000 NETWORK=testnet npx ts-node scripts/deployMaster.ts
```
Amounts are jetton units (decimals 9 ⇒ 1 EGG = 1 000 000 000). Note the printed **master address**.

## 3. Certificate (run where the authority secret lives)

```bash
AUTHORITY_SEED_HEX=… SIGNER_PUBKEY_HEX=… JETTON_MASTER_ADDRESS=<master> KEY_ID=1 DAYS=14 \
npm run cert -w @egg/server          # prints KEY_CERT_B64
```
Re-issue before it lapses (`/health` shows `cert_days_left`). To revoke a leaked signer: new signer key, `KEY_ID` +1, short `DAYS`.

## 4. Server

```bash
cd server && cp .env.example .env     # fill BOT_TOKEN, INGEST_API_KEY, keys, KEY_CERT_B64, JETTON_MASTER_ADDRESS
npm start                             # SQLite file at DB_PATH — put it on a persistent volume and back it up
```
Your bot credits rewards with `POST /v1/ingest` (`Authorization: Bearer <INGEST_API_KEY>`):
```json
{ "tg_id": 123, "amount": "2500000000000", "kind": "hatch", "idempotency_key": "<unique per reward>" }
```
The server must be reachable over HTTPS (any host). It cannot run inside Telegram Serverless: that runtime has no
npm packages and no documented Web Crypto/ed25519, and this service needs a database it controls and a signing key.

## 5. Wallet Mini App on Telegram Serverless

The front-end is static, so it fits Serverless hosting (`https://app<id>.tgcloud.ai/`).

```bash
cd app
cp .env.example .env     # VITE_API_URL, VITE_JETTON_MASTER, VITE_NETWORK, VITE_PUBLIC_URL=https://app<id>.tgcloud.ai
npm run manifest         # writes public/tonconnect-manifest.json for that origin
npm run build            # → dist/
npx tgcloud login && npx tgcloud push     # tgcloud.jsonc already points "source" at dist
```
Then set the Mini App URL for your bot in @BotFather. Add the Mini App origin to `CORS_ORIGINS` on the server.
This deploy path follows Telegram's Serverless documentation; it has not been run against a real account from this repo.

## 6. “Money” / Telegram's own wallet

At the time of writing there is no public developer documentation for Telegram's native wallet. The wallet app already
works with any wallet that speaks TON Connect: the *Connect Telegram Wallet or another* button on the welcome screen and
*Switch wallet* in settings open the standard TON Connect modal, and the same transactions are sent through it. If Telegram
publishes a dedicated API, it plugs in as another `WalletProvider` (`app/src/provider/`) without touching screens or contracts.
