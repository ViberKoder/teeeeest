# hatch.tg — the EGG explorer

`app/explorer/` is a second page of the same static build. It is built to answer one question: **can I check this number myself?** It shows

* a 3D egg (drag, zoom, tap; it bursts whenever a new hatch or player appears) with the EGG promised to players, how much of it is already on-chain, and the holders;
* players, wallets, hatches, posts, eggs sent in chats and claims, counting up live;
* **the post as Telegram shows it**: the egg picture, caption, the *Hatch* button and below it hatches (taps), Telegram reactions and views, with the channel name — the numbers are the real ones of the newest post;
* **Check it yourself**: the newest root is signed by the key stored in the token contract (ed25519, checked in the browser); claimed ≤ promised ≤ cap; ledger ≥ signed root ≥ claimed; the key was never caught cheating; the stats come from an on-chain beacon only the bot's wallet can write;
* the contract's limits (cap, per-wallet ceiling, growth budget used this period), charts, a live feed (inside Telegram), the on-chain beacons and claims, and a **search** for a wallet address, a transaction hash or (inside Telegram) a @username.

## Two data sources
| | Inside Telegram (Mini App) | hatch.tg (anywhere) |
|---|---|---|
| Internal numbers | the bot's `stats` endpoint, every 3 s | the bot's **on-chain beacon**, at most every minute (only when something changed) |
| Chain | TonAPI every 8 s | TonAPI every 8 s |
| Usernames | yes | no (a username exists only inside Telegram) |

The beacon is a comment `egg-stats:v1 {…}` that the bot's own wallet sends to itself: timestamped, public, and writable only with the bot's key. It also carries the newest post's numbers and the newest signed root, which is how the public page ties the internal numbers to what the contract enforces.

## Views and reactions
* **Reactions** (Telegram likes) come from the bot as channel administrator (`message_reaction_count`).
* **Views** are not exposed by the Bot API, and the bot's runtime can not reach t.me. `app/scripts/sync-views.mjs` reads each public post's counter from its embed page and gives it to the bot; `.github/workflows/sync-views.yml` runs it every 5 minutes (repository secrets: `TGCLOUD_TOKEN`, `OP_KEY`). Without it views show "—".

## Hosting on hatch.tg
```bash
cd app
VITE_NETWORK=testnet VITE_JETTON_MASTER=<minter> VITE_VAULT_ADDRESS=<bot wallet> npm run build:explorer
# upload app/dist-explorer/ to any static host (Cloudflare Pages, Netlify, GitHub Pages) and point hatch.tg at it
```
It needs no server and no secrets. Meanwhile it is live at https://app8930916503.tgcloud.ai/explorer/.


## v3 layout (ton.org look)

The previous explorer was removed and rebuilt: Google Sans Flex (self-hosted, OFL), hairline borders and rounded cards as on ton.org, on the post's own yellow-green gradient across the whole page (no dark background).

* **Left:** a short text about Egg, then the numbers: eggs hatched, EGG promised, when the last egg appeared, players, wallets, holders.
* **Right:** a big, slowly turning 3D egg as the "media" of a Telegram-style message, with the reaction pill, views and time under it and the bot's inline button ("🥚 Hatch · N", links to the channel post). The bubble, the pill and the button follow Telegram Web K (`tweb`): 14 px bubble, 30 px reaction pill, 6/12 px button corners.
* **Below:** the address bar (wallet, transaction hash, @username inside Telegram) and the explorer tabs: Holders, Claims, Signed roots, Token; a wallet page opens in place of the tab.

Source: `app/src/explorer/`. All three pages keep their Content-Security-Policy.
