import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { confirmNative, haptic, openExternal, shareLink, tgUserId } from '../lib/tg';
import { NeedTonError } from '../provider/tg';
import { useWallet } from '../state/wallet';
import { Copy, External, Gift, Info, Key, Lock, Users } from '../ui/Icons';
import { Egg } from '../ui/Egg';
import { EggCoin } from '../ui/EggCoin';
import { useNav } from '../state/nav';
import { MainButton, Page, Row, Section } from '../ui/native';
import { useToast } from '../ui/toast';

type View = 'main' | 'phrase' | 'custody-info' | 'custody-words' | 'custody-run' | 'custody-done';
/** an iOS-settings style coloured square icon */
const ic = (n: React.ReactNode, c: string) => <span className="sq-ic" style={{ background: c }}>{n}</span>;
const C = { blue: 'linear-gradient(150deg,#58b9ff,#2a7de1)', green: 'linear-gradient(150deg,#6fdc8c,#2fae5b)', gold: 'linear-gradient(150deg,#ffd35a,#f0a012)', red: 'linear-gradient(150deg,#ff8a7a,#e5483a)', gray: 'linear-gradient(150deg,#a9b0bb,#7c8491)', purple: 'linear-gradient(150deg,#c79bff,#7a4fe8)', teal: 'linear-gradient(150deg,#5ad6c0,#1f9d86)' };

