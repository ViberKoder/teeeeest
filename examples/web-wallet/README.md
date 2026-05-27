# RMJ Web Wallet (phase 1)

RMJ-first web app: balance from your backend + **Claim / sync on-chain** with native
`rolling_claim` support via TON Connect.

This is **not** a full MyTonWallet clone yet — keys stay in Tonkeeper / MyTonWallet /
TON Space. Roadmap: [`docs/WEB_WALLET.md`](../../docs/WEB_WALLET.md).

## Setup

```bash
cp .env.example .env
# VITE_RMJ_BACKEND_URL, VITE_JETTON_MASTER_ADDRESS (EQ…), VITE_TONCONNECT_MANIFEST_URL
npm install
npm run dev -w @rmj/example-web-wallet
# or from repo root: npm run dev --workspace=@rmj/example-web-wallet
```

Open http://localhost:5174

## TON Connect manifest

Host `tonconnect-manifest.json` on HTTPS (same as TMA). Point `VITE_TONCONNECT_MANIFEST_URL` at it.

## What works

- `GET /api/v1/balance/:owner` — off-chain + in-tree display
- `prepareRollingClaimSync` — Proof API + jetton-wallet StateInit + TEP-74 body
- TON Connect `sendTransaction` — user signs in their wallet app

## Next (phase 2+)

Fork [MyTonWallet](https://github.com/mytonwallet-org/mytonwallet) and add a
`rollingMintless` module that calls your Proof API automatically on jetton sends.
See `docs/WEB_WALLET.md`.
