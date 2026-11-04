import { api } from '../api/server';
import { ton } from './client';
import type { WalletProvider } from '../provider/types';

/**
 * A player with no TON asks the bot to pay their first network fee (once per account). Resolves true once the TON has arrived,
 * so the caller can simply try again.
 */
export async function askForGas(provider: WalletProvider, need = 90_000_000n): Promise<boolean> {
  if (!api.available()) return false;
  const r = await api.gas().catch(() => null);
  if (!r) return false;
  for (let i = 0; i < 20; i++) {
    if ((await ton().getBalance(provider.address).catch(() => 0n)) >= need) return true;
    await new Promise((res) => setTimeout(res, 2500));
  }
  return false;
}
