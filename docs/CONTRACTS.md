# Contracts reference

## Files

- [`contracts/rolling_mintless_master.fc`](../contracts/contracts/rolling_mintless_master.fc) — Jetton Master.
- [`contracts/rolling_mintless_wallet.fc`](../contracts/contracts/rolling_mintless_wallet.fc) — Jetton Wallet.
- [`contracts/imports/`](../contracts/contracts/imports/) — shared stdlib, constants, merkle helpers.

## Opcodes

All custom opcodes are documented in
[`wrappers/OpCodes.ts`](../contracts/wrappers/OpCodes.ts):

| Op                        | Value         | Kind    | Description                                |
|---------------------------|---------------|---------|--------------------------------------------|
| `transfer`                | `0x0f8a7ea5`  | TEP-74  | Standard jetton transfer                   |
| `internal_transfer`       | `0x178d4519`  | TEP-74  | Internal wallet-to-wallet                  |
| `burn`                    | `0x595f07bc`  | TEP-74  | Burn request                               |
| `provide_wallet_address`  | `0x2c76b973`  | TEP-89  | Wallet address discovery                   |
| `mint`                    | `21`          | Master  | Admin-only mint (bootstrap supply)         |
| `change_admin`            | `3`           | Master  | Change admin address                       |
| `change_content`          | `4`           | Master  | Update metadata                            |
| `update_merkle_root`      | `0x9b0b2bea`  | Master  | Admin: push new root + epoch               |
| `update_signer`           | `0x5a3e7b36`  | Master  | Admin: rotate signer pubkey                |
| `pause`                   | `0x3c14d9e1`  | Master  | Admin: halt root updates                   |
| `unpause`                 | `0x9f3b8a5d`  | Master  | Admin: resume root updates                 |
| `rolling_claim`           | `0xc9e56df3`  | Wallet  | Inside `custom_payload`: cumulative claim  |

## Exit codes

Wallet-side errors relevant to the rolling claim:

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 73   | Unauthorized                                     |
| 74   | Master paused                                    |
| 800  | Voucher signature invalid                        |
| 801  | Voucher epoch not strictly greater than cached   |
| 802  | Merkle proof root mismatch                       |
| 803  | Airdrop entry not found in proof                 |
| 804  | Claim not started (now < start_from)             |
| 805  | Claim expired (now > expired_at)                 |
| 806  | Stale amount (cumulative <= already_claimed)     |
| 807  | Admin sent non-increasing epoch                  |

## Storage layouts

### Jetton Master

```
storage$_
  total_supply:Coins
  admin_address:MsgAddressInt
  content:^Cell
  wallet_code:^Cell
  rolling_state:^(
    merkle_root:uint256
    epoch:uint32
    signer_pubkey:uint256
    is_paused:uint1
  )
```

### Jetton Wallet

```
storage$_
  balance:Coins
  owner_address:MsgAddressInt
  jetton_master_address:MsgAddressInt
  wallet_code:^Cell
  rolling_state:^(
    already_claimed:Coins
    cached_merkle_root:uint256
    cached_epoch:uint32
    signer_pubkey:uint256
  )
```

## Rolling claim custom-payload layout

```
rolling_claim_payload#c9e56df3
  has_voucher:uint1
  voucher:?(^RootVoucher)  // present iff has_voucher == 1
  proof:^Cell              // Merkle proof exotic cell (type 3)

RootVoucher
  new_epoch:uint32
  new_root:uint256
  signature:^bits512        // ed25519 over cell(new_epoch, new_root)
```

Produced by [`buildRollingClaimPayload`](../contracts/wrappers/RollingClaimPayload.ts).

## Voucher signing

```
message_to_sign = hash(
  beginCell()
    .storeUint(epoch, 32)
    .storeUint(root, 256)
    .endCell()
)
signature = ed25519_sign(message_to_sign, signer_secret)
```

See [`wrappers/Voucher.ts`](../contracts/wrappers/Voucher.ts) and
[`backend/src/signer.ts`](../backend/src/signer.ts).

## Deploying a new instance

Below is the skeleton of a deploy script. You can put it in
`contracts/scripts/deploy.ts` and run via `npx ts-node`. It requires:

- An admin wallet (v4) with some TON.
- A 32-byte signer seed (or HSM integration).
- Jetton metadata JSON (TEP-64 compatible).

```ts
import { Address, beginCell, toNano, internal, SendMode, Cell } from '@ton/core';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey, keyPairFromSeed } from '@ton/crypto';
import { compile } from '@ton/blueprint';
import { RollingMintlessMaster } from '../wrappers/RollingMintlessMaster';

async function main() {
  const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
  const client = new TonClient({ endpoint });

  const adminMnemonic = process.env.ADMIN_MNEMONIC!.split(' ');
  const adminKp = await mnemonicToPrivateKey(adminMnemonic);
  const adminWallet = client.open(
    WalletContractV4.create({ workchain: 0, publicKey: adminKp.publicKey }),
  );

  const signerSeed = Buffer.from(process.env.SIGNER_SEED_HEX!, 'hex');
  const signerKp = keyPairFromSeed(signerSeed);

  const masterCode = await compile('RollingMintlessMaster');
  const walletCode = await compile('RollingMintlessWallet');

  // TEP-64 onchain metadata — for dev we just store a minimal cell.
  const content = beginCell().storeUint(0, 8).endCell();

  const master = RollingMintlessMaster.createFromConfig(
    {
      totalSupply: 0n,
      admin: adminWallet.address,
      content,
      walletCode,
      signerPubkey: BigInt('0x' + signerKp.publicKey.toString('hex')),
    },
    masterCode,
  );

  // Deploy
  const seqno = await adminWallet.getSeqno();
  await adminWallet.sendTransfer({
    seqno,
    secretKey: adminKp.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [
      internal({
        to: master.address,
        value: toNano('0.1'),
        init: master.init!,
        body: beginCell().endCell(),
        bounce: false,
      }),
    ],
  });

  console.log('Deployed master at', master.address.toString());
}

main().catch(console.error);
```

## Testing

Sandbox end-to-end tests covering the full happy path and all error
branches:

```bash
cd contracts
npm install
npm test
```

Expected output:

```
PASS tests/RollingMintless.spec.ts
  Rolling Mintless Jetton — full tap-to-earn flow
    ✓ happy path: earn 10 → transfer → earn 5 → transfer
    ✓ rejects stale proof (amount <= already_claimed)
    ✓ rejects voucher with stale epoch
    ✓ rejects voucher with bad signature
    ✓ admin pause blocks root updates
    ✓ non-admin cannot update merkle root
    ✓ epoch must monotonically increase
```

## Audit scope

Anything in `contracts/contracts/*.fc` and `contracts/wrappers/*.ts` is
in scope. Backend and SDK are out of scope for a contract audit but
would benefit from a separate security review.