const Words = ({ words, blur }: { words: string[]; blur?: boolean }) => (
  <div className="words" style={{ filter: blur ? 'blur(9px)' : 'none', transition: 'filter .25s' }}>
    {words.map((x, i) => (<div className="word" key={i}><i>{i + 1}</i>{x}</div>))}
  </div>
);

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const nav = useNav();
  const toast = useToast();
  const [view, setView] = useState<View>('main');
  const [shown, setShown] = useState<string[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { provider } = w;
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });

  const showPhrase = async () => {
    if (!(await confirmNative('Anyone who sees your Secret Phrase can take everything in this wallet. Show it now?'))) return;
    setShown(w.secretPhrase());
    setReveal(false);
    setView('phrase');
  };

  const toggleBackup = async () => {
    haptic.select();
    if (w.backupOn && !(await confirmNative('Without a backup you will need your Secret Phrase in every new Telegram session. Turn the backup off?'))) return;
    await w.setBackup(!w.backupOn);
  };

  const startCustody = async () => {
    setFresh(await w.newPhrase());
    setReveal(false);
    setErr('');
    setView('custody-info');
  };

  const runCustody = async () => {
    setBusy(true);
    setErr('');
    setView('custody-run');
    try {
      await w.selfCustody(fresh);
      setView('custody-done');
    } catch (e) {
      haptic.error();
      setErr(
        e instanceof NeedTonError
          ? 'The wallet needs about 0.02 Gram to pay for the key change. Send a little Gram here, then try again.'
          : e instanceof Error && e.message === 'rotation-pending'
            ? 'The change was sent but is not confirmed yet. Your new phrase is saved on this device; open Settings again in a minute.'
            : 'The key could not be changed. Nothing was lost — try again.',
      );
      setView('custody-words');
    } finally {
      setBusy(false);
    }
  };

  // ---------- Secret Phrase ----------
  if (view === 'phrase')
    return (
      <Page title="Secret Phrase" onBack={() => { setShown(null); setView('main'); }}>
        <p className="hint" style={{ padding: '4px 4px 14px', fontSize: 15 }}>Your Secret Phrase is the key to back up your wallet. Keep it secret and secure at all times.</p>
        <div style={{ position: 'relative' }}>
          {shown && <Words words={shown} blur={!reveal} />}
          {!reveal && <button className="btn soft" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'auto', padding: '0 22px' }} onClick={() => { haptic.tap(); setReveal(true); }}>Tap to reveal</button>}
        </div>
        <div className="warn" style={{ marginTop: 18 }}>
          <b>Never share</b> your Secret Phrase with anyone. If someone has it, they can steal your funds. Telegram Support will never ask you for it.
        </div>
        {reveal && shown && <button className="btn soft" style={{ marginTop: 14 }} onClick={() => { void navigator.clipboard?.writeText(shown.join(' ')); haptic.success(); toast('Phrase copied'); }}><Copy width={18} height={18} /> Copy</button>}
      </Page>
    );

  // ---------- Switch to self-custody ----------
  if (view === 'custody-info')
    return (
      <Page title="Self-custody" onBack={() => setView('main')} bottomSpace>
        <div className="center" style={{ marginTop: 6 }}><div style={{ display: 'inline-block' }}><Egg size={84} float /></div></div>
        <div className="stack" style={{ gap: 4, marginTop: 8 }}>
          <div className="info-row"><span className="ic"><Key /></span><div><b>A new key, only yours</b><span>Your wallet keeps its address and balance but gets a new key. The new Secret Phrase is shown only to you.</span></div></div>
          <div className="info-row"><span className="ic"><Lock /></span><div><b>Telegram can’t restore it</b><span>The Telegram backup is erased. If you lose the new phrase, nobody can bring the wallet back.</span></div></div>
        </div>
        <MainButton text="Continue" onClick={() => setView('custody-words')} />
      </Page>
    );

  if (view === 'custody-words' || view === 'custody-run')
    return (
      <Page title="Your new phrase" onBack={view === 'custody-run' ? () => undefined : () => setView('custody-info')} bottomSpace>
        <p className="hint" style={{ padding: '4px 4px 14px', fontSize: 15 }}>Write these 24 words down in order and keep them offline. They are the only way to open your wallet from now on.</p>
        <div style={{ position: 'relative' }}>
          <Words words={fresh} blur={!reveal} />
          {!reveal && <button className="btn soft" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'auto', padding: '0 22px' }} onClick={() => { haptic.tap(); setReveal(true); }}>Tap to reveal</button>}
        </div>
        {err && <p className="hint bad" style={{ marginTop: 14 }}>{err}</p>}
        <MainButton text="I saved it — switch" enabled={reveal} loading={busy} onClick={runCustody} />
      </Page>
    );

  if (view === 'custody-done')
    return (
      <Page onBack={onClose} bottomSpace>
        <div className="stack center" style={{ alignItems: 'center', gap: 14, paddingTop: 48 }}>
          <div className="row-icon icon-in" style={{ width: 88, height: 88 }}><Lock width={40} height={40} /></div>
          <h2 style={{ margin: 0, fontSize: 26 }}>You hold the key</h2>
          <p className="hint" style={{ fontSize: 16, maxWidth: 320 }}>The wallet now uses your new key. The Telegram backup is gone — your phrase is the only way back in.</p>
        </div>
        <MainButton text="Done" onClick={onClose} />
      </Page>
    );

  // ---------- main ----------
  return (
    <Page title="Settings" onBack={onClose}>
      <section className="profile-card">
        <EggCoin size={78} float />
        <h2>{w.masterAddress ? 'Egg wallet' : 'Wallet'}</h2>
        <button className="addr-chip num" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}>{addr.slice(0, 6)}…{addr.slice(-6)}<Copy width={14} height={14} /></button>
        <div className="profile-actions">
          <button onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}><Copy width={19} height={19} />Copy</button>
          <button onClick={() => openExternal(`${endpoints.explorer}/${addr}`)}><External width={19} height={19} />Explorer</button>
        </div>
      </section>

      <Section title="Egg">
        <Row onClick={() => shareLink(`https://t.me/${cfg.bot}?start=ref_${tgUserId()}`, 'Hatch eggs with me and earn EGG 🥚')} icon={ic(<Users width={18} height={18} />, C.purple)} title="Invite friends" subtitle={`Earn a share of what they hatch`} />
        <Row onClick={() => nav.open({ k: 'intro' })} icon={ic(<Info width={18} height={18} />, C.blue)} title="How it works" />
        <Row onClick={() => location.assign('/explorer/')} icon={ic(<Gift width={18} height={18} />, C.gold)} title="Project explorer" subtitle="Live numbers, checkable against the blockchain" />
        {w.data.me?.is_admin && <Row onClick={() => location.assign('/admin/')} icon={ic(<Key width={18} height={18} />, C.gray)} title="Admin panel" subtitle="Token, game settings, posts, players" />}
      </Section>

      <Section
        title="Security"
        footer={w.backupOn
          ? 'Your wallet is backed up to your Telegram account, so it opens on every device where you are signed in.'
          : 'Backup is off. You will need your Secret Phrase in every new Telegram session.'}
      >
        <Row title="Encrypted Backup" subtitle="Stored with your Telegram account" icon={ic(<Lock width={18} height={18} />, C.green)} trailing={<button className={`switch ${w.backupOn ? 'on' : ''}`} onClick={toggleBackup} aria-label="Encrypted backup" aria-pressed={w.backupOn} />} />
        <Row onClick={showPhrase} icon={ic(<Key width={18} height={18} />, C.gold)} title="Show Secret Phrase" />
      </Section>

      <Section title="Advanced" footer="Switch to self-custody if you do not want Telegram to be able to restore this wallet.">
        <Row onClick={startCustody} icon={ic(<Lock width={18} height={18} />, C.red)} title="Switch to self-custody" />
      </Section>
      <p className="hint center" style={{ marginTop: 22 }}>Egg Wallet · {cfg.network}</p>
    </Page>
  );
}
