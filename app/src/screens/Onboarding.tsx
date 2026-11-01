import { useMemo, useState } from 'react';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Egg } from '../ui/Egg';
import { Back, Link as LinkIcon } from '../ui/Icons';
import { PinPad } from '../ui/PinPad';
import { useToast } from '../ui/toast';

type Step = 'welcome' | 'phrase' | 'verify' | 'pin' | 'import';

export function Onboarding() {
  const w = useWallet();
  const [step, setStep] = useState<Step>('welcome');
  const [words, setWords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setWords(await w.newMnemonic());
    setBusy(false);
    setStep('phrase');
  };

  if (step === 'welcome')
    return (
      <div className="screen">
        <div className="grow stack center" style={{ justifyContent: 'center', alignItems: 'center', gap: 22 }}>
          <Egg size={150} float />
          <div className="stack" style={{ gap: 10 }}>
            <h1>Your eggs.<br />Your keys.</h1>
            <p className="muted" style={{ maxWidth: 300 }}>
              A self-custody wallet inside Telegram. Hatch EGG, hold it, send it — nobody can touch it but you.
            </p>
          </div>
        </div>
        <div className="stack">
          <button className="btn primary" onClick={start} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Create wallet'}
          </button>
          <button className="btn soft" onClick={() => setStep('import')}>I already have a wallet</button>
          <button className="btn ghost" onClick={w.useExternal}><LinkIcon width={18} height={18} /> Connect Telegram Wallet or another</button>
        </div>
      </div>
    );

  if (step === 'phrase') return <Phrase words={words} onBack={() => setStep('welcome')} onNext={() => setStep('verify')} />;
  if (step === 'verify') return <Verify words={words} onBack={() => setStep('phrase')} onNext={() => setStep('pin')} />;
  if (step === 'import')
    return <Import onBack={() => setStep('welcome')} onValid={(ws) => { setWords(ws); setStep('pin'); }} />;
  return <SetPin words={words} onBack={() => setStep('welcome')} />;
}

function Header({ onBack, title, sub }: { onBack: () => void; title: string; sub?: string }) {
  return (
    <>
      <div className="top"><button className="icon-btn" onClick={onBack} aria-label="Back"><Back /></button></div>
      <div className="stack" style={{ gap: 8, marginBottom: 18 }}>
        <h1 style={{ fontSize: 28 }}>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
    </>
  );
}

function Phrase({ words, onBack, onNext }: { words: string[]; onBack: () => void; onNext: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="screen">
      <Header onBack={onBack} title="Your secret phrase" sub="These 24 words are the only way to restore your wallet. Write them down and keep them offline. Anyone with them owns your eggs." />
      <div style={{ position: 'relative' }}>
        <div className="words" style={{ filter: shown ? 'none' : 'blur(9px)', transition: 'filter .3s' }}>
          {words.map((x, i) => (<div className="word" key={i}><i>{i + 1}</i>{x}</div>))}
        </div>
        {!shown && (
          <button className="btn soft" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'auto', padding: '0 22px' }} onClick={() => { haptic.tap(); setShown(true); }}>
            Tap to reveal
          </button>
        )}
      </div>
      <div className="grow" />
      <button className="btn primary" style={{ marginTop: 20 }} disabled={!shown} onClick={onNext}>I wrote it down</button>
    </div>
  );
}

function Verify({ words, onBack, onNext }: { words: string[]; onBack: () => void; onNext: () => void }) {
  const picks = useMemo(() => {
    const s = new Set<number>();
    while (s.size < 3) s.add(Math.floor(Math.random() * 24));
    return [...s].sort((a, b) => a - b);
  }, []);
  const [vals, setVals] = useState(['', '', '']);
  const ok = picks.every((p, i) => vals[i].trim().toLowerCase() === words[p]);
  return (
    <div className="screen">
      <Header onBack={onBack} title="Quick check" sub="Type the words below to prove you saved the phrase." />
      <div className="stack">
        {picks.map((p, i) => (
          <div className="field" key={p}>
            <label>Word #{p + 1}</label>
            <input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={vals[i]} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} />
          </div>
        ))}
      </div>
      <div className="grow" />
      <button className="btn primary" style={{ marginTop: 20 }} disabled={!ok} onClick={onNext}>Continue</button>
    </div>
  );
}

function Import({ onBack, onValid }: { onBack: () => void; onValid: (w: string[]) => void }) {
  const w = useWallet();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const submit = async () => {
    const ws = text.trim().toLowerCase().split(/\s+/);
    if (ws.length === 24 && (await w.validateMnemonic(ws))) onValid(ws);
    else {
      setBad(true);
      haptic.error();
    }
  };
  return (
    <div className="screen">
      <Header onBack={onBack} title="Import wallet" sub="Enter your 24-word recovery phrase, separated by spaces." />
      <textarea className={`input ${bad ? 'err' : ''}`} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="word1 word2 word3 …" value={text} onChange={(e) => { setText(e.target.value); setBad(false); }} />
      {bad && <p className="hint bad" style={{ marginTop: 8 }}>That phrase isn't valid. Check for typos and the word count.</p>}
      <div className="grow" />
      <button className="btn primary" style={{ marginTop: 20 }} disabled={!text.trim()} onClick={submit}>Continue</button>
    </div>
  );
}

function SetPin({ words, onBack }: { words: string[]; onBack: () => void }) {
  const w = useWallet();
  const toast = useToast();
  const [first, setFirst] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  const done = async (pin: string) => {
    if (!first) return setFirst(pin);
    if (pin !== first) {
      haptic.error();
      setFirst(null);
      setShake((s) => s + 1);
      return toast("Codes didn't match — try again");
    }
    setBusy(true);
    await w.createWallet(words, pin);
  };

  return (
    <div className="screen">
      <Header onBack={onBack} title={first ? 'Repeat the code' : 'Set a passcode'} sub="It locks the wallet on this device and encrypts your phrase. It can't be recovered — your 24 words can." />
      <div className="grow" />
      {busy ? <div className="center"><span className="spinner" style={{ width: 32, height: 32 }} /><p className="muted" style={{ marginTop: 12 }}>Encrypting…</p></div> : <PinPad onComplete={done} shake={shake} />}
      <div style={{ height: 16 }} />
    </div>
  );
}
