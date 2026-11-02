/**
 * Deploys the EGG minter.
 *
 *   DEPLOYER_MNEMONIC="…" ADMIN_ADDRESS=… PUBLISHER_ADDRESS=… MAX_SUPPLY=100000000000000000000 \
 *   NAME=Egg SYMBOL=EGG IMAGE=https://… NETWORK=testnet TONCENTER_KEY=… npm run deploy-minter
 *
 * ADMIN_ADDRESS should be a cold wallet (later a multisig). It can rotate the publisher, tune limits and
 * change metadata — it cannot mint. PUBLISHER_ADDRESS is the hot wallet the server uses; the contract rate-limits it.
 * Amounts are jetton units (decimals 9 ⇒ 1 EGG = 1 000 000 000).
 */
import { Address, toNano } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { internal, SendMode, TonClient, WalletContractV5R1 } from '@ton/ton';
import { eggMinterCode, minterStateInit, onchainMetadata, topUpBody } from '@egg/sdk';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};

async function main() {
  const testnet = (process.env.NETWORK ?? 'testnet') === 'testnet';
  const client = new TonClient({
    endpoint: testnet ? 'https://testnet.toncenter.com/api/v2/jsonRPC' : 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TONCENTER_KEY,
  });
  const keys = await mnemonicToPrivateKey(need('DEPLOYER_MNEMONIC').trim().split(/\s+/));
  const deployer = client.open(WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: testnet ? -3 : -239 } }));

  // Limits can only be tightened later, so choose them deliberately. Refuse the dangerous defaults.
  const maxSupply = BigInt(need('MAX_SUPPLY'));
  const maxGrowth = BigInt(need('MAX_GROWTH'));
  const periodSeconds = Number(process.env.PERIOD_SECONDS ?? 3600);
  const admin = Address.parse(need('ADMIN_ADDRESS'));
  const publisher = Address.parse(need('PUBLISHER_ADDRESS'));
  if (maxGrowth <= 0n || maxGrowth > maxSupply) throw new Error('MAX_GROWTH must be in (0, MAX_SUPPLY]');
  if (maxGrowth * 20n > maxSupply * BigInt(Math.max(1, Math.floor(86_400 / periodSeconds)))) console.warn('warning: MAX_GROWTH allows more than 5% of the supply per day');
  if (!Number.isInteger(periodSeconds) || periodSeconds < 60) throw new Error('PERIOD_SECONDS must be an integer >= 60');
  if (admin.equals(publisher)) throw new Error('ADMIN_ADDRESS and PUBLISHER_ADDRESS must be different wallets (the admin should stay cold)');

  const { init, address } = minterStateInit(
    {
      maxSupply,
      admin,
      publisher,
      maxGrowth,
      periodSeconds,
      minInterval: Number(process.env.MIN_INTERVAL ?? 60),
      metadata: onchainMetadata({
        name: process.env.NAME ?? 'Egg',
        symbol: process.env.SYMBOL ?? 'EGG',
        decimals: Number(process.env.DECIMALS ?? 9),
        description: process.env.DESCRIPTION ?? 'Hatch eggs. Earn EGG.',
        image: process.env.IMAGE,
      }),
    },
    eggMinterCode,
  );
  console.log('deployer:', deployer.address.toString({ testOnly: testnet }));
  console.log('minter  :', address.toString({ testOnly: testnet }));
  if (await client.isContractDeployed(address)) return console.log('already deployed');

  await deployer.sendTransfer({
    seqno: await deployer.getSeqno(),
    secretKey: keys.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to: address, value: toNano('0.2'), init, bounce: false, body: topUpBody() })],
  });
  console.log('deploy sent. Put the minter address into the server (JETTON_MASTER_ADDRESS) and the app (VITE_JETTON_MASTER).');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
