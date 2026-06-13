import { beginCell, Cell } from '@ton/core';

const OFFCHAIN_INLINE_URI_MAX = 126;
const SNAKE_CHUNK = 127;

/** TEP-74 jetton master `change_content` (op 4). */
export const OP_CHANGE_CONTENT = 4;

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

function readSnakeBuffer(cell: Cell): Buffer {
  const chunks: Buffer[] = [];
  let cur: Cell | null = cell;
  while (cur) {
    const s = cur.beginParse();
    if (s.remainingBits > 0) {
      chunks.push(s.loadBuffer(Math.floor(s.remainingBits / 8)));
    }
    cur = s.remainingRefs > 0 ? s.loadRef() : null;
  }
  return Buffer.concat(chunks);
}

/** Parse TEP-64 off-chain URI from master content cell (tag 0x01). */
export function parseOffchainContentUri(content: Cell): string | null {
  try {
    const slice = content.beginParse();
    if (slice.loadUint(8) !== 0x01) return null;
    if (slice.remainingRefs > 0) {
      return readSnakeBuffer(slice.loadRef()).toString('utf8');
    }
    if (slice.remainingBits === 0) return null;
    return slice.loadBuffer(Math.floor(slice.remainingBits / 8)).toString('utf8');
  } catch {
    return null;
  }
}

/** Jetton master admin message body for `change_content` with a new off-chain URI. */
export function buildChangeContentBody(metadataUri: string): Cell {
  return beginCell()
    .storeUint(OP_CHANGE_CONTENT, 32)
    .storeUint(0, 64)
    .storeRef(toOffchainContentCell(metadataUri))
    .endCell();
}
