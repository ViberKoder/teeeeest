// Where the token lives and how the game pays. Not secret (keys live in lib/publisherkey.js, git-ignored).
export const NETWORK = 'testnet';
export const TONCENTER = 'https://testnet.toncenter.com/api/v2';
export const MINTER = '0:924d81f700c7d43a126263a9f79f6cb6354a64ecd9f84002be602846820d4b5b';

// The bot's own wallet: funds prepared wallets' first request and writes the public stats beacon.
export const VAULT = '0:7c77010e031806c6dc74fcad8541b51c24658d42caae7150dc51cbc8b65f7e6a';

export const BOT_USERNAME = 'hatchapp';
export const APP_URL = 'https://app8930916503.tgcloud.ai/';

/** Telegram ids allowed to publish posts and see admin stats. */
export const ADMINS = [1255314241];

// ---- the game (amounts in EGG, 1 EGG = 1e9 units) ----
export const EGG = 1000000000n;
export const REWARD = {
  post: EGG, // a tap on Hatch under a channel post
  inline: EGG, // hatching someone else's egg sent in a chat
  sender: 2n * EGG, // your egg was hatched by someone else
};
export const REFERRAL_PERCENT = 25n; // a referrer earns 25% of what the people they invited earn
export const DAILY_EARN_CAP = 300n * EGG; // per player per UTC day, all sources (the contract allows 1000/day/wallet)
export const PAIR_DAILY_CAP = 3; // the same sender + hatcher pair earns at most this many times a day (anti-farming)
export const MULTI_MAX = 100; // a multi egg can be hatched by up to this many people
export const SENDS_PER_DAY = 200; // eggs one player can send in a day

// ---- public stats beacon (written on-chain by the vault, read by hatch.tg) ----
export const BEACON_EVERY = 300; // seconds, at most; only when something changed
