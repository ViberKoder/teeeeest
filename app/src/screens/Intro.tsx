import { Egg3D } from '../ui/Egg3D';
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
      <div style={{ position: 'relative', height: 190, marginTop: 0 }}><Egg3D energy={0.5} /></div>
      <div className="stack" style={{ gap: 4, marginTop: 8 }}>
        <div className="info-row"><span className="ic"><Sparkle /></span><div><b>Hatch EGG</b><span>Tap Hatch on eggs in chats and channels, play, invite friends. Every hatch is +1 EGG.</span></div></div>
        <div className="info-row"><span className="ic"><Shield /></span><div><b>Proven on-chain</b><span>Your balance is sealed in a public Merkle root and enforced by the token contract. Nobody, not even us, can take back what is recorded.</span></div></div>
        <div className="info-row"><span className="ic"><Gift /></span><div><b>Yours, in Telegram</b><span>Your wallet is tied to your Telegram account, with no seed phrase to lose. Claim and send EGG in a couple of taps.</span></div></div>
      </div>
      <p className="hint center" style={{ marginTop: 18 }}>Want full control? Switch to self-custody any time in Settings → Keys &amp; Backup.</p>
      <MainButton text="Got it" onClick={onClose} />
    </Page>
  );
}
