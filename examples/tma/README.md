# Rolling Mintless Jetton — Telegram Mini App example

A React + TON Connect mini app that:

- Connects the user's TON wallet.
- Shows a live-updating balance (off-chain cumulative + on-chain settled).
- Has a big TAP button that records actions through the RMJ backend.
- **Claim / sync on-chain** — sends a TEP-74 jetton transfer **with Proof API `custom_payload`** via TON Connect (works even when the wallet app does not implement mintless / TEP-177 itself).

## Setup

```bash
cp .env.example .env
# Set VITE_RMJ_BACKEND_URL and VITE_TONCONNECT_MANIFEST_URL
npm install
npm run dev
```

`VITE_JETTON_MASTER_ADDRESS` is **not** required: jetton-wallet resolution uses **`GET /api/v1/jetton-wallet/:owner`** on your RMJ backend.

## TON Connect manifest

Host a `tonconnect-manifest.json` on your domain:

```json
{
  "url": "https://your-domain.example",
  "name": "TapCoin",
  "iconUrl": "https://your-domain.example/icon.png"
}
```

Point `VITE_TONCONNECT_MANIFEST_URL` at it.

## Attaching to a Telegram bot

In [@BotFather](https://t.me/botfather): `/mybots → Bot Settings → Menu
Button → Mini App URL`. Point it at the hosted build of this app.

## How “Claim / sync” works

1. `RMJClient.getCustomPayload(address)` — Merkle proof + voucher BoC.
2. `RMJClient.getJettonWallet(address)` — jetton-wallet address + optional **StateInit** if the wallet is not deployed yet.
3. `buildJettonTransferPayloadBase64` — TEP-74 transfer body with **0** jettons to yourself and `custom_payload` attached.
4. `tonConnectUI.sendTransaction` — ~**0.1 TON** to the jetton-wallet for gas / deploy.

Same pattern works as a standalone web page (not only Telegram).
