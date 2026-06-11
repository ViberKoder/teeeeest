import { Address } from '@ton/core';
import type { TonClient } from '@ton/ton';

export type OnChainMerkle = {
  root: bigint;
  epoch: number;
  rootHex: string;
};

export function normalizeRootHex(value: bigint | string): string {
  if (typeof value === 'bigint') {
    return '0x' + value.toString(16).padStart(64, '0');
  }
  const t = value.trim().toLowerCase();
  if (t.startsWith('0x')) return '0x' + t.slice(2).padStart(64, '0');
  return '0x' + t.padStart(64, '0');
}

export function rootsMatch(a: bigint | string, b: bigint | string): boolean {
  try {
    const na = typeof a === 'bigint' ? a : BigInt(normalizeRootHex(a));
    const nb = typeof b === 'bigint' ? b : BigInt(normalizeRootHex(b));
    return na === nb;
  } catch {
    return false;
  }
}

export function isZeroRoot(root: bigint | string): boolean {
  try {
    const n = typeof root === 'bigint' ? root : BigInt(normalizeRootHex(root));
    return n === 0n;
  } catch {
    return false;
  }
}

export async function readOnChainMerkle(
  client: TonClient,
  master: Address,
): Promise<OnChainMerkle | null> {
  try {
    const res = await client.runMethod(master, 'get_merkle_root');
    const root = res.stack.readBigNumber();
    const epoch = res.stack.readNumber();
    return { root, epoch, rootHex: normalizeRootHex(root) };
  } catch {
    return null;
  }
}

export async function waitForOnChainMerkle(
  client: TonClient,
  master: Address,
  expectedRoot: bigint | string,
  minEpoch: number,
  opts?: { attempts?: number; delayMs?: number },
): Promise<OnChainMerkle | null> {
  const attempts = opts?.attempts ?? 20;
  const delayMs = opts?.delayMs ?? 3000;

  for (let i = 0; i < attempts; i++) {
    const onChain = await readOnChainMerkle(client, master);
    if (
      onChain &&
      rootsMatch(onChain.root, expectedRoot) &&
      onChain.epoch >= minEpoch
    ) {
      return onChain;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}
