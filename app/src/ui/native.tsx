import { ReactNode, useEffect, useRef } from 'react';
import { tg } from '../lib/tg';
import { Back } from './Icons';

/**
 * Telegram-native chrome. Inside Telegram the primary action is the platform's own MainButton and
 * navigation is its BackButton; in a plain browser the same controls render in-page.
 */

export function MainButton({
  text,
  onClick,
  enabled = true,
  loading = false,
  tone = 'accent',
}: {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  loading?: boolean;
  tone?: 'accent' | 'danger';
}) {
  const cb = useRef(onClick);
  cb.current = onClick;
  const native = tg?.MainButton;

  useEffect(() => {
    if (!native) return;
    const handler = () => cb.current();
    native.onClick(handler);
    return () => {
      native.offClick(handler);
      native.hideProgress();
      native.hide();
    };
  }, [native]);

  useEffect(() => {
    if (!native) return;
    native.setParams({
      text,
      is_visible: true,
      is_active: enabled && !loading,
      ...(tone === 'danger' ? { color: '#ff3b30', text_color: '#ffffff' } : {}),
    });
    if (loading) native.showProgress(false);
    else native.hideProgress();
  }, [native, text, enabled, loading, tone]);

  if (native) return null;
  return (
    <div className="mainbar">
      <button className={`mainbtn ${tone}`} disabled={!enabled || loading} onClick={onClick}>
        {loading ? <span className="spinner" /> : text}
      </button>
    </div>
  );
}

/** Full-screen page with the native back button. */
export function Page({ title, onBack, children, bottomSpace }: { title?: string; onBack: () => void; children: ReactNode; bottomSpace?: boolean }) {
  const cb = useRef(onBack);
  cb.current = onBack;
  const native = tg?.BackButton;

  useEffect(() => {
    if (!native) return;
    const handler = () => cb.current();
    native.show();
    native.onClick(handler);
    return () => {
      native.offClick(handler);
      native.hide();
    };
  }, [native]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="page" role="dialog" aria-modal aria-label={title}>
      {!native && (
        <div className="page-head">
          <button className="page-back" onClick={onBack} aria-label="Back"><Back /></button>
          <div className="page-title">{title}</div>
          <span className="page-back" />
        </div>
      )}
      <div className={`page-body ${bottomSpace ? 'with-main' : ''}`}>
        {native && title && <h1 className="page-h">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

/** iOS-style grouped section. */
export function Section({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {title && <div className="section-title">{title}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  tone,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  tone?: 'danger';
}) {
  const body = (
    <>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {trailing && <span className="row-trail">{trailing}</span>}
    </>
  );
  return onClick ? (
    <button className={`row ${tone ?? ''}`} onClick={onClick}>{body}</button>
  ) : (
    <div className={`row ${tone ?? ''}`}>{body}</div>
  );
}
