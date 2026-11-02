import { Cell } from '@ton/core';
import minter from '../../contracts/artifacts/EggMinter.json';
import wallet from '../../contracts/artifacts/EggWallet.json';
import tgWallet from '../../contracts/artifacts/TgWallet.json';

/** Bytecode produced by `acton build` (committed, see contracts/artifacts). */
export const eggMinterCode: Cell = Cell.fromBase64(minter.codeBoc64);
export const eggWalletCode: Cell = Cell.fromBase64(wallet.codeBoc64);
/** The Telegram wallet contract (WalletTg rev00), the account code of every player's wallet. */
export const tgWalletCode: Cell = Cell.fromBase64(tgWallet.codeBoc64);
export const codeHashes = { minter: minter.hash, wallet: wallet.hash, tgWallet: tgWallet.hash };
