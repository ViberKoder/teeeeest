/**
 * @ton/core и часть @ton/crypto ожидают `Buffer` как в Node. Vite в браузере его не даёт.
 */
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
