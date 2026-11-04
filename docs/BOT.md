# The Hatch bot on Telegram Serverless

Everything runs on Telegram's own infrastructure (`app/tgcloud/`): no server of ours.

| Piece | What it does |
|---|---|
| `handlers/message.js` | `/start` (also `ref_<id>` invites and `send-<user>-<amount>` links), `/balance`, `/send @user 10` (opens the wallet prefilled — the player confirms with their own key), admins: `/post [@channel] [text]`, `/stats` |
| `handlers/channel_post.js` | an admin's own channel post containing `#hatch` gets the Hatch button |
| `handlers/inline_query.js` | `@hatchapp` in any chat sends an egg (single, or multi ×N) |
| `handlers/callback_query.js` | Hatch under a post: +1 EGG once per player per post; hatching a friend's egg: +1 for the hatcher, +2 for the sender; never your own egg |
| `handlers/my_chat_member.js` | remembers channels where **one of our admins** made the bot an administrator — only there it publishes or adopts posts |
| `schema.js` | `users`, `ledger` (one row per credit, unique `ref`, amounts in units — a balance is `SUM`), `posts`, `eggs`, `chats`, `roots` (log of signed roots), `prepared` |
| `endpoints/me, link, entitlement, walletFor, prepared, adopt, gas, stats, lookup` | what the wallet and the explorer call (the platform verifies Telegram `initData`) |

**Game rules** (`lib/config.js`): post hatch +1, friend's egg +1 (sender +2), referrer +25 %; per player at most 300 EGG a day (checked in the same SQL statement as the insert); the same sender/hatcher pair at most 3 times a day; 200 eggs sent per day; callback data of an egg carries a MAC so a modified client can not change it.

**Enable inline mode** for the bot in @BotFather (`/setinline`) — only the bot's owner can.

**Roots are signed on demand, not published** (`lib/snapshot.js`). When the wallet asks for an entitlement (opening the wallet, Hatch, Send), the bot builds the sum-Merkle tree from the ledger (at most every 3 s), signs the root with the publisher key (`tgcloud/lib/publisherkey.js`, git-ignored) and returns the player's amount, proof and the signed root. Nothing is sent to the blockchain; the player carries the root into their own claim and pays that claim's network fee. Only players whose wallet link verified (ed25519, checked in the runtime) enter a tree. The bot refuses to sign a root the contract would reject (growth budget, read from the minter). Every root ever signed stays in the append-only `roots` table (seq, root, total, signature); only the newest keeps its leaf set. The pure-JS crypto / tree / BoC code is tested against the SDK and the real contracts in `server/tests/cloudlib.test.ts`.

**In the wallet.** The balance shows everything that is yours (on-chain + signed + just earned). **Send** claims and sends in ONE signed request (`AskToClaim` carries a `TransferIntent`; the minter echoes it in `ClaimCredit` and the wallet sends right after crediting).

Limits worth knowing: the daily cap is per player, not per device (no anti-sybil); the contract allows at most `maxGrowth` EGG per hour to be published.

## Sending to a @username (also to people who never opened the wallet)

A wallet is prepared for every @username that someone sends to, **with no secret stored**: its key is `HMAC-SHA256(master secret, username)`, so the address can be computed on demand.

1. The sender types `@username`; the app asks the bot (`walletFor`) for the address: the person's own wallet if they already have one, otherwise the prepared one.
2. The sender makes an ordinary transfer to that address (TON, EGG, anything). The app offers "Tell @username" (a `t.me/<bot>?start=claim` link).
3. On their first visit the bot sees, through the platform-verified `initData`, that this account owns the username and that money may be waiting (`prepared`). The app creates a key **on the user's device** and sends the bot a rotation proof signed by it. The bot — which can derive the old key — deploys the wallet and moves it to the new key (`adopt`; WalletTg key rotation, the address does not change; a few cents of TON from the bot's vault pay for the first request if the wallet has none). From then on the bot's key is worthless: the wallet is the user's alone, and everything sent to it is already there.
4. The account is linked with a signature by the new key (the server accepts it because the chain shows that key for the address).

Pure-JS tests (`server/tests/cloudlib.test.ts`) run exactly this against the real wallet contract: the bot deploys and rotates, then the bot's key is rejected and the user's key works.

Not covered: if nobody ever opens the wallet, the money stays at that address (a refund path is not built); and until the first visit the bot can derive that wallet's key (the same custody trust as any account recovery) — if the master secret leaks, wallets that were not taken over yet are at risk. A username that changes hands before the first visit goes to its new owner.

## The bot's own wallet

`VAULT` pays three small things: the first network fee of a player who earned at least 3 EGG and has no TON (`gas`, once per account, 50 accounts/day), the first request of a prepared wallet, and the **stats beacon** (an on-chain comment `egg-stats:v1 {…}` to itself, at most every 5 minutes, only when numbers changed). Keep it funded.
