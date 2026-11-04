# The Hatch bot on Telegram Serverless

Everything runs on Telegram's own infrastructure (`app/tgcloud/`): no server of ours.

| Piece | What it does |
|---|---|
| `handlers/message.js` | `/start` opens the wallet; `/hatch` drops an egg with a **Hatch** button |
| `handlers/callback_query.js` | a tap = **+1 EGG**, once per player per egg, 100 per UTC day |
| `schema.js` | `users` (wallet link), `hatches` (the ledger — there is no balance column, the total is the row count), `roots` (log of signed roots), `prepared` |
| `endpoints/me, link, entitlement, walletFor, prepared, adopt` | what the wallet Mini App calls (the platform verifies Telegram `initData`) |

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
