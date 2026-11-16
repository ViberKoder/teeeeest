import { useState } from 'react';
import { api, apiErrorText, EarnReply } from '../api/server';
import { haptic } from '../lib/tg';
import { useNav } from '../state/nav';
import { BOOST_META, BoostIcon, boostFill, boostState } from '../ui/Boosts';
import { EggCoin } from '../ui/EggCoin';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';

/** Boosts: the percentages added to everything you hatch, what switches each one on, and the one you can start now. */
export function BoostsSheet({ onClose, earn, onChange }: { onClose: () => void; earn: EarnReply | null; onChange: (e: EarnReply) => void }) {
  const toast = useToast();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const warm = async () => {
    setBusy(true);
    try { onChange(await api.earn({ action: 'boost', id: 'warmup' })); haptic.success(); toast('Warm-up is on: x2 for an hour'); }
    catch (e) { haptic.error(); toast(apiErrorText(e)); } finally { setBusy(false); }
  };
  const now = Date.now() / 1000;
  return (
    <Sheet onClose={onClose} title="Boosts" tall>
      <div className="boost-hero">
        <EggCoin size={74} tone="gold" spark float />
        <div className="bh-num num">+{earn?.bonusPct ?? 0}%</div>
        <p>added to every egg you hatch</p>
      </div>
      <div className="stack-12">
        {(earn?.boosts ?? []).map((b) => {
          const m = BOOST_META[b.id];
          const st = boostState(b, now);
          const fill = boostFill(b);
          return (
            <div key={b.id} className="boost-card">
              <BoostIcon id={b.id} />
              <div className="bc-main">
                <div className="bc-t"><b>{m.title}</b><span className={`pill ${st.tone}`}>{st.label}</span></div>
                <p>{m.blurb(b)}</p>
                {fill !== null && <div className="pbar"><i style={{ width: `${Math.round(fill * 100)}%` }} /></div>}
                {b.id === 'warmup' && b.ready && <button className="btn-main sm" disabled={busy} onClick={() => void warm()}>{busy ? '…' : 'Warm up now'}</button>}
                {b.id === 'squad' && !b.joined && <button className="btn-soft sm" onClick={() => { onClose(); nav.setTab('squads'); }}>Find a squad</button>}
                {b.id === 'brood' && <button className="btn-soft sm" onClick={() => { onClose(); nav.setTab('friends'); }}>Invite friends</button>}
              </div>
            </div>
          );
        })}
        {!earn && <div className="empty-mini">Boosts work inside Telegram.</div>}
      </div>
      <p className="foot-note">Boosts add to what hatching pays. Your daily limit still applies.</p>
    </Sheet>
  );
}
