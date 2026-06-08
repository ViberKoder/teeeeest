/**
 * Thin wrapper over `window.Telegram.WebApp`.  We avoid `@telegram-apps/sdk`
 * for the bootstrap path because the script tag in `index.html` already gives
 * us a synchronous instance, and we want the wallet to work in regular
 * browsers too.
 */

type Wa = any;

function wa(): Wa | null {
  return (globalThis as any).Telegram?.WebApp ?? null;
}

export function isTma(): boolean {
  return wa() !== null && typeof wa()?.initData === 'string' && wa().initData.length > 0;
}

export function initTma(): void {
  const w = wa();
  if (!w) return;
  try {
    w.ready();
    w.expand?.();
    w.disableVerticalSwipes?.();
    w.setHeaderColor?.('#0e1116');
    w.setBackgroundColor?.('#0e1116');
  } catch {
    /* TWA SDK methods can throw on older clients — non-fatal. */
  }
}

export interface TmaTheme {
  bg: string;
  text: string;
  hint: string;
  link: string;
  button: string;
  buttonText: string;
  surface: string;
  surfaceMuted: string;
}

const DEFAULT_THEME: TmaTheme = {
  bg: '#0e1116',
  text: '#f0f2f5',
  hint: '#8a93a3',
  link: '#5aa9ff',
  button: '#4f8cff',
  buttonText: '#ffffff',
  surface: '#171b22',
  surfaceMuted: '#1f242d',
};

export function getTheme(): TmaTheme {
  const w = wa();
  const t = w?.themeParams;
  if (!t) return DEFAULT_THEME;
  return {
    bg: t.bg_color ?? DEFAULT_THEME.bg,
    text: t.text_color ?? DEFAULT_THEME.text,
    hint: t.hint_color ?? DEFAULT_THEME.hint,
    link: t.link_color ?? DEFAULT_THEME.link,
    button: t.button_color ?? DEFAULT_THEME.button,
    buttonText: t.button_text_color ?? DEFAULT_THEME.buttonText,
    surface: t.secondary_bg_color ?? DEFAULT_THEME.surface,
    surfaceMuted: t.section_bg_color ?? t.secondary_bg_color ?? DEFAULT_THEME.surfaceMuted,
  };
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light'): void {
  const w = wa();
  const hf = w?.HapticFeedback;
  if (!hf) return;
  try {
    if (kind === 'success' || kind === 'error' || kind === 'warning') {
      hf.notificationOccurred(kind);
    } else {
      hf.impactOccurred(kind);
    }
  } catch {
    /* ignore */
  }
}

export function setBackButton(onClick: (() => void) | null): void {
  const w = wa();
  if (!w?.BackButton) return;
  try {
    if (onClick) {
      w.BackButton.onClick(onClick);
      w.BackButton.show();
    } else {
      w.BackButton.hide();
    }
  } catch {
    /* ignore */
  }
}

export function setMainButton(opts: {
  text: string;
  onClick?: () => void;
  show?: boolean;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
} | null): void {
  const w = wa();
  if (!w?.MainButton) return;
  try {
    if (!opts || opts.show === false) {
      w.MainButton.hide();
      return;
    }
    w.MainButton.setText(opts.text);
    if (opts.color) w.MainButton.color = opts.color;
    if (opts.disabled) w.MainButton.disable();
    else w.MainButton.enable();
    if (opts.loading) w.MainButton.showProgress(false);
    else w.MainButton.hideProgress();
    if (opts.onClick) {
      w.MainButton.offClick(() => undefined);
      w.MainButton.onClick(opts.onClick);
    }
    w.MainButton.show();
  } catch {
    /* ignore */
  }
}

export function openLink(url: string): void {
  const w = wa();
  if (w?.openLink) w.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e as Error);
    }
  });
}
