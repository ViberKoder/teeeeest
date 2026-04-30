# RMJ Minter — мастер «за пару кликов»

Веб-мастер деплоя `RollingMintlessMaster` через TON Connect: генерация signer, выбор URL метаданных (часто `{backend}/jetton-metadata.json`), деплой и готовый блок `.env` для бэкенда, бота и TMA.

## Локально

```bash
cd examples/minter
cp .env.example .env
npm install
npm run dev
```

Откройте URL из терминала (обычно порт **5175**). Полный сценарий с Docker и Render: [`../../docs/QUICKSTART_ONE_CLICK.md`](../../docs/QUICKSTART_ONE_CLICK.md).

## Важно

- BOC master/wallet в `src/constants.ts` должны соответствовать `VITE_NETWORK` (`npm run -w contracts build` перед обновлением констант).
- Мнемонику админ-кошелька мастер не хранит — её вносите только на сервер бэкенда (`ADMIN_MNEMONIC`).
