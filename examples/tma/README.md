# Rolling Mintless Jetton — Telegram Mini App example

A React + TON Connect mini app that:

- Connects the user's TON wallet.
- Shows a live-updating balance (off-chain cumulative + on-chain settled).
- Has a big TAP button that records actions through the RMJ backend.
- Provides a "Sync balance to wallet" explainer button for users who
  want to materialize their pending balance without a real swap.

## Setup

```bash
cp .env.example .env
# Set VITE_RMJ_BACKEND_URL, VITE_JETTON_MASTER_ADDRESS,
# VITE_TONCONNECT_MANIFEST_URL
npm install
npm run dev
```

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

## How the "piggy-back" claim works inside the TMA

The TMA intentionally does **not** run a separate claim flow. The user
simply uses their wallet as they normally would — and whenever they
transfer / swap this jetton, Tonkeeper auto-attaches the Proof API
response and the jetton-wallet materializes the delta.

For an explicit "materialize now" button, craft a
self-to-self transfer of 0 jettons via TON Connect:

```ts
import { buildJettonTransferPayloadBase64 } from '@rmj/sdk';

const payload = await rmj.getCustomPayload(address);
const body = buildJettonTransferPayloadBase64({
  jettonAmountNano: 0n,
  toOwner: address, // self
  customPayload: payload,
});

await tonConnectUI.sendTransaction({
  validUntil: Math.floor(Date.now() / 1000) + 300,
  messages: [
    {
      address: userJettonWallet, // query master.getWalletAddress(userAddress)
      amount: '100000000', // 0.1 TON for gas
      payload: body,
    },
  ],
});
```

Production note: querying the user's jetton-wallet address requires a
lite-client call to the master. Expose it from your backend as a tiny
proxy so the TMA doesn't need TON RPC access directly.
