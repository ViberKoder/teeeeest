import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Copy, External, Key, Link as LinkIcon, Lock, Trash } from '../ui/Icons';
import { MainButton, Page, Row, Section } from '../ui/native';
import { PinPad } from '../ui/PinPad';
import { useToast } from '../ui/toast';

type View = 'main' | 'pin' | 'phrase' | 'confirmDelete';
const ic = (n: React.ReactNode, c = 'icon-soft') => <span className={`row-icon ${c}`}>{n}</span>;

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const toast = useToast();
  const [view, setView] = useState<View>('main');
  const [words, setWords] = useState<string[]>([]);
  const [shake, setShake] = useState(0);
  const { provider } = w;
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const builtin = provider.kind === 'builtin';

  if (view === 'pin')
    return (
      <Page title="Enter passcode" onBack={() => setView('main')}>
        <PinPad
          shake={shake}
          onComplete={async (pin) => {
            const ws = await w.revealPhrase(pin);
            if (ws) { setWords(ws); setView('phrase'); } else { haptic.error(); setShake((s) => s + 1); }
          }}
        />
      </Page>
    );

  if (view === 'phrase')
    return (
      <Page title="Recovery phrase" onBack={() => { setWords([]); setView('main'); }}>
        <div className="words" style={{ marginTop: 10 }}>{words.map((x, i) => (<div className="word" key={i}><i>{i + 1}</i>{x}</div>))}</div>
        <p className="hint" style={{ padding: '14px 4px' }}>Never share these words. Nobody from Telegram or this app will ever ask for them.</p>
      </Page>
    );

  if (view === 'confirmDelete')
    return (
      <Page title={builtin ? 'Erase wallet?' : 'Disconnect?'} onBack={() => setView('main')} bottomSpace>
        <p className="hint center" style={{ fontSize: 16, padding: '24px 8px' }}>
          {builtin ? 'This erases the wallet from this device. Without your 24 words, the funds are gone for good.' : 'This disconnects the wallet from the app. Your funds stay where they are.'}
        </p>
        <MainButton tone="danger" text={builtin ? 'Erase wallet' : 'Disconnect'} onClick={() => { void w.signOut(); onClose(); }} />
      </Page>
    );

  return (
    <Page title="Settings" onBack={onClose}>
      <Section title={builtin ? 'Self-custody wallet' : 'Connected via TON Connect'} footer="Your keys never leave this device. EGG balances are verified by the token contract on the blockchain.">
        <div className="addr" style={{ padding: '14px 16px' }}>{addr}</div>
      </Section>
      <Section>
        <Row onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }} icon={ic(<Copy width={18} height={18} />)} title="Copy address" />
        <Row onClick={() => openExternal(`${endpoints.explorer}/${addr}`)} icon={ic(<External width={18} height={18} />)} title="View in explorer" />
        {builtin && <Row onClick={() => setView('pin')} icon={ic(<Key width={18} height={18} />)} title="Show recovery phrase" />}
        {builtin && <Row onClick={() => { w.lock(); onClose(); }} icon={ic(<Lock width={18} height={18} />)} title="Lock now" />}
        {!builtin && <Row onClick={w.useExternal} icon={ic(<LinkIcon width={18} height={18} />)} title="Switch wallet" />}
      </Section>
      <Section>
        <Row tone="danger" onClick={() => setView('confirmDelete')} icon={ic(<Trash width={18} height={18} />, 'icon-out')} title={builtin ? 'Erase wallet' : 'Disconnect'} />
      </Section>
      <p className="hint center" style={{ marginTop: 22 }}>EGG Wallet · {cfg.network}</p>
    </Page>
  );
}
