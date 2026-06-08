/**
 * Vault — persisted account metadata + encrypted seed.
 *
 * Storage layout:
 *
 *   localStorage["rmj-wallet:vault"] = JSON of VaultRecord
 *
 * Inside Telegram Mini Apps we also mirror the vault to `Telegram.WebApp.CloudStorage`
 * so that the user can restore on another device with the same Telegram account
 * (still passcode-protected — Telegram only sees the AES-GCM ciphertext).
 *
 * The plaintext mnemonic is NEVER persisted. The 32-byte seed is decrypted on
 * demand for each signing operation and wiped immediately after use.
 */

import type { EncryptedVault } from '../crypto/passcode';
import { decryptSeed } from '../crypto/passcode';

const KEY = 'rmj-wallet:vault';
const TMA_KEY = 'rmj_wallet_vault_v1';

export interface AccountMeta {
  /** Friendly EQ… / UQ… master address of the v5R1 wallet. */
  address: string;
  /** Raw 0:hex form, used for jetton-wallet derivation requests. */
  addressRaw: string;
  /** Public key in hex (32 bytes). */
  publicKeyHex: string;
  /** Wallet contract used. */
  walletVersion: 'v5R1';
  /** Network the address is computed for. */
  network: 'mainnet' | 'testnet';
  /** Local nickname shown in the UI. */
  name: string;
  /** Unix seconds when the vault was created. */
  createdAt: number;
}

export interface VaultRecord {
  v: 1;
  account: AccountMeta;
  encryptedSeed: EncryptedVault;
  /** Optional list of jetton master addresses the user has added to "watch". */
  watchedJettons: string[];
  /** Optional override of the RMJ backend base URL per jetton master. */
  rmjBackends: Record<string, string>;
}

function getTma(): any | null {
  return (globalThis as any).Telegram?.WebApp ?? null;
}

export function loadVault(): VaultRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultRecord;
    if (parsed.v !== 1 || !parsed.account || !parsed.encryptedSeed) return null;
    parsed.watchedJettons ??= [];
    parsed.rmjBackends ??= {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveVault(v: VaultRecord): void {
  localStorage.setItem(KEY, JSON.stringify(v));
  const tma = getTma();
  if (tma?.CloudStorage?.setItem) {
    try {
      tma.CloudStorage.setItem(TMA_KEY, JSON.stringify(v));
    } catch {
      /* CloudStorage values are capped at 4 kB; encrypted vault fits. Ignore failures silently. */
    }
  }
}

export function deleteVault(): void {
  localStorage.removeItem(KEY);
  const tma = getTma();
  if (tma?.CloudStorage?.removeItem) {
    try {
      tma.CloudStorage.removeItem(TMA_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function restoreVaultFromTmaCloud(): Promise<VaultRecord | null> {
  const tma = getTma();
  if (!tma?.CloudStorage?.getItem) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tma.CloudStorage.getItem(TMA_KEY, (err: unknown, value: string | null) => {
        if (err || !value) return resolve(null);
        try {
          const parsed = JSON.parse(value) as VaultRecord;
          if (parsed.v === 1) {
            localStorage.setItem(KEY, value);
            resolve(parsed);
            return;
          }
        } catch {
          /* fallthrough */
        }
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Unlock the vault; caller is responsible for wiping the returned seed. */
export async function unlockSeed(vault: VaultRecord, passcode: string): Promise<Uint8Array> {
  return decryptSeed(vault.encryptedSeed, passcode);
}

export function setWatchedJettons(jettons: string[]): void {
  const v = loadVault();
  if (!v) return;
  v.watchedJettons = Array.from(new Set(jettons));
  saveVault(v);
}

export function addWatchedJetton(master: string): void {
  const v = loadVault();
  if (!v) return;
  if (!v.watchedJettons.includes(master)) {
    v.watchedJettons = [...v.watchedJettons, master];
    saveVault(v);
  }
}

export function removeWatchedJetton(master: string): void {
  const v = loadVault();
  if (!v) return;
  v.watchedJettons = v.watchedJettons.filter((m) => m !== master);
  saveVault(v);
}

export function setRmjBackend(master: string, backend: string): void {
  const v = loadVault();
  if (!v) return;
  v.rmjBackends = { ...v.rmjBackends, [master]: backend.replace(/\/+$/, '') };
  saveVault(v);
}
