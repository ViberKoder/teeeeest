/**
 * In-memory keyring: holds the decrypted 32-byte ed25519 seed for the duration
 * of an unlock session.  Auto-locks on a configurable inactivity timeout so
 * that a backgrounded TMA wallet wipes secrets quickly.
 */

import { unlockSeed, loadVault, type VaultRecord } from './vault';

type Listener = (locked: boolean) => void;

const DEFAULT_AUTO_LOCK_MS = 5 * 60 * 1000;

class Keyring {
  private seed: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoLockMs = DEFAULT_AUTO_LOCK_MS;
  private listeners = new Set<Listener>();

  isLocked(): boolean {
    return this.seed === null;
  }

  async unlock(passcode: string): Promise<void> {
    const vault = loadVault();
    if (!vault) throw new Error('no vault');
    const seed = await unlockSeed(vault, passcode);
    this.setSeed(seed);
  }

  lock(): void {
    if (this.seed) {
      this.seed.fill(0);
      this.seed = null;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.notify();
  }

  setSeed(seed: Uint8Array): void {
    if (this.seed) this.seed.fill(0);
    this.seed = seed;
    this.resetAutoLock();
    this.notify();
  }

  /**
   * Run a function that needs the seed.  The callback receives a cloned seed
   * buffer; we never expose the internal one.  The auto-lock timer is reset
   * after each use.
   */
  async withSeed<T>(fn: (seed: Uint8Array) => Promise<T> | T): Promise<T> {
    if (!this.seed) throw new Error('locked');
    this.resetAutoLock();
    const copy = new Uint8Array(this.seed);
    try {
      return await fn(copy);
    } finally {
      copy.fill(0);
    }
  }

  setAutoLockMs(ms: number): void {
    this.autoLockMs = Math.max(15_000, ms);
    this.resetAutoLock();
  }

  resetAutoLock(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.seed) return;
    this.timer = setTimeout(() => this.lock(), this.autoLockMs);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    const l = this.isLocked();
    this.listeners.forEach((fn) => {
      try {
        fn(l);
      } catch {
        /* ignore */
      }
    });
  }
}

export const keyring = new Keyring();

/** Convenience: re-attempt with a fresh passcode prompt is a UI concern; keep this layer dumb. */
export function hasVault(): boolean {
  return loadVault() !== null;
}

export type { VaultRecord };
