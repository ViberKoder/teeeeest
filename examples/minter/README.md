# RMJ Minter (simple web UI)

Простой сайт-минтер для деплоя `RollingMintlessMaster` через TON Connect.

## Что делает

- Подключает кошелек (Tonkeeper / MyTonWallet / TON Space).
- Собирает параметры:
  - name, symbol, description, image URL
  - signer pubkey (hex 32 bytes)
  - initial merkle root (обычно `0`)
- Генерирует `StateInit` мастер-контракта локально в браузере.
- Показывает предсказанный адрес master до деплоя.
- Отправляет **одну** транзакцию на этот адрес с `stateInit` (deploy).

## Быстрый старт

```bash
cd examples/minter
cp .env.example .env
npm install
npm run dev
```

Откроется `http://localhost:5175`.

## Важно

- Это минимальный демо-минтер. Он строит metadata как простой on-chain cell
  (нулевой префикс + json string). Для production лучше сделать полноценный
  TEP-64 metadata cell/URI.
- После деплоя root-обновления и админ-операции выполняются через backend
  (`rootUpdater`) или отдельный admin скрипт.
- Перед mainnet: audit + multisig admin + HSM/KMS signer.

