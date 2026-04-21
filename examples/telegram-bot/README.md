# Rolling Mintless Jetton — Telegram Bot example

A Telegram bot that awards jettons for clicks on an inline button inside
any public channel, group, or DM. Users who link their TON wallet
accrue rewards off-chain; the rewards materialize on-chain automatically
the next time they transfer or swap the jetton.

## Setup

1. Talk to [@BotFather](https://t.me/botfather), create a bot, copy the
   token.
2. Run the RMJ [`backend/`](../../backend/) locally or in production.
3. Configure this example:

   ```bash
   cp .env.example .env
   # fill in TELEGRAM_BOT_TOKEN and RMJ_BACKEND_URL
   ```

4. `npm install && npm run dev`

## How users use it

1. `/start` in a DM for a welcome message.
2. `/link EQ...` once to associate their TON address.
3. In any chat where the bot is present, `/tap` creates a message with
   an inline 💎 button. Every click awards jettons.
4. `/balance` shows the off-chain cumulative plus the on-chain-settled
   amount as of the latest epoch.

## How the jettons reach the wallet

Users don't press "Claim". The rewards show up as "pending" in
Tonkeeper / MyTonWallet thanks to the Proof API (see
[`docs/INTEGRATION.md`](../../docs/INTEGRATION.md)). The next time the
user transfers / swaps this jetton anywhere, Tonkeeper attaches the
fresh Merkle proof + root voucher and the jetton-wallet materializes
the delta inline.

## Deploying to a public channel

1. Make the bot an admin in the channel, with "Post Messages" permission.
2. Send `/tap` via the bot (you'll need direct-message permission too)
   or DM the bot to produce a prefilled button message you forward.
3. Pin the message so subscribers see it.

## Production tips

- Replace the in-memory `UserAddressMap` with a persistent store.
- Use **TON Connect** proof-of-ownership instead of `/link` for anti-impersonation.
- Add webhook mode (`bot.start({ drop_pending_updates: true })` → nginx
  → HTTPS) for scale.
- Sprinkle inline buttons through the channel with different `meta`
  fields to run A/B tests on engagement.
