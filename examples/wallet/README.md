# RMJ Wallet (Next.js)

**Self-custodial TON-кошелёк** на Next.js App Router: мнемоника 24 слова, локальная подпись, RMJ с auto Merkle proof.

## Стек

- **Next.js 15** (App Router)
- **@ton/crypto / @ton/ton** — ключи и отправка tx
- **TonAPI** — балансы, jettons, NFT
- **@rmj/sdk** — Proof API, RMJ claim

## Быстрый старт

```bash
cp examples/wallet/.env.example examples/wallet/.env.local
# отредактируйте NEXT_PUBLIC_* переменные

npm install
npm run dev -w @rmj/example-wallet
```

→ http://localhost:5190

## Переменные окружения (`NEXT_PUBLIC_*`)

| Переменная | Назначение |
|------------|------------|
| `NEXT_PUBLIC_TON_NETWORK` | `mainnet` / `testnet` |
| `NEXT_PUBLIC_RMJ_BACKEND_URL` | RMJ backend |
| `NEXT_PUBLIC_JETTON_MASTER_ADDRESS` | Jetton master (RMJ всегда в списке) |
| `NEXT_PUBLIC_TONAPI_KEY` | TonAPI (опционально) |
| `NEXT_PUBLIC_TON_RPC_API_KEY` | Toncenter для отправки tx |

Файл: `examples/wallet/.env.local` (не коммитить).

## RMJ

1. RMJ **всегда** в портфеле при настроенных `NEXT_PUBLIC_RMJ_BACKEND_URL` + `NEXT_PUBLIC_JETTON_MASTER_ADDRESS`
2. Невостребованный off-chain / Merkle баланс виден сразу
3. Любая отправка RMJ — Merkle `custom_payload` автоматически (TEP-177)

## Сборка / деплой

```bash
npm run build -w @rmj/example-wallet
npm run start -w @rmj/example-wallet
```

Vercel: root `examples/wallet`, framework Next.js.

## Структура

```
examples/wallet/
├── app/              # layout, page, globals.css
├── src/
│   ├── components/   # UI + WalletApp
│   ├── context/      # WalletProvider
│   ├── hooks/
│   ├── wallet/       # vault, signing
│   └── services/     # TonAPI, RMJ
└── next.config.ts
```
