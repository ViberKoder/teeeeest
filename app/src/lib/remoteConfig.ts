import { Address } from '@ton/core';
import { api } from '../api/server';
import { cfg } from '../config';

/**
 * Which token contract is active is decided by the admin panel, not by the build: ask the bot at start (bounded to ~1.5 s, falling back
 * to the one the app was built with) so switching the token needs no redeploy.
 */
export async function applyRemoteConfig(): Promise<void> {
  if (!api.available()) return;
  try {
    const r = await Promise.race([api.config(), new Promise<null>((res) => setTimeout(() => res(null), 1500))]);
    if (r?.minter && r.minter !== '0:' + '0'.repeat(64)) {
      Address.parseRaw(r.minter); // throws on garbage
      (cfg as { master: string }).master = r.minter;
    }
  } catch {
    /* keep the built-in value */
  }
}
