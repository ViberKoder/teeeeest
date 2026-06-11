import { beginCell, Cell } from '@ton/core';

const OFFCHAIN_INLINE_URI_MAX = 126;
const SNAKE_CHUNK = 127;

function buildSnakeFromBuffer(data: Buffer): Cell {
  const chunks: Buffer[] = [];
  for (let i = 0; i < data.length; i += SNAKE_CHUNK) {
    chunks.push(data.subarray(i, Math.min(i + SNAKE_CHUNK, data.length)));
  }
  let cell = beginCell().storeBuffer(chunks[chunks.length - 1]!).endCell();
  for (let i = chunks.length - 2; i >= 0; i--) {
    cell = beginCell().storeBuffer(chunks[i]!).storeRef(cell).endCell();
  }
  return cell;
}

/** TEP-64 off-chain URI content cell (matches RMJ minter `toOffchainContentCell`). */
export function toOffchainContentCell(url: string): Cell {
  const bytes = Buffer.from(url, 'utf8');
  if (bytes.length <= OFFCHAIN_INLINE_URI_MAX) {
    return beginCell().storeUint(0x01, 8).storeBuffer(bytes).endCell();
  }
  const snake = buildSnakeFromBuffer(bytes);
  return beginCell().storeUint(0x01, 8).storeRef(snake).endCell();
}
