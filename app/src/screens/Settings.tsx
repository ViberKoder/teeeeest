import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { haptic, openExternal } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Copy, External, Key, Link as LinkIcon, Lock, Trash } from '../ui/Icons';
import { PinPad } from '../ui/PinPad';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';

type View = 'main' | 'pin' | 'phrase' | 'confirmDelete';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
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
      <Sheet onClose={() => setView('main')} title="Enter passcode">
        <PinPad
          shake={shake}
          onComplete={async (pin) => {
            const ws = await w.revealPhrase(pin);
            if (ws) { setWords(ws); setView('phrase'); } else { haptic.error(); setShake((s) => s + 1); }
          }}
        />
      </Sheet>
    );

  if (view === 'phrase')
    return (
      <Sheet onClose={onClose} title="Recovery phrase">
        <div className="stack">
          <div className="words">{words.map((x, i) => (<div className="word" key={i}><i>{i + 1}</i>{x}</div>))}</div>
          <p className="hint">Never share these words. Nobody from Telegram or this app will ever ask for them.</p>
          <button className="btn soft" onClick={() => { setWords([]); setView('main'); }}>Hide</button>
        </div>
      </Sheet>
    );

  if (view === 'confirmDelete')
    return (
      <Sheet onClose={() => setView('main')} title="Remove wallet?">
        <div className="stack">
          <p className="muted center">{builtin ? 'This erases the wallet from this device. Without your 24 words, the funds are gone for good.' : 'This disconnects the wallet from the app. Your funds stay where they are.'}</p>
          <button className="btn danger" onClick={() => { void w.signOut(); onClose(); }}>{builtin ? 'Erase wallet' : 'Disconnect'}</button>
          <button className="btn soft" onClick={() => setView('main')}>Cancel</button>
        </div>
      </Sheet>
    );

  return (
    <Sheet onClose={onClose} title="Settings">
      <div className="stack">
        <div className="card center stack" style={{ gap: 6 }}>
          <div className="tiny">{builtin ? 'Self-custody wallet · v5' : 'Connected via TON Connect'}</div>
          <div className="addr" style={{ fontSize: 12.5 }}>{addr}</div>
        </div>
        <div className="list">
          <button className="item" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}>
            <Copy /><span className="grow t">Copy address</span>
          </button>
          <button className="item" onClick={() => openExternal(`${endpoints.explorer}/${addr}`)}>
            <External /><span className="grow t">View in explorer</span>
          </button>
          {builtin && (
            <button className="item" onClick={() => setView('pin')}><Key /><span className="grow t">Show recovery phrase</span></button>
          )}
          {builtin && (
            <button className="item" onClick={() => { w.lock(); onClose(); }}><Lock /><span className="grow t">Lock now</span></button>
          )}
          {!builtin && (
            <button className="item" onClick={w.useExternal}><LinkIcon /><span className="grow t">Switch wallet</span></button>
          )}
          <button className="item" style={{ color: 'var(--bad)' }} onClick={() => setView('confirmDelete')}>
            <Trash /><span className="grow t">{builtin ? 'Erase wallet' : 'Disconnect'}</span>
          </button>
        </div>
        <p className="tiny center" style={{ marginTop: 6 }}>EGG Wallet · {cfg.network}</p>
      </div>
    </Sheet>
  );
}
