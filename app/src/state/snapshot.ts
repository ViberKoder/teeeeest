import { Address } from '@ton/core';
import type { Me } from '../api/server';
import type { EggState } from '../chain/egg';

/** The last known numbers, kept on the device so the wallet shows something real the moment it opens. */
export interface Snap {
  ton: bigint;
  egg: EggState | null;
  me: Me | null;
}

const key = (raw: string) => `egg.snap.v1:${raw}`;

export function saveSnap(raw: string, s: Snap) {
  try {
    localStorage.setItem(key(raw), JSON.stringify({
      ton: s.ton.toString(),
      egg: s.egg && { ...s.egg, jettonWallet: s.egg.jettonWallet.toRawString(), balance: s.egg.balance.toString(), claimed: s.egg.claimed.toString() },
      me: s.me,
    }));
  } catch {
    /* private mode */
  }
}

export function loadSnap(raw: string): Snap | null {
  try {
    const j = JSON.parse(localStorage.getItem(key(raw)) ?? 'null');
    if (!j) return null;
    return {
      ton: BigInt(j.ton),
      egg: j.egg && { ...j.egg, jettonWallet: Address.parseRaw(j.egg.jettonWallet), balance: BigInt(j.egg.balance), claimed: BigInt(j.egg.claimed) },
      me: j.me ?? null,
    };
  } catch {
    return null;
  }
}
