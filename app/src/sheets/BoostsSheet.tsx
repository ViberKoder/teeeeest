import type { EarnReply } from '../api/server';
import { useNav } from '../state/nav';
import { BoostIcon, Pips } from '../ui/Boosts';
import { EggCoin } from '../ui/EggCoin';
import { Sheet } from '../ui/Sheet';

/** Boosts: permanent upgrades you earn (nothing is spent), what each gives now, and what the next level needs. */
export function BoostsSheet({ onClose, earn }: { onClose: () => void; earn: EarnReply | null }) {
  const nav = useNav();
  const total = (earn?.boosts ?? []).reduce((a, b) => a + b.level, 0);
  return (
    <Sheet onClose={onClose} title="Boosts" tall>
      <div className="boost-hero">
        <EggCoin size={74} tone="gold" spark float />
        <div className="bh-num num">Lv {total}</div>
        <p>Boosts are earned, never bought: nothing is spent</p>
      </div>
      <div className="stack-12">
        {(earn?.boosts ?? []).map((b) => {
          const maxed = b.level >= b.max;
          return (
            <div key={b.id} className="boost-card">
              <BoostIcon b={b} />
              <div className="bc-main">
                <div className="bc-t"><b>{b.title}</b><span className={`pill ${b.level > 0 ? 'on' : ''}`}>Level {b.level}/{b.max}</span></div>
                <p>{b.desc}</p>
                <Pips level={b.level} max={b.max} />
                <p className="bc-eff"><b>{b.level > 0 ? b.effect : 'Not active yet'}</b></p>
                {!maxed && (
                  <>
                    <div className="pbar"><i style={{ width: `${Math.min(100, (b.have / b.need) * 100)}%` }} /></div>
                    <small className="muted num">{b.have} / {b.need} {b.unit} for {b.nextEffect}</small>
                  </>
                )}
                {!maxed && b.id === 'rack' && <button className="btn-soft sm" onClick={() => { onClose(); nav.setTab('friends'); }}>Invite friends</button>}
                {!maxed && b.id === 'nest' && <button className="btn-soft sm" onClick={() => { onClose(); nav.setTab('earn'); }}>Check in daily</button>}
              </div>
            </div>
          );
        })}
        {!earn && <div className="empty-mini">Boosts work inside Telegram.</div>}
      </div>
    </Sheet>
  );
}
