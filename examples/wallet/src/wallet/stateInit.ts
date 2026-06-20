import { Cell, loadStateInit, type StateInit } from '@ton/core';

/** Parse StateInit BoC from RMJ backend / TON Connect format. */
export function stateInitFromBoc(b64: string): StateInit {
  const cell = Cell.fromBase64(b64);
  return loadStateInit(cell.beginParse());
}
