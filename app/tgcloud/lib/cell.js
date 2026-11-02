// A minimal TON cell: builder, representation hash, BoC writer and reader. Only what the publisher needs.
import { concat, sha256 } from './bytes.js';

export class Cell {
  constructor(bits, refs) {
    this.bits = bits; // array of 0/1
    this.refs = refs;
    this._hash = null;
    this._depth = null;
  }
  get depth() {
    return (this._depth ??= this.refs.length ? 1 + Math.max(...this.refs.map((r) => r.depth)) : 0);
  }
  /** descriptor bytes + data with the completion tag when the length is not a whole number of bytes */
  repr() {
    const n = this.bits.length;
    const full = Math.ceil(n / 8);
    const data = new Uint8Array(full);
    for (let i = 0; i < n; i++) if (this.bits[i]) data[i >> 3] |= 0x80 >> (i & 7);
    if (n % 8) data[full - 1] |= 0x80 >> (n % 8);
    return { d1: this.refs.length, d2: Math.floor(n / 8) + full, data };
  }
  async hash() {
    if (this._hash) return this._hash;
    const { d1, d2, data } = this.repr();
    const parts = [Uint8Array.of(d1, d2), data];
    for (const r of this.refs) parts.push(Uint8Array.of(r.depth >> 8, r.depth & 255));
    for (const r of this.refs) parts.push(await r.hash());
    this._hash = await sha256(concat(...parts));
    return this._hash;
  }
}

export class Builder {
  constructor() { this.bits = []; this.refs = []; }
  bit(b) { this.bits.push(b ? 1 : 0); return this; }
  uint(v, n) {
    let x = BigInt(v);
    if (x < 0n || x >= 1n << BigInt(n)) throw new Error('uint overflow');
    for (let i = n - 1; i >= 0; i--) this.bits.push(Number((x >> BigInt(i)) & 1n));
    return this;
  }
  int(v, n) { return this.uint(BigInt(v) < 0n ? (1n << BigInt(n)) + BigInt(v) : BigInt(v), n); }
  bytes(u8) { for (const b of u8) this.uint(b, 8); return this; }
  coins(v) {
    const x = BigInt(v);
    let len = 0;
    while (x >> BigInt(len * 8)) len++;
    this.uint(len, 4);
    for (let i = len - 1; i >= 0; i--) this.uint((x >> BigInt(i * 8)) & 255n, 8);
    return this;
  }
  /** raw "0:<64 hex>" → addr_std; null → addr_none */
  address(raw) {
    if (!raw) return this.uint(0, 2);
    const [wc, h] = raw.split(':');
    this.uint(2, 2).bit(0).int(Number(wc), 8);
    for (let i = 0; i < 64; i += 2) this.uint(parseInt(h.slice(i, i + 2), 16), 8);
    return this;
  }
  ref(c) { if (this.refs.length >= 4) throw new Error('too many refs'); this.refs.push(c); return this; }
  build() {
    if (this.bits.length > 1023) throw new Error('cell overflow');
    return new Cell(this.bits.slice(), this.refs.slice());
  }
}

/** Serialises cells into a BoC (no index, no checksum): parents always come before their children. */
export async function toBoc(root) {
  const byHash = new Map();
  const order = [];
  const visit = async (c) => {
    const h = (await c.hash()).join(',');
    if (byHash.has(h)) return byHash.get(h);
    const node = { cell: c, h, refs: [] };
    byHash.set(h, node);
    for (const r of c.refs) node.refs.push(await visit(r));
    order.push(node); // post-order: children first
    return node;
  };
  const top = await visit(root);
  order.reverse(); // reverse post-order puts every parent before its children
  const index = new Map(order.map((n, i) => [n, i]));
  const count = order.length;
  const body = [];
  for (const n of order) {
    const { d1, d2, data } = n.cell.repr();
    body.push(Uint8Array.of(d1, d2), data, Uint8Array.from(n.refs.map((r) => index.get(r))));
  }
  const bodyBytes = concat(...body);
  if (count > 255 || bodyBytes.length > 65535) throw new Error('BoC too large for this writer');
  return concat(Uint8Array.of(0xb5, 0xee, 0x9c, 0x72, 0x01, 0x02, count, 1, 0, bodyBytes.length >> 8, bodyBytes.length & 255, index.get(top)), bodyBytes);
}

/** Reads the first root of a BoC (handles the optional index and checksum). */
export function fromBoc(u8) {
  if (u8[0] !== 0xb5 || u8[1] !== 0xee || u8[2] !== 0x9c || u8[3] !== 0x72) throw new Error('not a BoC');
  const flags = u8[4];
  const hasIdx = (flags & 0x80) !== 0;
  const size = flags & 7;
  const offBytes = u8[5];
  let p = 6;
  const rd = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + u8[p++]; return v; };
  const cells = rd(size); const roots = rd(size); rd(size); rd(offBytes);
  const rootIdx = [];
  for (let i = 0; i < roots; i++) rootIdx.push(rd(size));
  if (hasIdx) p += cells * offBytes;
  const raw = [];
  for (let i = 0; i < cells; i++) {
    const d1 = u8[p++], d2 = u8[p++];
    const refCount = d1 & 7;
    const dataLen = (d2 >> 1) + (d2 & 1);
    const data = u8.slice(p, p + dataLen); p += dataLen;
    const refs = [];
    for (let j = 0; j < refCount; j++) refs.push(rd(size));
    let bitLen = (d2 >> 1) * 8;
    if (d2 & 1) { // last byte carries the completion tag
      const last = data[dataLen - 1];
      let t = 0;
      while (!((last >> t) & 1)) t++;
      bitLen = (dataLen - 1) * 8 + (7 - t);
    }
    raw.push({ data, bitLen, refs });
  }
  const made = new Array(cells);
  const make = (i) => {
    if (made[i]) return made[i];
    const r = raw[i];
    const bits = [];
    for (let k = 0; k < r.bitLen; k++) bits.push((r.data[k >> 3] >> (7 - (k & 7))) & 1);
    return (made[i] = new Cell(bits, r.refs.map(make)));
  };
  return make(rootIdx[0]);
}
