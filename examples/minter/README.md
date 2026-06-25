# Jetton Minter — RMJ и TEP-177 Mintless

Веб-мастер деплоя Jetton Master через TON Connect. Два режима:

| Режим | Контракт | Когда использовать |
|-------|----------|-------------------|
| **RMJ** | `RollingMintlessMaster` | Tap-to-earn, rolling claims, обновление Merkle root на цепи |
| **Mintless (TEP-177)** | [ton-community/mintless-jetton](https://github.com/ton-community/mintless-jetton) | Tonkeeper / MyTonWallet, один claim на адрес, фиксированный merkle root |

**До отправки транзакции** минтер вычисляет адрес master и подставляет его в `custom_payload_api_uri` и on-chain metadata URL:

- **RMJ:** `{backend}/jetton-metadata5.json` → `JETTON_MASTER_ADDRESS`
- **TEP-177:** `{backend}/mintless-jetton-metadata.json` → `MINTLESS_JETTON_MASTER_ADDRESS`

Оба типа могут работать **параллельно** на одном бэкенде. Опциональный макс. выпуск (RMJ), деплой, готовый `.env`.

Отдельная вкладка **«Забрать токены (claim)»** — тот же поток, что в `examples/tma`: запрос proof у бэкенда и отправка jetton-transfer с `custom_payload` через TON Connect (удобно, если обычный кошелёк не подтягивает mintless API). Задайте `VITE_RMJ_BACKEND_URL` или введите URL бэкенда в поле на странице. На бэкенде нужны `GET /api/v1/balance`, `GET /api/v1/custom-payload/wallet/{0:…}`, `/api/v1/jetton-wallet`.

Скачанный **`jetton-metadata.json`** задаёт **`decimals: "0"`** — так кошельки (MyTonWallet и др.) показывают целые поинты: **77**, а не `0.000000077` при том же сыром балансе на цепи.

```bash
cd examples/minter
cp .env.example .env
npm install
npm run dev
```

Откройте URL из терминала (порт в `vite.config.ts`, по умолчанию **5180**). Полный сценарий: [`../../docs/QUICKSTART_ONE_CLICK.md`](../../docs/QUICKSTART_ONE_CLICK.md).

**Ton Connect:** при сборке в `dist` попадает `tonconnect-manifest.json`; в dev он отдаётся с `/tonconnect-manifest.json`. По умолчанию UI грузит manifest с **того же origin**, что и страница (`VITE_TONCONNECT_MANIFEST_URL` не обязателен). На Vercel со **своим доменом** задайте `VITE_APP_ORIGIN=https://ваш-домен.com`.

## Важно

- **RMJ:** BOC в `src/constants.ts` — `npm run -w contracts build`, затем обновить `MASTER_BOC_BASE64` / `WALLET_BOC_BASE64`.
- **TEP-177:** BOC из `ton-community/mintless-jetton` v1.0 — `MINTLESS_*` в `constants.ts`; пересобрать: `node examples/minter/scripts/extract-mintless-bocs.mjs`.
- Merkle root для TEP-177 **фиксируется при деплое** (нет `update_merkle_root`). Для статического airdrop укажите финальный root до деплоя; для rolling наград — RMJ.
- Мнемонику админ-кошелька мастер не хранит — для RMJ она нужна бэкенду (`ADMIN_MNEMONIC`) для root updates.
