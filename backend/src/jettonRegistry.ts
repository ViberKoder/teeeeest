import { Address } from '@ton/core';
import type { AppStore } from './store/appStore';

/** Per-master TEP-64 fields saved by the web minter (or operators). */
export type JettonRegistryEntry = {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  decimals?: string;
  registered_at: number;
};

function registryKey(master: Address): string {
  return `jetton_registry:${master.toRawString()}`;
}

export async function saveJettonRegistry(
  store: AppStore,
  master: Address,
  entry: Omit<JettonRegistryEntry, 'registered_at'>,
): Promise<void> {
  const body: JettonRegistryEntry = {
    ...entry,
    registered_at: Math.floor(Date.now() / 1000),
  };
  await store.setKv(registryKey(master), JSON.stringify(body));
}

export async function loadJettonRegistry(
  store: AppStore,
  master: Address,
): Promise<JettonRegistryEntry | null> {
  const raw = await store.getKv(registryKey(master));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JettonRegistryEntry;
  } catch {
    return null;
  }
}
