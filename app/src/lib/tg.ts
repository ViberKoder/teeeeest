/** Thin, typed access to the Telegram Mini App runtime. Everything is optional: the app also runs in a plain browser. */
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
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  safeAreaInset?: { top: number; bottom: number };
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
  const apply = () => {
    document.documentElement.dataset.theme = tg.colorScheme;
    const bg = tg.colorScheme === 'dark' ? '#0f0c09' : '#fff8ec';
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
  };
  apply();
  tg.onEvent('themeChanged', apply);
}

export function openExternal(url: string) {
  if (tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}
