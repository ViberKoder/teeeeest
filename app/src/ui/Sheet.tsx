import { ReactNode, useEffect } from 'react';

export function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal aria-label={title}>
        <div className="grabber" />
        {title && <h2 style={{ marginBottom: 16 }} className="center">{title}</h2>}
        {children}
      </div>
    </>
  );
}
