/** Thin, typed access to the Telegram Mini App runtime. Everything is optional: the app also runs in a plain browser. */
type Cb<T> = (err: string | null, value?: T) => void;

interface TgWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  onEvent(e: string, cb: () => void): void;
  openLink(url: string): void;
  openTelegramLink?(url: string): void;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton?: {
    setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    hide(): void;
  };
  /** Per-user storage that Telegram keeps with the account and syncs across devices. */
  CloudStorage?: {
    getItem(key: string, cb: Cb<string>): void;
    setItem(key: string, value: string, cb?: Cb<boolean>): void;
    removeItem(key: string, cb?: Cb<boolean>): void;
  };
}

export const tg: TgWebApp | undefined = (globalThis as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

export const inTelegram = Boolean(tg && tg.initData);
export const initData = () => tg?.initData ?? '';

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

export function bootTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
  // Outside Telegram the script still defines WebApp (always "light"): follow the browser instead.
  if (!inTelegram) return;
  const apply = () => {
    document.documentElement.dataset.theme = tg.colorScheme;
    // match the native chrome to the grouped-list background
    tg.setHeaderColor?.('secondary_bg_color');
    tg.setBackgroundColor?.('secondary_bg_color');
  };
  apply();
  tg.onEvent('themeChanged', apply);
}

export function openExternal(url: string) {
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function confirmNative(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm) tg.showConfirm(message, resolve);
    else resolve(window.confirm(message));
  });
}

/** Promise wrappers over Telegram's CloudStorage (resolve null when unavailable). */
export const cloud = {
  available: () => Boolean(tg?.CloudStorage && inTelegram),
  get(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (!tg?.CloudStorage || !inTelegram) return resolve(null);
      const t = setTimeout(() => resolve(null), 5000); // a storage that never answers must not freeze the app
      try { tg.CloudStorage.getItem(key, (err, v) => { clearTimeout(t); resolve(err || !v ? null : v); }); } catch { clearTimeout(t); resolve(null); }
    });
  },
  /** like get(), but tells "nothing stored" (ok, null) apart from "could not ask" (ok: false) */
  read(key: string): Promise<{ ok: boolean; value: string | null }> {
    return new Promise((resolve) => {
      if (!tg?.CloudStorage || !inTelegram) return resolve({ ok: false, value: null });
      const t = setTimeout(() => resolve({ ok: false, value: null }), 5000);
      try { tg.CloudStorage.getItem(key, (err, v) => { clearTimeout(t); resolve(err ? { ok: false, value: null } : { ok: true, value: v || null }); }); } catch { clearTimeout(t); resolve({ ok: false, value: null }); }
    });
  },
  set(key: string, value: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!tg?.CloudStorage || !inTelegram) return resolve(false);
      const t = setTimeout(() => resolve(false), 5000);
      try { tg.CloudStorage.setItem(key, value, (err, ok) => { clearTimeout(t); resolve(!err && ok !== false); }); } catch { clearTimeout(t); resolve(false); }
    });
  },
  remove(key: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!tg?.CloudStorage || !inTelegram) return resolve(false);
      const t = setTimeout(() => resolve(false), 5000);
      try { tg.CloudStorage.removeItem(key, (err, ok) => { clearTimeout(t); resolve(!err && ok !== false); }); } catch { clearTimeout(t); resolve(false); }
    });
  },
};

export function shareLink(url: string, text: string) {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(link);
  else window.open(link, '_blank', 'noopener');
}

/** The Telegram user id from the (signed) launch data; the server verifies the signature, this only labels what we sign. */
export function tgUserId(): number {
  try {
    const u = JSON.parse(new URLSearchParams(initData()).get('user') ?? '') as { id?: number };
    return typeof u.id === 'number' ? u.id : 0;
  } catch {
    return 0;
  }
}
