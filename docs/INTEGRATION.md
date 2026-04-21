# Integration guide

Rolling Mintless Jetton (RMJ) can be integrated into any product that
awards users for real-time actions. Below are the three main patterns.

## 1. Public Telegram channel with an inline TAP button

Any message in a public channel can carry an inline button that awards
jettons on each click. This is the pattern the included
[`examples/telegram-bot/`](../examples/telegram-bot/) demonstrates end
to end.

```ts
import { Bot, InlineKeyboard } from 'grammy';
import { RMJClient } from '@rmj/sdk';

const rmj = new RMJClient({ baseUrl: process.env.RMJ_BACKEND_URL! });
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

bot.command('tap', async (ctx) => {
  const kb = new InlineKeyboard().text('💎 Tap to earn', 'tap');
  await ctx.reply('Live drop — click to earn jettons', { reply_markup: kb });
});

bot.callbackQuery('tap', async (ctx) => {
  const userAddress = await yourWalletLookup(ctx.from.id); // TON Connect or /link command
  if (!userAddress) {
    return ctx.answerCallbackQuery({ text: 'Link your wallet first' });
  }
  const r = await rmj.recordAction({
    address: userAddress,
    source: 'telegram-inline',
    meta: { chat: ctx.chat?.id, msg: ctx.callbackQuery.message?.message_id },
  });
  ctx.answerCallbackQuery({ text: r.ok ? `+ jetton (${r.cumulative})` : r.reason });
});
```

Key points:

- **Users must be linked to a TON address** before clicking. Either
  use `/link <EQ…>` DM command (simple) or TON Connect in a companion
  mini app (better UX). The example bot uses `/link`.
- **Anti-cheat** lives on the backend. The bot only forwards trusted
  events. Never pass the reward amount from client-side code.
- **Public channels** work the same as groups. Any Telegram surface that
  supports inline buttons is supported.

## 2. Tap-to-earn Telegram Mini App

The [`examples/tma/`](../examples/tma/) React app demonstrates:

- `@tonconnect/ui-react` for wallet connection.
- Live-updating balance via `RMJClient.getBalance()`.
- TAP button that POSTs to `/api/v1/action` through the SDK.
- "Sync balance to wallet" path that explains the piggy-back claim.

You can deploy it as a regular mini app URL attached to your bot via
`setMiniApp` in BotFather.

## 3. Any server-side game or web app

The same SDK works in a standalone Node.js game server, edge worker, or
browser. Only authenticated game logic calls `recordAction`. For bulk
ingestion use `recordActionsBulk` (up to 100 actions per request).

```ts
import { RMJClient } from '@rmj/sdk';

const rmj = new RMJClient({
  baseUrl: process.env.RMJ_BACKEND_URL!,
  adminSecret: process.env.RMJ_ADMIN_SECRET, // optional
});

await rmj.recordAction({
  address: playerTonAddress,
  source: 'web',
  meta: { level: 42, boss_killed: true },
});
```

## Wallet lookup strategies

| Strategy                      | UX            | Trust model                       |
|-------------------------------|---------------|-----------------------------------|
| `/link <address>` command     | 1 DM message  | user trusts address they type     |
| TON Connect proof-of-ownership| 1 popup       | cryptographic ownership proof     |
| TMA with stored link          | 0 clicks      | TMA has prior connected wallet    |

Production deployments should use TON Connect proof-of-ownership:

```ts
import { TonConnectUI } from '@tonconnect/ui';
const tc = new TonConnectUI({ manifestUrl });
const connectedWallet = await tc.connectWallet();
const userAddress = connectedWallet.account.address; // raw format
```

## How the claim actually lands on-chain

The user does **not** do anything special. When they next transfer or
swap your jetton, Tonkeeper (or any TEP-177-aware wallet) automatically
hits your `custom_payload_api_uri`, receives the BoC produced by our
Proof API, and attaches it to the transfer. The jetton-wallet's
`send_tokens` handler sees the rolling-claim op inside the
`custom_payload`, materializes the delta, and proceeds with the
transfer.

From the user's perspective: they just see "balance magically grows"
whenever they next touch the jetton.

## Custom payload API URL

In your jetton metadata (TEP-64 / TEP-89), set:

```json
{
  "name": "TapCoin",
  "symbol": "TAP",
  "decimals": "9",
  "mintless_merkle_dump_uri": "https://rmj.example.com/dumps/latest.boc",
  "custom_payload_api_uri": "https://rmj.example.com/api/v1/custom-payload"
}
```

The `custom_payload_api_uri` suffix is `/{address}` — Tonkeeper will
append the user's address automatically.

## Self-hosting

Minimal setup:

```bash
# 1. Deploy contracts (on testnet first).
cd contracts
npm install
npm run build
# See docs/CONTRACTS.md for deploy script template.

# 2. Run the backend.
cd ../backend
cp .env.example .env
# Set JETTON_MASTER_ADDRESS, ADMIN_MNEMONIC, SIGNER_SEED_HEX.
npm install
npm run dev

# 3. Run a bot, TMA, or both.
cd ../examples/telegram-bot
cp .env.example .env
npm run dev
```

For production:

- Put the backend behind a reverse proxy (Cloudflare / nginx).
- Use `SIGNER_SEED_HEX` from an HSM-backed integration; never ship in
  plaintext.
- Replace `ADMIN_MNEMONIC` with a multisig wallet integration.
- Persist SQLite to durable storage, or swap `db.ts` for Postgres.
