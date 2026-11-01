/** Message opcodes. Must match contracts/contracts/messages.tolk. */
export const Op = {
  // TEP-74 / TEP-89
  transfer: 0x0f8a7ea5,
  transferNotification: 0x7362d09c,
  internalTransfer: 0x178d4519,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burnNotification: 0x7bdd97de,
  provideWalletAddress: 0x2c76b973,
  takeWalletAddress: 0xd1735400,
  // claims
  askToClaim: 0x28dac35b,
  claimRequest: 0x87a42c7c,
  claimCredit: 0x49e1974f,
  // governance
  publishRoot: 0x0e7ccd64,
  changePublisher: 0x97d70ce0,
  setLimits: 0x0cc58dbc,
  changeAdmin: 0x6501f354,
  claimAdmin: 0xfb88e119,
  dropAdmin: 0x7431f221,
  changeMetadata: 0xcb862902,
  topUp: 0xd372158c,
} as const;

/** Exit codes. Must match contracts/contracts/errors.tolk. */
export const Err = {
  balance: 47,
  notEnoughGas: 48,
  notOwner: 73,
  notValidWallet: 74,
  wrongWorkchain: 333,
  notAdmin: 80,
  notPublisher: 81,
  epochOutOfOrder: 82,
  totalDecreased: 83,
  supplyExceeded: 84,
  growthLimit: 85,
  publishTooSoon: 86,
  unknownEpoch: 90,
  proofMismatch: 91,
  proofTooDeep: 92,
  claimInProgress: 93,
  notMinter: 94,
} as const;
