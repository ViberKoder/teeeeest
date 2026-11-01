/** Generates a fresh v5r1 wallet (mnemonic + address). Use one for the publisher and a separate cold one for the minter admin. */
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV5R1 } from '@ton/ton';

async function main() {
  const testnet = (process.env.NETWORK ?? 'testnet') === 'testnet';
  const words = await mnemonicNew(24);
  const keys = await mnemonicToPrivateKey(words);
  const w = WalletContractV5R1.create({ workchain: 0, publicKey: keys.publicKey, walletId: { networkGlobalId: testnet ? -3 : -239 } });
  console.log('MNEMONIC="' + words.join(' ') + '"');
  console.log('ADDRESS=' + w.address.toString({ testOnly: testnet, bounceable: false }));
}
main();
