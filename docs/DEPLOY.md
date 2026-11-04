# Deploy

Do everything on **testnet** first. Tools: Node 20+, [Acton](https://ton-blockchain.github.io/acton/) 1.2+ (only to rebuild the contracts; the compiled bytecode is committed in `contracts/artifacts`).

## 0. Build and test

```bash
npm install
cd contracts && acton build && acton test && npm run build   # 16 tests; refreshes artifacts/
cd .. && npm test                                            # contracts + sdk + the Serverless-library tests + app
```

## 1. Keys

* **Signing key** (ed25519): the secret goes into the bot (`app/tgcloud/lib/publisherkey.js`, git-ignored), the public key into the minter. Nothing else is needed to "publish".
* **Admin**: a wallet that stays cold (later a multisig). It can rotate the signing key, tighten limits and change metadata. It can not mint.

## 2. Token

```bash
cd server
DEPLOYER_MNEMONIC="…" ADMIN_ADDRESS=<cold admin> PUBLISHER_KEY=<ed25519 public key, hex> \
MAX_SUPPLY=1000000000000000000 MAX_GROWTH=2000000000000000 PERIOD_SECONDS=3600 \
NAME=Egg SYMBOL=EGG IMAGE=https://… NETWORK=testnet npm run deploy-minter
```
Amounts are jetton units (decimals 9 ⇒ 1 EGG = 1 000 000 000). `MAX_GROWTH` is the most a compromised signing key can ever promise per `PERIOD_SECONDS`;
**limits can only be tightened afterwards**, so choose it deliberately. Note the printed **minter address**.

Governance later: the admin can `ChangePublisherKey` (the old key keeps only what was already promised), tighten limits, change metadata, hand the admin role over (2 steps) or `DropAdmin` (irreversible).

## 3. The bot and the wallet on Telegram Serverless

Everything runs on Telegram's infrastructure (`app/tgcloud/`, see `BOT.md`). Put the minter address into `app/tgcloud/lib/config.js`, the signing secret into `publisherkey.js`, then:

```bash
cd app
export TGCLOUD_TOKEN='app<id>:…'      # from @BotFather's Serverless section; never commit it
npx tgcloud push && npx tgcloud migrate --yes
VITE_NETWORK=testnet VITE_JETTON_MASTER=<minter> VITE_TONCENTER_KEY=<key> npm run deploy
```
Treat any token you pasted in a chat as burnt and revoke it afterwards.

## 4. Money / Telegram's own wallet

The player's wallet follows Telegram's design (see `ARCHITECTURE.md`): the same wallet contract, account-bound keys, "Keys & Backup", a gasless first transaction. Telegram's native wallet itself has no public developer API.
