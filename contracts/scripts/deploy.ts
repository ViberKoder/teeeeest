import { compile } from '@ton/blueprint';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { mnemonicToPrivateKey, keyPairFromSeed } from '@ton/crypto';
import { TonClient, WalletContractV4 } from '@ton/ton';
import { RollingMintlessMaster } from '../wrappers';

function env(name: string, required = true): string {
  const value = process.env[name]?.trim() ?? '';
  if (required && !value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseNetwork() {
  const network = (process.env.TON_NETWORK ?? 'testnet').trim().toLowerCase();
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(`TON_NETWORK must be testnet|mainnet, got: ${network}`);
  }
  return network;
}

function endpointFromEnv(network: 'testnet' | 'mainnet'): string {
  const explicit = process.env.TON_RPC_ENDPOINT?.trim();
  if (explicit) return explicit;
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

function offchainContentCell(url: string): Cell {
  // TEP-64 off-chain content marker = 0x01 + utf8 URL
  return beginCell().storeUint(0x01, 8).storeStringTail(url).endCell();
}

async function waitSeqnoBump(
  getSeqno: () => Promise<number>,
  previous: number,
  timeoutMs = 60_000,
): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await getSeqno();
    if (current > previous) return current;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timeout waiting seqno bump (prev=${previous})`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Rolling Mintless Jetton deploy script

Required env:
  TON_NETWORK=testnet|mainnet
  METADATA_URL=https://.../jetton-metadata.json
  ADMIN_MNEMONIC="word1 ... word24"
  SIGNER_SEED_HEX=<64 hex chars>

Optional env:
  TON_RPC_ENDPOINT=https://...
  TON_RPC_API_KEY=...
  DEPLOY_VALUE_TON=0.15
  INITIAL_MINT_JETTON=0
  INITIAL_MINT_TO=EQ...
  INITIAL_MINT_FORWARD_TON=0.02
  INITIAL_MINT_TOTAL_TON=0.05

Examples:
  cp .env.deploy.example .env && source .env && npm run deploy:testnet
  source .env && INITIAL_MINT_JETTON=1000000000000 npm run deploy:testnet
`);
    process.exit(0);
  }

  const network = parseNetwork();
  const endpoint = endpointFromEnv(network);
  const apiKey = process.env.TON_RPC_API_KEY?.trim() || undefined;

  const metadataUrl = env('METADATA_URL');
  const adminMnemonic = env('ADMIN_MNEMONIC')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (adminMnemonic.length !== 24) {
    throw new Error(`ADMIN_MNEMONIC must contain 24 words, got ${adminMnemonic.length}`);
  }

  const signerSeedHex = env('SIGNER_SEED_HEX');
  if (!/^[0-9a-fA-F]{64}$/.test(signerSeedHex)) {
    throw new Error('SIGNER_SEED_HEX must be 64 hex chars');
  }
  const signer = keyPairFromSeed(Buffer.from(signerSeedHex, 'hex'));
  const signerPubkey = BigInt(`0x${Buffer.from(signer.publicKey).toString('hex')}`);

  const deployValueTon = process.env.DEPLOY_VALUE_TON?.trim() || '0.15';
  const initialMintJetton = process.env.INITIAL_MINT_JETTON?.trim() || '0';
  const mintTo = process.env.INITIAL_MINT_TO?.trim() || '';
  const mintForwardTon = process.env.INITIAL_MINT_FORWARD_TON?.trim() || '0.02';
  const mintTotalTon = process.env.INITIAL_MINT_TOTAL_TON?.trim() || '0.05';

  const client = new TonClient({ endpoint, apiKey });
  const adminKey = await mnemonicToPrivateKey(adminMnemonic);
  const adminWallet = WalletContractV4.create({ workchain: 0, publicKey: adminKey.publicKey });
  const openedAdminWallet = client.open(adminWallet);
  const adminSender = openedAdminWallet.sender(adminKey.secretKey);
  const adminAddress = adminWallet.address;

  console.log('Network:', network);
  console.log('Endpoint:', endpoint);
  console.log('Admin wallet:', adminAddress.toString({ bounceable: false }));
  console.log('Signer pubkey:', `0x${signerPubkey.toString(16).padStart(64, '0')}`);
  console.log('Metadata URL:', metadataUrl);

  const masterCode = await compile('RollingMintlessMaster');
  const walletCode = await compile('RollingMintlessWallet');

  const master = RollingMintlessMaster.createFromConfig(
    {
      totalSupply: 0n,
      admin: adminAddress,
      content: offchainContentCell(metadataUrl),
      walletCode,
      signerPubkey,
      merkleRoot: 0n,
      epoch: 0,
      isPaused: false,
    },
    masterCode,
  );
  const openedMaster = client.open(master);

  console.log('Predicted master:', master.address.toString({ bounceable: false }));
  const seqnoBeforeDeploy = await openedAdminWallet.getSeqno();
  console.log('Deploying (seqno', seqnoBeforeDeploy, ')...');
  await openedMaster.sendDeploy(adminSender, toNano(deployValueTon));
  await waitSeqnoBump(() => openedAdminWallet.getSeqno(), seqnoBeforeDeploy);

  const state = await client.getContractState(master.address);
  console.log('Master deploy state:', state.state);
  if (state.state !== 'active') {
    throw new Error(`Master contract is not active after deploy (state=${state.state})`);
  }

  const mintAmount = BigInt(initialMintJetton);
  if (mintAmount > 0n) {
    const mintTarget = mintTo ? Address.parse(mintTo) : adminAddress;
    console.log(
      `Minting initial supply: ${mintAmount.toString()} units to ${mintTarget.toString({ bounceable: false })}`,
    );
    const seqnoBeforeMint = await openedAdminWallet.getSeqno();
    await openedMaster.sendMint(adminSender, {
      to: mintTarget,
      jettonAmount: mintAmount,
      forwardTonAmount: toNano(mintForwardTon),
      totalTonAmount: toNano(mintTotalTon),
      queryId: BigInt(Math.floor(Date.now() / 1000)),
    });
    await waitSeqnoBump(() => openedAdminWallet.getSeqno(), seqnoBeforeMint);
    console.log('Initial mint sent');
  }

  console.log('\n=== DONE ===');
  console.log('MASTER_ADDRESS=', master.address.toString({ bounceable: false }));
  console.log('ADMIN_ADDRESS=', adminAddress.toString({ bounceable: false }));
  console.log('SIGNER_PUBKEY_HEX=', Buffer.from(signer.publicKey).toString('hex'));
}

main().catch((e) => {
  console.error('deploy.ts failed:', e);
  process.exit(1);
});

