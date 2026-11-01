/** Must match contracts/imports/egg-common.fc */
export const Op = {
  transfer: 0x0f8a7ea5,
  transferNotification: 0x7362d09c,
  internalTransfer: 0x178d4519,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burnNotification: 0x7bdd97de,
  provideWalletAddress: 0x2c76b973,
  takeWalletAddress: 0xd1735400,
  mint: 21,
  changeAdmin: 3,
  changeContent: 4,
  claim: 0x2f8a1d44,
  claimed: 0x6c0a5b21,
} as const;

export const Domain = {
  cert: 0x45474743, // "EGGC"
  claim: 0x4547474c, // "EGGL"
} as const;

export const Err = {
  unauthorized: 73,
  unknownOp: 0xffff,
  wrongWorkchain: 333,
  notOwner: 705,
  notEnoughTon: 706,
  notEnoughJetton: 707,
  notValidWallet: 708,
  wrongOp: 709,
  claimExpired: 810,
  certExpired: 811,
  keyRevoked: 812,
  badCertSig: 813,
  badClaimSig: 814,
  claimRegress: 815,
  maxSupplyExceeded: 816,
} as const;
