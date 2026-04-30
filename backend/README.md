# RMJ Backend

Один сервис: игровой API, Merkle-дерево, Proof API для кошельков, подпись ваучеров, отправка `update_merkle_root` в сеть.

## Минимальные переменные

Скопируйте `backend/.env.example` → `backend/.env` и заполните:


| Переменная                           | Зачем                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `ADMIN_JWT_SECRET`                   | Случайная строка 16+ символов (админ-роуты, опционально общая с ботом).                                         |
| `SIGNER_SEED_HEX`                    | 64 hex-символа — тот же seed, что и pubkey в Jetton Master (генерируется в мастере минтера).                    |
| `ADMIN_MNEMONIC`                     | Фраза кошелька-админа master (для on-chain root updates).                                                       |
| `JETTON_MASTER_ADDRESS`              | Адрес master после деплоя.                                                                                      |
| `DATABASE_URL`                       | **Railway Postgres** — подключите БД к сервису; URL подставится автоматически. Без неё — SQLite файл `DB_PATH`. |
| `PUBLIC_APP_URL` + `PUBLIC_JETTON_`* | По желанию: отдаёт `GET /jetton-metadata.json`.                                                                 |


Сеть TON: `TON_NETWORK=testnet|mainnet`, при необходимости `TON_RPC_API_KEY`.

## Локально (SQLite)

Из **корня** монорепозитория:

```bash
npm install
cp backend/.env.example backend/.env
# отредактируйте backend/.env — без DATABASE_URL будет ./rmj.db
npm run backend:dev
```

Проверка: `curl http://localhost:3000/health`

Без предварительного `tsc` можно запустить через TS (как в Docker): `npm run backend:start:tsx` из корня.

Удобный алиас в корневом `package.json`: `npm run backend:dev`.

## Docker (как на проде)

Из **корня** репозитория (где лежит `Dockerfile`):

```bash
docker build -t rmj-backend .
docker run --rm -p 3000:3000 --env-file backend/.env rmj-backend
```

В `backend/.env` для продакшена укажите `DATABASE_URL` (Postgres), не полагайтесь на файл SQLite внутри контейнера без volume.

## Railway (упрощённый сценарий)

1. Новый проект → **Deploy from GitHub** (этот репозиторий).
2. Добавьте сервис **PostgreSQL** → в Variables вашего **web**-сервиса появится `DATABASE_URL` (или скопируйте из вкладки Postgres **Connect**).
3. Сервис приложения: **Dockerfile** → путь `./Dockerfile`, контекст **корень репо**.
4. В Variables добавьте секреты из таблицы выше (`SIGNER_SEED_HEX`, `ADMIN_MNEMONIC`, …).
5. Выставьте `PORT` (Railway часто задаёт сам) — приложение слушает `process.env.PORT`.

После деплоя: `https://<ваш-домен>/health`, затем `…/jetton-metadata.json` если настроены `PUBLIC_`*.

Полный чеклист с минтером и ботом: `[../docs/QUICKSTART_ONE_CLICK.md](../docs/QUICKSTART_ONE_CLICK.md)`.

## Что ещё можно упростить

- Один клик без своего GitHub: форк репозитория + кнопка Railway «Deploy» (нужен публичный template repo — при желании вынесите отдельно).
- Секреты: один раз сгенерировать `ADMIN_JWT_SECRET` и signer в [минтере](../examples/minter), скопировать блок `.env` с экрана «Готово».

