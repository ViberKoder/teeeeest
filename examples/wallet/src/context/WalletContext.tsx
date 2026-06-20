'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { KeyPair } from '@ton/crypto';
import type { WalletContractV4 } from '@ton/ton';
import { AUTO_LOCK_MINUTES } from '../config';
import {
  accountFromMnemonic,
  generateMnemonic,
  validateMnemonic,
  type WalletAccount,
} from '../wallet/account';
import {
  clearVault,
  decryptMnemonic,
  encryptMnemonic,
  hasVault,
  loadVault,
  saveVault,
  type EncryptedVault,
} from '../wallet/vault';
import { sendMessages, type OutgoingMessage } from '../wallet/send';

export interface WalletSession {
  address: string;
  contract: WalletContractV4;
  keyPair: KeyPair;
}

interface WalletContextValue {
  vaultExists: boolean;
  lockedAddress: string | null;
  session: WalletSession | null;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  createWallet: (password: string) => Promise<string[]>;
  confirmCreateWallet: (words: string[], password: string) => Promise<void>;
  importWallet: (words: string[], password: string, mnemonicPassword?: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  wipeWallet: (password: string) => Promise<void>;
  revealMnemonic: (password: string) => Promise<string[]>;
  sendOutgoing: (messages: OutgoingMessage[]) => Promise<void>;
  touchActivity: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<EncryptedVault | null>(null);
  const [vaultReady, setVaultReady] = useState(false);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    setVault(loadVault());
    setVaultReady(true);
  }, []);

  const touchActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  const lock = useCallback(() => {
    setSession(null);
  }, []);

  const openSession = useCallback((account: WalletAccount) => {
    setSession({
      address: account.address,
      contract: account.contract,
      keyPair: account.keyPair,
    });
    touchActivity();
  }, [touchActivity]);

  const unlock = useCallback(
    async (password: string) => {
      const v = loadVault();
      if (!v) throw new Error('Кошелёк не найден.');
      setBusy(true);
      setError(null);
      try {
        const words = await decryptMnemonic(v, password);
        const account = await accountFromMnemonic(words);
        if (account.address !== v.address) {
          throw new Error('Адрес не совпадает с сохранённым vault.');
        }
        openSession(account);
        setVault(v);
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [openSession],
  );

  const createWallet = useCallback(async (_password: string): Promise<string[]> => {
    return generateMnemonic();
  }, []);

  const confirmCreateWallet = useCallback(
    async (words: string[], password: string) => {
      if (!(await validateMnemonic(words))) throw new Error('Некорректная мнемоника.');
      setBusy(true);
      setError(null);
      try {
        const account = await accountFromMnemonic(words);
        const encrypted = await encryptMnemonic(words, password, account.address);
        saveVault(encrypted);
        setVault(encrypted);
        openSession(account);
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [openSession],
  );

  const importWallet = useCallback(
    async (words: string[], password: string, mnemonicPassword?: string) => {
      setBusy(true);
      setError(null);
      try {
        const account = await accountFromMnemonic(words, mnemonicPassword);
        const encrypted = await encryptMnemonic(words, password, account.address);
        saveVault(encrypted);
        setVault(encrypted);
        openSession(account);
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [openSession],
  );

  const wipeWallet = useCallback(async (password: string) => {
    const v = loadVault();
    if (!v) return;
    await decryptMnemonic(v, password);
    clearVault();
    setVault(null);
    setSession(null);
  }, []);

  const revealMnemonic = useCallback(async (password: string): Promise<string[]> => {
    const v = loadVault();
    if (!v) throw new Error('Кошелёк не найден.');
    return decryptMnemonic(v, password);
  }, []);

  const sendOutgoing = useCallback(
    async (messages: OutgoingMessage[]) => {
      if (!session) throw new Error('Кошелёк заблокирован.');
      setBusy(true);
      setError(null);
      try {
        await sendMessages(session.contract, session.keyPair, messages);
        touchActivity();
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [session, touchActivity],
  );

  useEffect(() => {
    if (!session) return;
    const ms = AUTO_LOCK_MINUTES * 60_000;
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current >= ms) lock();
    }, 30_000);
    return () => clearInterval(id);
  }, [session, lock]);

  const value = useMemo<WalletContextValue>(
    () => ({
      vaultExists: vaultReady && (vault !== null || hasVault()),
      lockedAddress: vaultReady ? (vault?.address ?? null) : null,
      session,
      busy,
      error,
      clearError: () => setError(null),
      createWallet,
      confirmCreateWallet,
      importWallet,
      unlock,
      lock,
      wipeWallet,
      revealMnemonic,
      sendOutgoing,
      touchActivity,
    }),
    [
      vault,
      vaultReady,
      session,
      busy,
      error,
      createWallet,
      confirmCreateWallet,
      importWallet,
      unlock,
      lock,
      wipeWallet,
      revealMnemonic,
      sendOutgoing,
      touchActivity,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
