# Эталонный mintless jetton (TEP-177)

Исходники **1:1** с [ton-community/mintless-jetton](https://github.com/ton-community/mintless-jetton) (тот же `jetton-minter.fc`, `jetton-wallet.fc`, op `0x0df602d6`).

## Mainnet deploy (CLI)

```bash
cd examples/standard-mintless-jetton
npm install

export TON_NETWORK=mainnet
export ADMIN_PRIVATE_KEY_HEX=...
export ADMIN_WALLET_VERSION=v5r1
export ADMIN_WALLET_ADDRESS=UQ...
export METADATA_URL=https://your-backend/jetton-metadata.json
# Скопировать Merkle root с уже работающего RMJ master (тот же airdrop tree):
export SOURCE_RMJ_MASTER_ADDRESS=EQ...old_rmj_master

npm run deploy:mainnet
```

## Railway после деплоя

```env
USE_STANDARD_MINTLESS_JETTON=true
JETTON_MASTER_ADDRESS=UQ...   # STANDARD_JETTON_MASTER_ADDRESS из вывода скрипта
PUBLIC_APP_URL=https://teeeeest-production.up.railway.app
```

Метаданные: `custom_payload_api_uri` = `{PUBLIC_APP_URL}/api/v1`  
Кошельки: `GET {uri}/wallet/0:owner_raw` (см. `backend/src/routes/standardMintlessProofApi.ts`).

## Unverified в Tonviewer

Загрузите исходники из **этой папки** в верификатор Tonviewer — тогда исчезнет «Unverified». Это не признак «не эталона».

## Отличие от RMJ

| | Эталон (этот каталог) | RMJ |
|---|----------------------|-----|
| Claim op | `0x0df602d6` | `0xc9e56df3` |
| Wallet state | `merkle_root` в data | `signer_pubkey` + rolling |
| API path | `/api/v1/wallet/:owner` | `/api/v1/jettons/{master}/wallet/:owner` |
