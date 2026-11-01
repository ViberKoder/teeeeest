import { Buffer } from 'buffer';

// @ton/* expects a global Buffer in the browser.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer ??= Buffer;
