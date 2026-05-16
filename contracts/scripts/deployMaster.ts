/**
 * Deploy Rolling Mintless Jetton master (CLI).
 *
 * Required env:
 *   ADMIN_MNEMONIC or ADMIN_PRIVATE_KEY_HEX — wallet with ≥0.15 TON
 *   SIGNER_SEED_HEX — 32-byte hex (or omit to generate and print)
 *   METADATA_URL — TEP-64 off-chain URI (e.g. https://backend/jetton-metadata.json)
 *
 * Optional:
 *   TON_NETWORK=testnet|mainnet
 *   TON_RPC_ENDPOINT, TON_RPC_API_KEY
 *   ADMIN_WALLET_VERSION=v4|v5r1, ADMIN_V5R1_SUBWALLET=0
 *   DEPLOY_VALUE_TON=0.15
 *   MAX_SUPPLY_NANO=0 (0 = unlimited)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { Address, beginCell, Cell, internal, SendMode, toNano } from '@ton/core';
import { mnemonicToPrivateKey, keyPairFromSeed, mnemonicNew } from '@ton/crypto';
import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { RollingMintlessMaster } from '../wrappers/RollingMintlessMaster';

const OFFCHAIN_INLINE_URI_MAX = 126;
const SNAKE_CHUNK = 127;

function buildSnakeFromBuffer(data: Buffer): Cell {
  const chunks: Buffer[] = [];
  for (let i = 0; i < data.length; i += SNAKE_CHUNK) {
    chunks.push(data.subarray(i, Math.min(i + SNAKE_CHUNK, data.length)));
  }
  let cell = beginCell().storeBuffer(chunks[chunks.length - 1]).endCell();
  for (let i = chunks.length - 2; i >= 0; i--) {
    cell = beginCell().storeBuffer(chunks[i]).storeRef(cell).endCell();
  }
  return cell;
}

function toOffchainContentCell(url: string): Cell {
  const bytes = Buffer.from(url, 'utf8');
  if (bytes.length <= OFFCHAIN_INLINE_URI_MAX) {
    return beginCell().storeUint(0x01, 8).storeBuffer(bytes).endCell();
  }
  return beginCell().storeUint(0x01, 8).storeRef(buildSnakeFromBuffer(bytes)).endCell();
}

function loadBoc(name: string): Cell {
  const path = join(__dirname, '..', 'build', `${name}.boc`);
  return Cell.fromBoc(readFileSync(path))[0];
}

function rpcEndpoint(network: string): string {
  const custom = process.env.TON_RPC_ENDPOINT?.trim();
  if (custom) return custom;
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

async function adminKeyPair() {
  const pkHex = process.env.ADMIN_PRIVATE_KEY_HEX?.replace(/^0x/i, '').replace(/\s+/g, '');
  if (pkHex && pkHex.length >= 64) {
    const seed = Buffer.from(pkHex.slice(0, 64), 'hex');
    return keyPairFromSeed(seed);
  }
  const words = process.env.ADMIN_MNEMONIC?.trim().split(/\s+/);
  if (!words?.length) {
    throw new Error('Set ADMIN_MNEMONIC or ADMIN_PRIVATE_KEY_HEX');
  }
  const password = process.env.ADMIN_MNEMONIC_PASSWORD?.trim() || undefined;
  return mnemonicToPrivateKey(words, password);
}

async function main() {
  const network = (process.env.TON_NETWORK || 'testnet').trim();
  const metadataUrl = process.env.METADATA_URL?.trim();
  if (!metadataUrl) {
    throw new Error('Set METADATA_URL (e.g. https://your-backend/jetton-metadata.json)');
  }

  let signerSeedHex = process.env.SIGNER_SEED_HEX?.replace(/^0x/i, '').trim();
  if (!signerSeedHex) {
    const words = await mnemonicNew(24);
    const kp = await mnemonicToPrivateKey(words);
    signerSeedHex = Buffer.from(kp.secretKey.subarray(0, 32)).toString('hex');
    console.log('Generated SIGNER_SEED_HEX (save securely):', signerSeedHex);
    console.log('Generated signer mnemonic (optional backup):', words.join(' '));
  }

  const signerKp = keyPairFromSeed(Buffer.from(signerSeedHex, 'hex'));
  const signerPubkey = BigInt(`0x${signerKp.publicKey.toString('hex')}`);

  const adminKp = await adminKeyPair();
  const walletVersion = (process.env.ADMIN_WALLET_VERSION || 'v4').trim();
  const subwallet = Number(process.env.ADMIN_V5R1_SUBWALLET || '0');

  const client = new TonClient({
    endpoint: rpcEndpoint(network),
    apiKey: process.env.TON_RPC_API_KEY?.trim() || undefined,
  });

  const networkGlobalId = network === 'mainnet' ? -239 : -3;
  const adminWallet =
    walletVersion === 'v5r1'
      ? client.open(
          WalletContractV5R1.create({
            publicKey: adminKp.publicKey,
            walletId: {
              networkGlobalId,
              context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber: subwallet },
            },
          }),
        )
      : client.open(WalletContractV4.create({ workchain: 0, publicKey: adminKp.publicKey }));

  const masterCode = loadBoc('RollingMintlessMaster');
  const walletCode = loadBoc('RollingMintlessWallet');
  const maxSupply = BigInt(process.env.MAX_SUPPLY_NANO || '0');

  const master = RollingMintlessMaster.createFromConfig(
    {
      totalSupply: 0n,
      maxSupply,
      admin: adminWallet.address,
      content: toOffchainContentCell(metadataUrl),
      walletCode,
      signerPubkey: signerPubkey,
    },
    masterCode,
  );

  const deployTon = process.env.DEPLOY_VALUE_TON || '0.15';
  const value = toNano(deployTon);

  console.log('Network:', network);
  console.log('Admin wallet:', adminWallet.address.toString({ bounceable: false, urlSafe: true }));
  console.log('Metadata URL:', metadataUrl);
  console.log('Master address (pre-send):', master.address.toString({ bounceable: false, urlSafe: true }));

  const seqno = await adminWallet.getSeqno();
  await adminWallet.sendTransfer({
    seqno,
    secretKey: adminKp.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [
      internal({
        to: master.address,
        value,
        init: master.init!,
        body: beginCell().endCell(),
        bounce: false,
      }),
    ],
  });

  console.log('\nDeploy transaction sent. Wait ~30s then verify on Tonviewer.');
  console.log('JETTON_MASTER_ADDRESS=' + master.address.toString({ bounceable: false, urlSafe: true }));
  console.log('SIGNER_SEED_HEX=' + signerSeedHex);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
