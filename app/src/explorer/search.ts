import { Address } from '@ton/core';

export type Query = { kind: 'address'; address: Address } | { kind: 'username'; name: string } | { kind: 'tx'; hash: string } | null;

/** What the search box was given: a wallet address, a @username, or a transaction hash. */
export function parseQuery(raw: string): Query {
  const q = raw.trim();
  if (!q) return null;
  if (/^[0-9a-fA-F]{64}$/.test(q)) return { kind: 'tx', hash: q.toLowerCase() };
  if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(q) && !/^[A-Za-z0-9_-]{48}$/.test(q)) return { kind: 'username', name: q.replace(/^@/, '') };
  try {
    return { kind: 'address', address: Address.parse(q) };
  } catch {
    return null;
  }
}
