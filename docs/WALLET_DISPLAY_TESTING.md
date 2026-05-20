# Тестирование отображения jetton в кошельках

Кошельки и эксплореры **не читают ваш бэкенд напрямую**. Цепочка такая:

```
On-chain master → URL в content → GET …/api/v1/jettons/EQ…master/metadata.json
       → custom_payload_api_uri → GET …/wallet/0:owner
       → custom_payload (BoC) → transfer
```

TonAPI / Tonviewer часто показывают **кэш** метаданных — он может отставать от живого JSON на Railway.

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
| On-chain URI | `curl 'https://toncenter.com/api/v2/getTokenData?address=EQ…MASTER'` → `jetton_content.data` | `https://…/jetton-metadata.json` |
| Живые метаданные | `curl …/api/v1/jettons/EQ…/metadata.json` | `decimals: "0"`, `custom_payload_api_uri` = `…/api/v1/jettons/EQ…` (без `/custom-payload`) |
| TonAPI | `curl https://tonapi.io/v2/jettons/EQ…MASTER` | Должно **совпадать** с живым JSON (если нет — кэш TonAPI) |
| Proof API | `curl …/api/v1/jettons/EQ…/wallet/0:owner` | 200 + `custom_payload`, op **rolling_claim** (`0xc9e56df3`) |

## Типичные причины «ничего не видно»

1. **TonAPI отдаёт старый `custom_payload_api_uri`** (`/api/v1/custom-payload`), а на Railway этот маршрут удалён → кошелёк получает 404.  
   **Фикс:** вернуть legacy routes + обновить метаданные; дождаться переиндексации TonAPI.

2. **TonAPI `decimals: "9"`**, у вас в JSON `"0"` → в UI `1` токен как `0.000000001`.  
   **Фикс:** `PUBLIC_JETTON_DECIMALS=0` и актуальный JSON по on-chain URL.

3. **Адрес не в Merkle** → proof API 404 `address-not-in-tree` (норма до тапа / тика эпохи).

4. **RMJ rolling jetton** — часть кошельков не поддерживает `rolling_claim`; отображение может отсутствовать даже при 200 от API.

## RMJ vs эталонный mintless

Аудит проверяет op в `custom_payload`. RMJ = `0xc9e56df3`. Эталон TEP = `0x0df602d6`. Это разные контракты; тест эталона не заменяет тест RMJ.
