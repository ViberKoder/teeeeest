import { useMemo, useState } from 'react';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Egg } from '../ui/Egg';
import { Link as LinkIcon } from '../ui/Icons';
import { MainButton, Page } from '../ui/native';
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

  return (
    <>
      <div className="screen">
        <div className="grow stack center" style={{ justifyContent: 'center', alignItems: 'center', gap: 22 }}>
          <Egg size={140} float />
          <div className="stack" style={{ gap: 10, alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.02em' }}>Your eggs.<br />Your keys.</h1>
            <p className="hint" style={{ fontSize: 16, maxWidth: 320 }}>
              A self-custody wallet inside Telegram. What you hatch is verified by the blockchain itself — nobody can take it back.
            </p>
          </div>
        </div>
        <div className="stack">
          <button className="btn" onClick={start} disabled={busy}>{busy ? <span className="spinner" /> : 'Create wallet'}</button>
          <button className="btn soft" onClick={() => setStep('import')}>I already have a wallet</button>
          <button className="btn link" onClick={w.useExternal}><LinkIcon width={18} height={18} /> Connect Telegram Wallet or another</button>
        </div>
      </div>

      {step === 'phrase' && <Phrase words={words} onBack={() => setStep('welcome')} onNext={() => setStep('verify')} />}
      {step === 'verify' && <Verify words={words} onBack={() => setStep('phrase')} onNext={() => setStep('pin')} />}
      {step === 'import' && <Import onBack={() => setStep('welcome')} onValid={(ws) => { setWords(ws); setStep('pin'); }} />}
      {step === 'pin' && <SetPin words={words} onBack={() => setStep('welcome')} />}
    </>
  );
}

function Phrase({ words, onBack, onNext }: { words: string[]; onBack: () => void; onNext: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <Page title="Secret phrase" onBack={onBack} bottomSpace>
      <p className="hint" style={{ padding: '4px 4px 14px', fontSize: 15 }}>
        These 24 words are the only way to restore your wallet. Write them down and keep them offline. Anyone with them owns your eggs.
      </p>
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
      <MainButton text="I wrote it down" enabled={shown} onClick={onNext} />
    </Page>
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
    <Page title="Quick check" onBack={onBack} bottomSpace>
      <p className="hint" style={{ padding: '4px 4px 6px', fontSize: 15 }}>Type the words below to prove you saved the phrase.</p>
      <section className="section"><div className="group">
        {picks.map((p, i) => (
          <div className="field" key={p}>
            <label>Word #{p + 1}</label>
            <input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={vals[i]} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} />
          </div>
        ))}
      </div></section>
      <MainButton text="Continue" enabled={ok} onClick={onNext} />
    </Page>
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
    <Page title="Import wallet" onBack={onBack} bottomSpace>
      <p className="hint" style={{ padding: '4px 4px 10px', fontSize: 15 }}>Enter your 24-word recovery phrase, separated by spaces.</p>
      <section className="section" style={{ marginTop: 0 }}><div className="group">
        <textarea className="input" style={{ height: 130, padding: '12px 16px', resize: 'none', lineHeight: 1.5 }} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="word1 word2 word3 …" value={text} onChange={(e) => { setText(e.target.value); setBad(false); }} />
      </div></section>
      {bad && <p className="hint bad" style={{ padding: '8px 16px 0' }}>That phrase isn’t valid. Check for typos and the word count.</p>}
      <MainButton text="Continue" enabled={Boolean(text.trim())} onClick={submit} />
    </Page>
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
      return toast('Codes didn’t match — try again');
    }
    setBusy(true);
    await w.createWallet(words, pin);
  };

  return (
    <Page title={first ? 'Repeat the code' : 'Set a passcode'} onBack={onBack}>
      <p className="hint center" style={{ padding: '4px 12px 0', fontSize: 15 }}>
        It locks the wallet on this device and encrypts your phrase. It can’t be recovered — your 24 words can.
      </p>
      {busy ? (
        <div className="center" style={{ marginTop: 60 }}><span className="spinner" style={{ width: 30, height: 30 }} /><p className="hint" style={{ marginTop: 12 }}>Encrypting…</p></div>
      ) : (
        <PinPad onComplete={done} shake={shake} />
      )}
    </Page>
  );
}
