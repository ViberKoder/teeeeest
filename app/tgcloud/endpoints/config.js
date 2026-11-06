import { NETWORK, BOT_USERNAME } from '../lib/config.js';
import { getSettings } from '../lib/settings.js';

// Public: which token contract is active (the wallet and the explorer read it at start, so switching the token needs no rebuild).
export default async function () {
  return { minter: (await getSettings()).minter, network: NETWORK, bot: BOT_USERNAME };
}
