import { type ReactNode, useEffect, useState } from 'react';
import { setBackButton } from '../services/tma';
import { useNavigate } from 'react-router-dom';

export function Screen({
  children,
  tight,
  back,
}: {
  children: ReactNode;
  tight?: boolean;
  back?: boolean | string;
}) {
  const nav = useNavigate();
  useEffect(() => {
    if (!back) return;
    const onBack = () =>
      typeof back === 'string' ? nav(back) : nav(-1);
    setBackButton(onBack);
    return () => setBackButton(null);
  }, [back, nav]);
  return <div className={tight ? 'screen screen-tight' : 'screen'}>{children}</div>;
}

export function Card({ children, tight, className }: { children: ReactNode; tight?: boolean; className?: string }) {
  return <div className={`card ${tight ? 'tight' : ''} ${className ?? ''}`.trim()}>{children}</div>;
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    full?: boolean;
  },
) {
  const { variant = 'primary', full, className, children, ...rest } = props;
  const cls = ['btn', variant === 'primary' ? '' : variant, full ? 'full' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label?: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <div className="subtitle">{hint}</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

export function Toast({ message, onDone }: { message: string; onDone?: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDone?.(), 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function useToast(): [string, (m: string) => void, () => void] {
  const [m, setM] = useState('');
  return [m, setM, () => setM('')];
}

export function RmjBadge({ children = 'RMJ' }: { children?: ReactNode }) {
  return <span className="rmj-badge">{children}</span>;
}

export function IconAvatar({ url, label }: { url?: string; label: string }) {
  return (
    <div className="icon">
      {url ? <img src={url} alt="" /> : <span>{(label || '?').slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>;
}

export function CopyableCode({ text }: { text: string }) {
  return (
    <div
      className="code"
      style={{
        background: 'var(--surface-2)',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid var(--border)',
      }}
    >
      {text}
    </div>
  );
}
