import { createContext, useContext } from 'react';
import type { Activity } from '../chain/history';
import type { Tab } from '../ui/TabBar';

export type Asset = 'EGG' | 'Gram';
export type Overlay =
  | null
  | { k: 'send'; asset?: Asset; to?: string; amount?: string }
  | { k: 'receive'; asset?: Asset }
  | { k: 'swap' }
  | { k: 'tx'; a: Activity }
  | { k: 'boosts' }
  | { k: 'settings' }
  | { k: 'intro' }
  | { k: 'map' };

export interface Nav {
  tab: Tab;
  setTab: (t: Tab) => void;
  open: (o: Exclude<Overlay, null>) => void;
  close: () => void;
  /** a squad invitation the app was opened with (t.me/<bot>?startapp=squad_<id>) */
  joinId: number | null;
  /** something was earned: the 3D egg bursts */
  celebrate: () => void;
}

export const NavCtx = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx missing');
  return n;
};
