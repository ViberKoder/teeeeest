# RMJ Wallet

TON portfolio viewer and sender with **first-class Rolling Mintless Jetton (RMJ)** support.

Works with any TON Connect wallet (Tonkeeper, MyTonWallet, etc.). Reads on-chain data via [TonAPI](https://tonapi.io); RMJ off-chain balances and claims use your project's `@rmj/sdk` + Proof API.

## Features

| Asset | Support |
|-------|---------|
| **TON** | Balance, send with optional comment |
| **Jettons** | All jettons from TonAPI; send standard TEP-74 transfers |
| **RMJ** | Off-chain balance, epoch info, **Claim on-chain**, auto `custom_payload` on send (TEP-177) |
| **NFTs** | Grid view, metadata preview |

RMJ detection:

1. `VITE_JETTON_MASTER_ADDRESS` + `VITE_RMJ_BACKEND_URL` (your project token)
2. Any jetton whose metadata includes `custom_payload_api_uri` (other RMJ / mintless deployments)

If you have off-chain RMJ balance but no jetton-wallet deployed yet, the wallet still shows a synthetic RMJ card with claim.

## Quick start

```bash
# from repo root
cp examples/wallet/.env.example examples/wallet/.env
# edit VITE_RMJ_BACKEND_URL, VITE_JETTON_MASTER_ADDRESS, VITE_TON_NETWORK

npm install
npm run dev -w @rmj/example-wallet
```

Open http://localhost:5190, connect wallet, view assets.

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_TON_NETWORK` | `mainnet` (default) or `testnet` |
| `VITE_RMJ_BACKEND_URL` | RMJ backend origin (no trailing slash) |
| `VITE_JETTON_MASTER_ADDRESS` | Your jetton master (EQ… / UQ…) |
| `VITE_TONAPI_KEY` | Optional TonAPI bearer token (higher rate limits) |
| `VITE_APP_ORIGIN` | Canonical origin for TON Connect manifest on deploy |

## RMJ claim flow

Same as `examples/tma` — self-transfer 0 jettons with Proof API `custom_payload` via TON Connect (~0.1 TON gas). Implemented in `src/services/rmjService.ts`.

## Deploy

Static Vite build — Vercel, Netlify, or any static host. Ensure `/tonconnect-manifest.json` is served (built automatically).

```bash
npm run build -w @rmj/example-wallet
```

Set `VITE_APP_ORIGIN` to your production URL before build so TON Connect manifest `url` matches.

## Architecture notes

Inspired by secure TON wallet patterns (TonAPI account index, TON Connect signing, TEP-177 mintless payloads) but **original UI** — not a Tonkeeper/MyTonWallet clone.
