/**
 * Canonical opcodes used by Rolling Mintless Jetton contracts.
 * These MUST match the values in contracts/imports/constants.fc.
 */
export const OpCodes = {
  // TEP-74 standard
  transfer: 0xf8a7ea5,
  transferNotification: 0x7362d09c,
  internalTransfer: 0x178d4519,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burnNotification: 0x7bdd97de,
  provideWalletAddress: 0x2c76b973,
  takeWalletAddress: 0xd1735400,

  // Jetton master admin
  mint: 21,
  changeAdmin: 3,
  changeContent: 4,

  // Rolling Mintless custom ops
  updateMerkleRoot: 0x9b0b2bea,
  updateSigner: 0x5a3e7b36,
  pause: 0x3c14d9e1,
  unpause: 0x9f3b8a5d,

  // Custom-payload opcode for rolling claim
  rollingClaim: 0xc9e56df3,
} as const;

export const ErrorCodes = {
  unauthorized: 73,
  paused: 74,
  unknownOp: 0xffff,
  notOwner: 705,
  notEnoughTon: 706,
  notEnoughJetton: 707,
  notValidWallet: 708,
  voucherBadSig: 800,
  voucherStaleEpoch: 801,
  proofBadRoot: 802,
  proofLeafParse: 803,
  proofNotStarted: 804,
  proofExpired: 805,
  proofStaleAmount: 806,
  epochNotIncreasing: 807,
} as const;
