import { Egg3D } from '../ui/Egg3D';
import { Bolt, ShieldIc, Users } from '../ui/Icons';
import { MainButton, Page } from '../ui/native';

/** "How it works": three short cards. */
export function IntroPage({ onClose }: { onClose: () => void }) {
  return (
    <Page title="How it works" onBack={onClose} bottomSpace>
      <div className="intro-egg"><Egg3D energy={0.5} /></div>
      <div className="intro-list">
        <div className="intro-card"><span className="ic" style={{ background: 'linear-gradient(150deg,#ffd84d,#f0a312)' }}><Bolt width={22} height={22} /></span><div><b>Earn eggs</b><span>Hatch eggs in chats and under posts, check in every day, finish tasks, join a squad and invite friends. Boosts make every egg pay more.</span></div></div>
        <div className="intro-card"><span className="ic" style={{ background: 'linear-gradient(150deg,#5ad6c0,#1f9d86)' }}><ShieldIc width={22} height={22} /></span><div><b>Always yours</b><span>Your eggs are sealed on the blockchain: nobody, not even us, can take back what is recorded. There is nothing to claim — your balance is simply your balance.</span></div></div>
        <div className="intro-card"><span className="ic" style={{ background: 'linear-gradient(150deg,#c79bff,#7a4fe8)' }}><Users width={22} height={22} /></span><div><b>Send to anyone</b><span>Send EGG and Gram to any Telegram @username or wallet address in a couple of taps. No seed phrase to lose.</span></div></div>
      </div>
      <p className="hint center" style={{ marginTop: 18 }}>Want full control? Switch to self-custody any time in Settings.</p>
      <MainButton text="Got it" onClick={onClose} />
    </Page>
  );
}
