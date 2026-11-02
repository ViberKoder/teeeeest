import { Egg } from '../ui/Egg';
import { Sparkle } from '../ui/Icons';
import { MainButton, Page } from '../ui/native';

const Shield = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const Gift = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v8h14v-8M8.5 8C6 8 6 4 9 4c2 0 3 4 3 4s1-4 3-4c3 0 3 4 .5 4" />
  </svg>
);

/** "How it works", the short intro Telegram's wallet shows. */
export function IntroPage({ onClose }: { onClose: () => void }) {
  return (
    <Page title="How It Works" onBack={onClose} bottomSpace>
      <div className="center" style={{ marginTop: 6 }}><div style={{ display: 'inline-block' }}><Egg size={92} float /></div></div>
      <div className="stack" style={{ gap: 4, marginTop: 8 }}>
        <div className="info-row"><span className="ic"><Sparkle /></span><div><b>Hatch EGG</b><span>Earn EGG in chats and games. Everything you earn is recorded in a public root on the blockchain.</span></div></div>
        <div className="info-row"><span className="ic"><Shield /></span><div><b>Blockchain Verified</b><span>The token contract itself checks every hatch. Nobody — not even us — can take back what is recorded.</span></div></div>
        <div className="info-row"><span className="ic"><Gift /></span><div><b>Free to Start</b><span>Your first hatches cost nothing: we cover the network fee. Your wallet is part of your Telegram account — no secret phrase to write down.</span></div></div>
      </div>
      <p className="hint center" style={{ marginTop: 18 }}>Want full control? Switch to self-custody any time in Settings → Keys &amp; Backup.</p>
      <MainButton text="Got it" onClick={onClose} />
    </Page>
  );
}
