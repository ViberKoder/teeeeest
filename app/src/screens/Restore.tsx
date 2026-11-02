import { useState } from 'react';
import { shortAddr } from '../lib/format';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Egg } from '../ui/Egg';
import { MainButton } from '../ui/native';

/** Only shown when this account's wallet has no Telegram backup and this session does not have the key. */
export function Restore() {
  const w = useWallet();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    const ok = await w.restore(text.trim().toLowerCase().split(/\s+/));
    setBusy(false);
    if (!ok) {
      setBad(true);
      haptic.error();
    }
  };

  return (
    <div className="screen">
      <div className="stack center" style={{ alignItems: 'center', gap: 10, marginTop: 20 }}>
        <Egg size={84} float />
        <h2 style={{ margin: 0, fontSize: 24 }}>Enter your Secret Phrase</h2>
        <p className="hint" style={{ maxWidth: 320, fontSize: 15 }}>
          You turned the backup off for this wallet{w.marker ? ` (${shortAddr(w.marker.address.replace(/^0:/, ''), 5, 4)})` : ''}, so you have to enter its 24-word Secret Phrase in every new Telegram session.
        </p>
      </div>
      <section className="section"><div className="group">
        <textarea className="input" style={{ height: 130, padding: '12px 16px', resize: 'none', lineHeight: 1.5 }} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="word1 word2 word3 …" value={text} onChange={(e) => { setText(e.target.value); setBad(false); }} />
      </div></section>
      {bad && <p className="hint bad" style={{ padding: '8px 16px 0' }}>The words you entered don’t match the wallet. Check the order and try again.</p>}
      <MainButton text="Continue" enabled={Boolean(text.trim())} loading={busy} onClick={go} />
    </div>
  );
}
