# A/B: эталонный Mintless vs RMJ

Цель: понять, **кошельки не показывают RMJ из‑за формата контракта/API** или из‑за **инфраструктуры** (метаданные, URL, RPC, пустое дерево).

## Быстрая проверка RMJ (без деплоя)

Подставьте `BACKEND`, `MASTER` (EQ… из `JETTON_MASTER_ADDRESS`), `OWNER` (`0:…` raw владельца):

```bash
# Метаданные, которые читают кошельки
curl -sS "$BACKEND/jetton-metadata.json" | jq .

# Диагностика бэкенда
curl -sS "$BACKEND/api/v1/diagnostics" | jq .

# То, что дергает MyTonWallet / Tonkeeper (TEP offchain-payloads)
curl -sS "$BACKEND/api/v1/jettons/$MASTER/wallet/$OWNER" | jq .

# Off-chain баланс (бот) vs Merkle
curl -sS "$BACKEND/api/v1/balance/$OWNER" | jq .
```

Интерпретация:

| Ответ | Смысл |
|--------|--------|
| `jetton-metadata.json` → 503 / нет `custom_payload_api_uri` | На Railway нет `JETTON_MASTER_ADDRESS` или `PUBLIC_APP_URL` |
| `custom_payload_api_uri` без `/jettons/EQ…` | Старая сборка бэкенда; нужен коммит с TEP/HMSTR URI |
| `wallet/…` → 404 `address-not-in-tree` | Адрес не в Merkle (не тапал / эпоха не обновилась) |
| `wallet/…` → 404 `nothing-to-claim` | В дереве есть, но delta = 0 (уже заклеймлено on-chain) |
| `wallet/…` → 200 с `compressed_info.amount` > 0 | API ок; если кошелёк всё равно пустой — смотрите **on-chain metadata** и **формат RMJ** ниже |

On-chain metadata master **должен** указывать на тот же `custom_payload_api_uri`, что отдаёт `/jetton-metadata.json` (или ваш CDN). Иначе кошелёк бьёт в старый URL.

## Почему RMJ часто не виден в списке jetton

| Эталон [ton-community/mintless-jetton](https://github.com/ton-community/mintless-jetton) | RMJ (Rolling Mintless) |
|----------------------------------------------------------------------------------------|-------------------------|
| `custom_payload` op `merkle_airdrop_claim` (`0x0df602d6`) | `rolling_claim` (`0xc9e56df3`) + опциональный voucher |
| `is_claimed()` отражает факт клейма | **`is_claimed()` всегда `0`** (намеренно, rolling) |
| Wallet data: `merkle_root` в state_init | Wallet data: `signer_pubkey`, root в подячейке |
| Один разовый compressed claim | Накопительный delta + эпохи |

Кошельки (MyTonWallet, Tonkeeper) писались под **первую** колонку. API RMJ может быть корректным по JSON, но UI **не распознаёт** rolling payload или ломается на `is_claimed`.

TEP-177: баланс в списке jetton часто появляется **только после transfer/swap с custom_payload**, не как «просто airdrop в списке».

## A/B: эталонный jetton на testnet

1. Клонируйте эталон (отдельно от RMJ):

   ```bash
   git clone https://github.com/ton-community/mintless-jetton.git /tmp/mintless-jetton
   cd /tmp/mintless-jetton && npm i
   ```

2. Соберите airdrop и задеплойте minter по их `README` / `sandbox_tests` (testnet).

3. Запустите их Claim API (порт 3000, путь **`/wallet/:owner`** — без `/jettons/{master}`; для теста metadata укажите **корень API** как в их примере):

   ```bash
   # после генерации airdropData.boc и minter.json
   npx ts-node scripts/claimApi.ts
   ```

4. В metadata jetton master (on-chain `content`) задайте:

   ```json
   "custom_payload_api_uri": "https://<ваш-tunnel>/"
   ```

   Кошелёк вызовет `GET …/wallet/0:owner_raw`.

5. Добавьте jetton в кошелёк по адресу master. Проверьте unclaimed / отображение.

6. Повторите те же шаги с RMJ на том же кошельке и том же `OWNER`.

### Выводы

| Эталон виден, RMJ нет | Проблема в **RMJ** (контракт / rolling op / is_claimed), не в кошельке |
| Оба не видны | **Инфра**: metadata URL, HTTPS, 404 API, не тот master, testnet/mainnet |
| Оба API 200, ни один не в UI | Ограничение **кошелька** (нужен transfer с payload) или decimals |

## Обход для пользователей RMJ

Пока кошельки не поддерживают rolling: `examples/tma` или `examples/minter` → вкладка Claim — TON Connect + `GET …/jettons/{master}/wallet/{owner}`.
