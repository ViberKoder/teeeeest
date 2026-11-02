# The Hatch bot on Telegram Serverless

Everything runs on Telegram's own infrastructure (`app/tgcloud/`): no server of ours.

| Piece | What it does |
|---|---|
| `handlers/message.js` | `/start` opens the wallet; `/hatch` drops an egg with a **Hatch** button |
| `handlers/callback_query.js` | a tap = **+1 EGG**, once per player per egg, 100 per UTC day |
| `schema.js` | `users` (wallet link), `hatches` (the ledger — there is no balance column, the total is the row count), `proofs` |
| `endpoints/me, link, entitlement` | what the wallet Mini App calls (the platform verifies Telegram `initData`) |
| `endpoints/op*` | operator-only (guarded by `app/tgcloud/lib/opkey.js`, git-ignored; copy `docs/opkey.example.js.txt`) |

**Publishing is automatic** (`lib/publisher.js`): there is no scheduler in the runtime, so each tap on Hatch and each wallet open advances a small state machine — send a root when the ledger changed (at most one per 70 s), confirm it on-chain, store every player's proof. The publisher is a WalletTg whose key is in `tgcloud/lib/publisherkey.js` (git-ignored); the contract limits what it can do. Only players whose wallet link verified (ed25519, checked in the runtime) enter a tree. The pure-JS crypto/tree/BoC code is tested against the SDK and the real contracts in `server/tests/cloudlib.test.ts`.

**In the wallet.** The balance shows everything that is yours (on-chain + committed + just earned). **Send** claims the committed part and sends in ONE signed request (`AskToClaim` carries a `TransferIntent`; the minter echoes it in `ClaimCredit` and the wallet sends right after crediting).

(`server/scripts/publish-from-cloud.ts` is the manual operator alternative.)

Limits worth knowing: the daily cap is per player, not per device (no anti-sybil); the contract allows at most `maxGrowth` EGG per hour to be published.
