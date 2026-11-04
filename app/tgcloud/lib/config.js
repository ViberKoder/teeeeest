// Where the token lives. Not secret. (The publisher's key is in lib/publisherkey.js, which is git-ignored.)
export const NETWORK = 'testnet';
export const TONCENTER = 'https://testnet.toncenter.com/api/v2';
export const MINTER = '0:1efddcca6bdd85088a8e2b9359a7e12425f33ca31c1c9a5104f119332071a810';
export const PUBLISHER = '0:b40bfc013cb4c74364373a2ee8707ebb59d705aec0c55143271cf93dad548bb6';
export const PUBLISH_VALUE = 12000000n; // 0.012 TON per PublishRoot (the contract only stores a hash)
export const MIN_INTERVAL = 70; // seconds between roots (the contract insists on 60)
export const RESEND_AFTER = 150; // seconds before an unconfirmed root is sent again

// Transfers to a @username that has not opened the wallet yet wait in the vault (a WalletTg held by the bot) and are paid
// out to that person's own wallet when they open it. The sender can take them back after REFUND_AFTER seconds.
export const VAULT = '0:7c77010e031806c6dc74fcad8541b51c24658d42caae7150dc51cbc8b65f7e6a';
export const VAULT_JW = '0:6a1d06175b56b031c3fa2b380f7021e3785ae21947174245fc59bed238c225cb'; // the vault's EGG wallet
export const FEE = 50000000n; // 0.05 TON: what a TON deposit adds to cover the payout (EGG deposits carry TON in the forward amount)
export const JETTON_PAYOUT_VALUE = 60000000n; // TON attached to the vault's jetton transfer
export const REFUND_AFTER = 7 * 24 * 3600;
