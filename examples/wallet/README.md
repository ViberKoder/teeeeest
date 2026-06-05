# RMJ Wallet

**Собственный (self-custodial) TON-кошелёк** с мнемоникой 24 слова, локальной подписью транзакций и первоклассной поддержкой **Rolling Mintless Jetton (RMJ)**.

Не TON Connect-обёртка над Tonkeeper — ключи ваши, хранятся зашифрованными в браузере.

## Возможности

| Компонент | Описание |
|-----------|----------|
| **Мнемоника** | Генерация 24 слов (`@ton/crypto`), импорт из Tonkeeper/MyTonWallet |
| **Шифрование** | AES-GCM + PBKDF2 (310k итераций), пароль кошелька |
| **Wallet V4** | Стандартный `WalletContractV4`, workchain 0 |
| **Подпись** | Отправка TON и jetton через Toncenter RPC (`@ton/ton`) |
| **RMJ** | Off-chain баланс, claim, auto `custom_payload` при send (TEP-177) |
| **Jettons / NFT** | Балансы через TonAPI |

## Быстрый старт

```bash
cp examples/wallet/.env.example examples/wallet/.env
npm install
npm run dev -w @rmj/example-wallet
```

Откройте http://localhost:5190 → **Создать кошелёк** или **Импорт мнемоники**.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `VITE_TON_NETWORK` | `mainnet` / `testnet` |
| `VITE_RMJ_BACKEND_URL` | RMJ backend для claim |
| `VITE_JETTON_MASTER_ADDRESS` | Master вашего RMJ jetton |
| `VITE_TONAPI_KEY` | TonAPI (балансы, NFT) |
| `VITE_TON_RPC_API_KEY` | Toncenter (отправка tx) |

## Безопасность

- Мнемоника **никогда** не уходит на сервер — только в localStorage в зашифрованном виде.
- Пароль кошелька ≠ пароль мнемоники Tonkeeper (опционально при импорте).
- Автоблокировка через 15 минут неактивности.
- Браузерный кошелёк подходит для dev/testnet и небольших сумм; для production с крупными балансами рассмотрите аппаратное хранение или аудит.

## RMJ claim

Тот же поток, что `examples/tma`: self-transfer 0 jettons + `custom_payload` с Proof API, подписывается **локально** этим кошельком.

## Сборка

```bash
npm run build -w @rmj/example-wallet
```

Статический `dist/` — любой static host.
