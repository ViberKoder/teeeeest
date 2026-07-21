import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate, type KeyPair } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

export interface WalletAccount {
  keyPair: KeyPair;
  contract: WalletContractV4;
  address: string;
}

export async function generateMnemonic(): Promise<string[]> {
  return mnemonicNew(24);
}

export async function validateMnemonic(words: string[], mnemonicPassword?: string): Promise<boolean> {
  return mnemonicValidate(words, mnemonicPassword);
}

export async function accountFromMnemonic(
  words: string[],
  mnemonicPassword?: string,
): Promise<WalletAccount> {
  if (!(await validateMnemonic(words, mnemonicPassword))) {
    throw new Error('Некорректная мнемоника — проверьте 24 слова.');
  }
  const keyPair = await mnemonicToPrivateKey(words, mnemonicPassword?.trim() || undefined);
  return accountFromKeyPair(keyPair);
}

export function accountFromKeyPair(keyPair: KeyPair): WalletAccount {
  const contract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const address = contract.address.toString({ urlSafe: true, bounceable: false });
  return { keyPair, contract, address };
}
