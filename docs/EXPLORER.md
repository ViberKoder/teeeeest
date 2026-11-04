# Explorer (hatch.tg)

`app/explorer/` is a second page of the same static build (`dist/explorer/`). It shows players, wallets, EGG promised and claimed, posts and their views, eggs sent in chats, charts, a live feed, on-chain claims, a wallet lookup, and a **"check it yourself"** panel:

1. the newest root is signed by the key stored in the token contract (ed25519, checked in the browser against `get_publisher_key()`);
2. supply ≤ highest promised total ≤ hard cap (`get_limits()`, `get_max_supply()`);
3. ledger ≥ signed root ≥ claimed on-chain;
4. the key was never caught cheating (`frozen` in `get_limits()`);
5. the stats come from an on-chain beacon only the bot's wallet can write.

**Two modes.** Opened inside Telegram (bot → Wallet → Keys & Backup → Project explorer, or the link) it polls the bot every 3 s (`stats`, `lookup`). Opened anywhere else it reads only public sources: TonAPI for the contract and claims, and the bot's **stats beacon** from the chain (Telegram Serverless endpoints are reachable only with Telegram's signed init data, and the numbers should not depend on a third-party service).

**Hosting on hatch.tg.** Upload `app/dist` (after `npm run build` with the same `VITE_*` variables) to any static host — Cloudflare Pages, GitHub Pages, Netlify — and point the domain there; the explorer is at `/explorer/`, or serve `dist/explorer/index.html` as the site root together with `dist/assets`. It needs no server. Today it is live at https://app8930916503.tgcloud.ai/explorer/.
