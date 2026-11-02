import { tickSafe } from '../lib/publisher.js';
import { tickVault } from '../lib/vault.js';

// Nudges the bot's background work (publisher + vault payouts). Kept apart from `me` so that opening the wallet never waits for it.
export default async function () {
  const vault = await tickVault(Math.floor(Date.now() / 1000)).catch((e) => `error: ${String(e?.message ?? e)}`);
  return { status: await tickSafe(), vault };
}
