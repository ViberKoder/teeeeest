# Admin panel

Open it from the bot: send **/admin** (admins only) → "Open admin panel", or Wallet → Keys & Backup → Admin panel. It is a page of the same Mini App (`app/admin/`), wide on desktop. Who is an admin is decided by the bot (Telegram-verified account id): root admins are in `app/tgcloud/lib/config.js`, more can be added in the panel (Team).

## Two kinds of actions
* **Bot actions** (game numbers, posts, players, team, switching the active token) go to the bot's `admin` endpoint. Every one is **written to the log** with the admin's id.
* **Token actions** (metadata, limits, signing key, admin role, creating a token) are **signed by your own wallet** in the app and sent to the token contract. The bot never holds the token's admin key; the contract itself decides what is allowed (e.g. limits can only be tightened).

## Tabs
| Tab | What it does |
|---|---|
| Overview | players, wallets, promised EGG, hatches, health (chain API, bot wallet balance, signing key), the newest signed roots; sign a root / write the stats beacon now; test that the bot can message you |
| Token | read from the **contract**: supply, holders, cap, growth budget, per-wallet ceiling, signing key (and whether it is the bot's), admin and nominated admin, fraud freeze. **Update name/symbol/description/image**, **tighten limits**, **rotate the signing key**, **hand the admin role over** (two steps) or **drop it for good** (type DROP), and **Create a new token** (deploys a minter from your wallet with the bot's key as publisher, shows its address before you pay, then "Use it in the bot") |
| Game | rewards (post hatch, friend's egg, sender, referral %), daily earning cap, same-pair cap, sender's hatched eggs per day, bot-paid first fee, beacon interval — all validated and effective immediately |
| Posts | publish a Hatch post to an approved channel (picture + button, optional text), approve/remove channels, per-post hatches/views/reactions, close or reopen a post |
| Players | find by Telegram id, @username or wallet: ledger, wallet, referrer, recent events; **ban from earning** / unban |
| Team | add/remove admins of the bot |
| Log | everything admins did |

## Things worth knowing
* A **ban** stops new earnings. It never removes the player from the Merkle tree: a root whose total or an owner's amount went down would be provable fraud and freeze the signing key.
* **Switching the active token** needs the new contract to trust exactly the bot's signing key (the bot checks this on-chain). The wallet and the explorer learn the active token from the bot / from the stats beacon, so no rebuild is needed. Balances are per token: EGG already claimed stays in the old one.
* The **bot wallet** (Overview → health) pays first network fees and the stats beacon: keep a little TON on it.
* Settings live in the bot's database (`settings`, `admins`, `admin_log`); defaults are in `app/tgcloud/lib/settings.js`.
