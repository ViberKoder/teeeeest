# RMJ: создание и интеграция за несколько шагов

Цель: один мастер в браузере, один деплой бэкенда, одна строка URL в боте и в TMA.

## Порядок (рекомендуемый)

### A. Бэкенд (Docker или Render)

**База данных:** на [Railway](https://railway.app) создайте сервис **PostgreSQL** и присоедините переменную **`DATABASE_URL`** к сервису бэкенда (или вставьте URL вручную в Variables). Опционально: `DATABASE_SSL=require` или `prefer` (по умолчанию `prefer`). Без `DATABASE_URL` бэкенд использует локальный SQLite (`DB_PATH`) — для продакшена на Railway Postgres предпочтительнее.

1. Залейте репозиторий на GitHub и подключите к [Render](https://render.com):
   - Blueprint / New Web Service → Dockerfile (в корне репозитория есть `Dockerfile` и `render.yaml`).
2. В переменных окружения сервиса задайте минимум:
   - `SIGNER_SEED_HEX` — **после** того как сгенерируете его в мастере (шаг B).
   - `ADMIN_JWT_SECRET` — случайная строка 32+ символов.
   - `ADMIN_MNEMONIC` — фраза **того же** кошелька, который будет админом jetton (как в Tonkeeper).
   - `JETTON_MASTER_ADDRESS` — подставьте **после** деплоя master в шаге B.
   - `PUBLIC_APP_URL` — публичный URL сервиса Render, например `https://rmj-xxxx.onrender.com` (без `/` в конце).
   - `PUBLIC_JETTON_NAME`, `PUBLIC_JETTON_SYMBOL` — совпадают с тем, что вводите в мастере.
   - Опционально: `PUBLIC_JETTON_DESCRIPTION`, `PUBLIC_JETTON_IMAGE_URL`.
   - `TON_NETWORK` — `testnet` или `mainnet`.

Локально:

```bash
docker build -t rmj-backend .
docker run --env-file backend/.env -p 3000:3000 rmj-backend
```

После старта проверьте `GET /health`. Если заданы `PUBLIC_*`, откройте в браузере:

`https://<ваш-хост>/jetton-metadata.json`

### B. Мастер в браузере (`examples/minter`)

```bash
npm install
cp examples/minter/.env.example examples/minter/.env
npm run -w examples/minter dev
```

В мастере:

1. Подключите кошелёк (будущий **admin**).
2. Введите имя токена и **HTTPS URL бэкенда** из шага A.
3. Сгенерируйте signer и сохраните seed — он же `SIGNER_SEED_HEX` на сервере.
4. Нажмите деплой Master в сети testnet/mainnet (зависит от `VITE_NETWORK` в `.env` минтера).

На экране «Готово» скопируйте блок переменных в Render / `.env` бэкенда и допишите `JETTON_MASTER_ADDRESS`.

### C. Бот — одна строка

В `examples/telegram-bot/.env`:

```env
RMJ_BACKEND_URL=https://<ваш-бэкенд>
TELEGRAM_BOT_TOKEN=...
```

Запуск: `npm run -w examples/telegram-bot dev`

### D. Telegram Mini App — две строки

В `examples/tma/.env`:

```env
VITE_RMJ_BACKEND_URL=https://<ваш-бэкенд>
VITE_JETTON_MASTER_ADDRESS=<адрес master>
VITE_TONCONNECT_MANIFEST_URL=https://...
```

Сборка: `npm run -w examples/tma build`

### E. Статический мастер на Vercel

Подключите репозиторий к Vercel; **корень проекта — корень монорепозитория** (где лежит `vercel.json`). Сборка соберёт только `examples/minter/dist`.

Задайте переменные окружения в Vercel по необходимости (например `VITE_TONCONNECT_MANIFEST_URL`, `VITE_NETWORK`).

## Если без `/jetton-metadata.json` на бэкенде

В мастере выберите режим «Свой URL JSON», залейте скачанный `jetton-metadata.json` на Gist/S3 и вставьте raw URL.

## Важно

- Мнемоника админ-кошелька не покидает ваш контроль — мастер её не знает, её нужно ввести только на сервере бэкенда.
- Перед mainnet: аудит контрактов и защита `SIGNER_SEED_HEX` (KMS/HSM).
