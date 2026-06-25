# Тестирование отображения jetton в кошельках

Кошельки и эксплореры **не читают ваш бэкенд напрямую**. Цепочка такая:

```
On-chain master → URL в content → GET …/api/v1/jettons/EQ…master/metadata.json
       → custom_payload_api_uri → GET …/wallet/0:owner
       → custom_payload (BoC) → transfer
```

TonAPI / Tonviewer часто показывают **кэш** метаданных — он может отставать от живого JSON на Railway.

## Compliance (эталон mintless-jetton-test)

Полный чеклист совместимости с Toncenter и TonAPI (как в [mintless-jetton-test](https://github.com/ViberKoder/mintless-jetton-test)):

```bash
curl -sS 'https://YOUR-BACKEND/api/v1/jettons/EQ…MASTER/compliance?owner=0:…' | jq .
```

CLI из репозитория:

```bash
npm run compliance-check -- --backend https://YOUR-BACKEND --owner 0:…
```

Дополнительно:

- `GET …/indexer-status` — статус кэша Toncenter / mintless_info
- `GET …/sync-metadata` — payload для `change_content` (bump `?v=` при устаревшем кэше)
- `GET …/wallets?next_from=0:000…&count=100` — TEP-176 batch для индексации
- `GET …/merkle-dump` или `…/merkle-dump.boc` — Airdrop HashMap BoC

Группа **`rolling`** в отчёте подтверждает, что это RMJ (корень обновляется по эпохам), а не one-shot airdrop.

## Автоматический аудит (рекомендуется)

После деплоя бэкенда с `GET /api/v1/wallet-display-audit`:

```bash
curl -sS 'https://YOUR-BACKEND/api/v1/wallet-display-audit?master=EQ…MASTER' | jq .
```

С адресом игрока в Merkle:

```bash
curl -sS 'https://YOUR-BACKEND/api/v1/wallet-display-audit?master=EQ…&owner=0:…' | jq .
```

Локально из репозитория:

```bash
npm run wallet-display-check -- \
  --backend https://teeeeest-production.up.railway.app \
  --master EQAt9lZB68rLPt3d2rPuT6WZ-bI5IPpivNbt6WWNE1b0r9gw \
  --owner 0:YOUR_RAW_ADDRESS
```

Exit code `1` = есть **fail** (что-то сломано для кошельков).

## Ручная проверка (Toncenter + TonAPI)

| Шаг | Команда / URL | Ожидание |
|-----|----------------|----------|
| On-chain URI | `curl 'https://toncenter.com/api/v2/getTokenData?address=EQ…MASTER'` → `jetton_content.data` | `https://…/jetton-metadata5.json` |
| Живые метаданные | `curl …/api/v1/jettons/EQ…/metadata.json` | `decimals: "0"`, `custom_payload_api_uri` = `…/api/v1/jettons/EQ…` (без `/custom-payload`) |
| TonAPI | `curl https://tonapi.io/v2/jettons/EQ…MASTER` | Должно **совпадать** с живым JSON (если нет — кэш TonAPI) |
| Proof API | `curl …/api/v1/jettons/EQ…/wallet/0:owner` | 200 + `custom_payload`, op **merkle_airdrop_claim** (`0x0df602d6`, TEP-177) |

## Починка уже задеплоенного master (пример EQB5…)

Если в Tonviewer/TonAPI в `custom_payload_api_uri` фигурирует **`0:0041c5f7…`** (или `%3A0041…`), а реальный контракт — **`EQB5eNZTh5T3ZrWyx-02WpIslZlv9kYdDDM1KPxyU3bR0OSD`** / **`0:7978d653…`**:

1. **Причина:** в on-chain content был URL вида  
   `…/api/v1/jettons/EQAAQcX3…/metadata.json` — это *другой* адрес (`0:0041…`), полученный из старой схемы «master в URL метаданных». Кошельки читают JSON по этому URL → видят неверный `custom_payload_api_uri`.
2. **Бэкенд:** задеплойте ветку с фиксированным `…/jetton-metadata3.json` и выставьте  
   `JETTON_MASTER_ADDRESS=EQ…ваш_master`.
3. **Контракт (admin):** `change_content` (op `4`) → off-chain URI  
   `https://YOUR-BACKEND/jetton-metadata3.json` (смена URL сбрасывает кэш TonAPI).
4. **Проверка:**
   ```bash
   curl -sSL 'https://YOUR-BACKEND/jetton-metadata3.json' | jq .custom_payload_api_uri
   # ожидается: …/api/v1/jettons/EQB5eNZTh5T3ZrWyx-02WpIslZlv9kYdDDM1KPxyU3bR0OSD
   curl -sS 'https://teeeeest-production.up.railway.app/api/v1/wallet-display-audit?master=EQB5eNZTh5T3ZrWyx-02WpIslZlv9kYdDDM1KPxyU3bR0OSD' | jq '.checks[]|select(.severity=="fail")'
   ```
5. TonAPI может показывать старый URI несколько часов — сравнивайте с живым JSON по on-chain URL.

## Типичные причины «ничего не видно»

1. **TonAPI отдаёт старый `custom_payload_api_uri`** (`/api/v1/custom-payload`), а на Railway этот маршрут удалён → кошелёк получает 404.  
   **Фикс:** вернуть legacy routes + обновить метаданные; дождаться переиндексации TonAPI.

2. **TonAPI `decimals: "9"`**, у вас в JSON `"0"` → в UI `1` токен как `0.000000001`.  
   **Фикс:** `PUBLIC_JETTON_DECIMALS=0` и актуальный JSON по on-chain URL.

3. **Адрес не в Merkle** → proof API 404 `address-not-in-tree` (норма до тапа / тика эпохи).

4. **Вне окна claim** — API отдаёт 200 с пустым `custom_payload` (как Tonkeeper claim-api-go), если `start_from`/`expired_at` не покрывают текущее время.

## RMJ vs эталонный mintless

Proof API отдаёт **TEP-177** payload: op `0x0df602d6` + merkle proof (как [tonkeeper/claim-api-go](https://github.com/tonkeeper/claim-api-go)).
Контракт wallet on-chain также принимает legacy RMJ `0xc9e56df3` (voucher + proof), но кошельки ожидают `0x0df602d6`.

В metadata должны быть оба поля:
- `custom_payload_api_uri` — per-address proof API
- `mintless_merkle_dump_uri` — `GET …/merkle-dump.boc` (полное Airdrop HashMap для индексации кошельками)

**Уже задеплоенный master** с старым wallet code нужно перевыпустить (новый master + `change_content`), иначе on-chain wallet не примет `0x0df602d6`.
