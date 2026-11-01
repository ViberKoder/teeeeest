import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

const Ctx = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ id: number; msg: string } | null>(null);
  const show = useCallback((msg: string) => setT({ id: Date.now(), msg }), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {t && <div key={t.id} className="toast" role="status" onAnimationEnd={() => setT(null)}>{t.msg}</div>}
    </Ctx.Provider>
  );
}
