# RMJ Minter — мастер «за пару кликов»

Веб-мастер деплоя `RollingMintlessMaster` через TON Connect: генерация signer, выбор URL метаданных (часто `{backend}/jetton-metadata.json`), опциональный **макс. выпуск** (целые jetton → `max_supply` on-chain и строка `JETTON_MAX_SUPPLY_NANO` в `.env`), деплой и готовый блок `.env` для бэкенда, бота и TMA.

Отдельная вкладка **«Забрать токены (claim)»** — тот же поток, что в `examples/tma`: запрос proof у бэкенда и отправка jetton-transfer с `custom_payload` через TON Connect (удобно, если обычный кошелёк не подтягивает mintless API). Задайте `VITE_RMJ_BACKEND_URL` или введите URL бэкенда в поле на странице. На бэкенде нужны `GET /api/v1/balance`, `/api/v1/custom-payload`, `/api/v1/jetton-wallet`.

## Локально

```bash
cd examples/minter
cp .env.example .env
npm install
npm run dev
```

Откройте URL из терминала (порт в `vite.config.ts`, по умолчанию **5180**). Полный сценарий: [`../../docs/QUICKSTART_ONE_CLICK.md`](../../docs/QUICKSTART_ONE_CLICK.md).

**Ton Connect:** при сборке в `dist` попадает `tonconnect-manifest.json`; в dev он отдаётся с `/tonconnect-manifest.json`. По умолчанию UI грузит manifest с **того же origin**, что и страница (`VITE_TONCONNECT_MANIFEST_URL` не обязателен). На Vercel со **своим доменом** задайте `VITE_APP_ORIGIN=https://ваш-домен.com`.

## Важно

- BOC master/wallet в `src/constants.ts` должны соответствовать `VITE_NETWORK` (`npm run -w contracts build` перед обновлением констант).
- Мнемонику админ-кошелька мастер не хранит — её вносите только на сервер бэкенда (`ADMIN_MNEMONIC`).
