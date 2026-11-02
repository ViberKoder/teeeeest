// Where the token lives. Not secret. (The publisher's key is in lib/publisherkey.js, which is git-ignored.)
export const NETWORK = 'testnet';
export const TONCENTER = 'https://testnet.toncenter.com/api/v2';
export const MINTER = '0:8ffa8137c2ffe4cc8a3888ed7a2971e0cc1af75cf2fd439f25caf9ed570b7047';
export const PUBLISHER = '0:b40bfc013cb4c74364373a2ee8707ebb59d705aec0c55143271cf93dad548bb6';
export const PUBLISH_VALUE = 30000000n; // 0.03 TON per PublishRoot
export const MIN_INTERVAL = 70; // seconds between roots (the contract insists on 60)
export const RESEND_AFTER = 150; // seconds before an unconfirmed root is sent again
