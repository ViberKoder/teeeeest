import { Cell } from '@ton/core';
import minter from '../../contracts/artifacts/EggMinter.json';
import wallet from '../../contracts/artifacts/EggWallet.json';

/** Bytecode produced by `acton build` (committed, see contracts/artifacts). */
export const eggMinterCode: Cell = Cell.fromBase64(minter.codeBoc64);
export const eggWalletCode: Cell = Cell.fromBase64(wallet.codeBoc64);
export const codeHashes = { minter: minter.hash, wallet: wallet.hash };
