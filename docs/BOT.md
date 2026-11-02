# The Hatch bot on Telegram Serverless

Everything runs on Telegram's own infrastructure (`app/tgcloud/`): no server of ours.

| Piece | What it does |
|---|---|
| `handlers/message.js` | `/start` opens the wallet; `/hatch` drops an egg with a **Hatch** button |
| `handlers/callback_query.js` | a tap = **+1 EGG**, once per player per egg, 100 per UTC day |
| `schema.js` | `users` (wallet link), `hatches` (the ledger — there is no balance column, the total is the row count), `proofs` |
| `endpoints/me, link, entitlement` | what the wallet Mini App calls (the platform verifies Telegram `initData`) |
| `endpoints/op*` | operator-only (guarded by `app/tgcloud/lib/opkey.js`, git-ignored; copy `docs/opkey.example.js.txt`) |

**Publishing.** Serverless has no scheduler and no crypto libraries, so publication is an operator step done from a machine that holds the publisher key:

```bash
cd server
TGCLOUD_TOKEN=app…:… MINTER=<minter> PUBLISHER_MNEMONIC="…" npm run publish-from-cloud
```
It reads the ledger (`opExport`), keeps only players whose wallet link is **signed by the wallet's own key**, publishes the Merkle root on-chain, checks it, and stores each player's proof back (`opStore`). Run it after players have hatched (e.g. from cron or a CI schedule).
The wallet then shows the amount as *ready to hatch*; **Hatch** in the wallet makes the player's own wallet prove its share to the token contract.

Limits worth knowing: the daily cap is per player, not per device (no anti-sybil); the contract allows at most `maxGrowth` EGG per hour to be published.
