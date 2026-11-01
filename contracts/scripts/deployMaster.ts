/**
 * Deploys the EGG jetton master.
 *
 *   DEPLOYER_MNEMONIC="24 words" AUTHORITY_PUBKEY_HEX=… METADATA_URL=https://api.example.org/jetton.json \
 *   MAX_SUPPLY=100000000000000000000 NETWORK=testnet TONCENTER_KEY=… npx ts-node scripts/deployMaster.ts
 *
 * Amounts are in jetton units (decimals 9). The deployer wallet becomes the admin
 * (mint / change content): use a dedicated wallet, ideally a multisig later.
 * Run it on testnet first and keep the printed master address for the server and app configs.
 */
import { compile } from '@ton/blueprint';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { internal, SendMode, TonClient, WalletContractV5R1 } from '@ton/ton';
import { toNano } from '@ton/core';
import { EggMaster, offchainContent } from '../wrappers';

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
  const keys = await mnemonicToPrivateKey(need('DEPLOYER_MNEMONIC').split(/\s+/));
  const wallet = client.open(
    WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: testnet ? -3 : -239 } }),
  );

  const master = EggMaster.createFromConfig(
    {
      maxSupply: BigInt(process.env.MAX_SUPPLY ?? '0'),
      admin: wallet.address,
      content: offchainContent(need('METADATA_URL')),
      walletCode: await compile('EggWallet'),
      authority: BigInt('0x' + need('AUTHORITY_PUBKEY_HEX')),
    },
    await compile('EggMaster'),
  );

  console.log('deployer :', wallet.address.toString({ testOnly: testnet }));
  console.log('master   :', master.address.toString({ testOnly: testnet }));
  if (await client.isContractDeployed(master.address)) return console.log('already deployed');

  await wallet.sendTransfer({
    seqno: await wallet.getSeqno(),
    secretKey: keys.secretKey,
    sendMode: SendMode.PAY_GAS_SEPARATELY,
    messages: [internal({ to: master.address, value: toNano('0.1'), init: master.init, bounce: false, body: undefined })],
  });
  console.log('deploy message sent — check the master address in an explorer in a minute');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
