# TgWallet

Source files in this folder are the `WalletTg` contract from https://github.com/ton-blockchain/tg-wallet-contract
(MIT, Copyright (c) 2026 TON Core), vendored **unchanged** at revision `1a29ae5`.

Telegram deploys it behind an immutable "trampoline" that jumps to code stored in the network config (updated by validator
voting). EGG cannot do that, so here the same code is simply the account's own code. Everything else — the storage layout,
signed requests, key rotation — is exactly the Telegram wallet's, which keeps EGG wallets familiar to tooling written for it.

`WalletTg-rev00.boc` is the upstream published bytecode of revision 00 (`contracts/revisions-boc/WalletTg-rev00.boc`); EGG deploys exactly those bytes. The Tolk sources are kept here for reading and type-checking; a local rebuild with a different Acton version can differ in bytes.
