# RMJ Web Wallet — план и архитектура

Цель: **свой веб-кошелёк**, который нативно понимает **Rolling Mintless Jetton** (RMJ): rolling root, `rolling_claim` (`0xc9e56df3`), Proof API, опциональный `state_init` для jetton-wallet.

Ориентир по UX и коду: [MyTonWallet](https://github.com/mytonwallet-org/mytonwallet) (MIT, React, TON + jettons). Полный форк — отдельный большой этап; сначала используем то, что уже есть в RMJ, и наращиваем слоями.

---

## Что уже есть в репозитории (этап 0)

| Компонент | Роль |
|-----------|------|
| [`sdk/`](../sdk/) | `RMJClient`, `buildJettonTransferPayloadBase64`, `prepareRollingClaimSync` |
| [`examples/tma/`](../examples/tma/) | Tap + claim через **TON Connect** (внешний Tonkeeper / MyTonWallet) |
| [`examples/minter/`](../examples/minter/) | Деплой master + вкладка Claim |
| [`examples/web-wallet/`](../examples/web-wallet/) | **RMJ-first** веб-приложение (баланс, claim, задел под send) |
| Backend Proof API | `GET {custom_payload_api_uri}/wallet/{owner_raw}` |

Это уже «кошелёк для RMJ» в смысле **dApp + TON Connect**. Пользователь подписывает во внешнем приложении; RMJ-логика — у нас.

---

## Этапы

### Этап 1 — RMJ Web App (сейчас)

`examples/web-wallet`: React + `@tonconnect/ui-react` + `@rmj/sdk`.

- Подключение кошелька (Tonkeeper, MyTonWallet, TON Space, …).
- Off-chain баланс + «забрать на цепь» (self-transfer с `custom_payload`).
- Без хранения seed в браузере.

**Запуск:** см. [`examples/web-wallet/README.md`](../examples/web-wallet/README.md).

### Этап 2 — Встроенный signer (как у MyTonWallet)

Fork или submodule MyTonWallet / использование `@ton/ton` + `@ton/crypto`:

- Создание/импорт mnemonic, шифрование в `localStorage` / IndexedDB.
- Отправка транзакций **без** внешнего TonConnect.
- Отдельный security review (CSP, XSS, backup phrase).

В MyTonWallet смотреть в первую очередь:

- `src/api/chains/ton/` — RPC, отправка сообщений.
- Модули **jetton** / assets — парсинг метаданных, transfer body.
- Wallet state / accounts.

RMJ-специфика: при **исходящем** transfer jetton с `custom_payload_api_uri` в metadata — перед сборкой tx вызывать Proof API (см. этап 3).

### Этап 3 — Авто-payload при transfer (аналог TEP-177)

Пайплайн в кошельке:

```
1. Пользователь отправляет RMJ jetton (или swap)
2. Прочитать metadata → custom_payload_api_uri
3. GET …/wallet/{owner_raw}
4. Если 200 — вложить custom_payload (+ state_init если null on-chain wallet)
5. TEP-74 transfer → jetton-wallet выполняет rolling_claim
```

Отличие от классического mintless: ответ API содержит **voucher** (epoch + root + подпись), op **`0xc9e56df3`**, не `0x0df602d6`.

### Этап 4 — Полный продукт (опционально)

- Список jetton’ов, история, NFT, мультичейн — из MyTonWallet.
- Telegram Mini App + PWA + extension (MyTonWallet уже extension-first).
- Индексация: TonAPI + fallback на ваш backend для RMJ metadata.

---

## Сравнение с MyTonWallet

| Возможность | MyTonWallet | RMJ Web (этап 1) | RMJ Web (этап 2+) |
|-------------|-------------|------------------|-------------------|
| Хранение ключей | Да | Нет (TonConnect) | Да (fork) |
| TEP-74 jetton transfer | Да | Через Connect | Да |
| TEP-177 `custom_payload_api_uri` | Частично / mintless | Вручную (кнопка Claim) | Авто при send |
| `rolling_claim` | Нет | Да (наш payload) | Да |
| Rolling Merkle root | Нет | Backend + on-chain epoch | То же |

**Практичный путь:** не писать кошелёк с нуля — взять **MyTonWallet** как базу и добавить модуль `rollingMintless/`:

- `fetchRollingPayload(apiRoot, ownerRaw)`
- `attachToJettonTransfer(body, payload, stateInit?)`
- Проверка op в BoC перед подписью (audit: `0xc9e56df3`).

Лицензия MyTonWallet — проверьте `LICENSE` в их репо перед коммерческим использованием.

---

## Контракт с backend

Обязательно для кошелька:

| Endpoint | Назначение |
|----------|------------|
| `GET /api/v1/balance/:owner` | Off-chain / in-tree баланс |
| `GET /api/v1/jettons/{master}/wallet/{owner_raw}` | Proof + `custom_payload` |
| `GET /api/v1/jetton-wallet/:owner` | Адрес jetton-wallet + `state_init` |
| `GET …/jetton-metadata.json` или `…/metadata.json` | `custom_payload_api_uri`, decimals |

Диагностика: `GET /api/v1/wallet-display-audit?master=EQ…` — см. [`WALLET_DISPLAY_TESTING.md`](./WALLET_DISPLAY_TESTING.md).

---

## Риски

1. **Метаданные on-chain** — неверный URL → кошелёк бьёт не в тот Proof API (`change_content` + `JETTON_MASTER_ADDRESS`).
2. **Безопасность seed** — этап 2 требует аудит; этап 1 безопаснее (ключи у Tonkeeper).
3. **Объём fork MyTonWallet** — месяцы работы на паритет; RMJ-модуль можно вынести в `@rmj/wallet-core` и подключать и к TMA, и к fork.

---

## Следующие шаги (рекомендация)

1. Задеплоить `examples/web-wallet` рядом с TMA.
2. Вынести общую логику claim в `@rmj/sdk` (`prepareRollingClaimSync`) — уже сделано.
3. Создать репозиторий/ветку `mytonwallet-rmj` — клон MyTonWallet + PR с `rollingMintless` (этап 2–3).
4. Договориться о UI: только ваш jetton или универсальный кошелёк с плагином RMJ.
