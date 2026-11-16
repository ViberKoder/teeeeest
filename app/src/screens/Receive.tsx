import { cfg, endpoints } from '../config';
import { haptic, shareLink } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Copy } from '../ui/Icons';
import { EggMini } from '../ui/EggMini';
import { GramMark } from '../ui/Gram';
import { Page } from '../ui/native';
import { QR } from '../ui/QR';
import { useToast } from '../ui/toast';

export function ReceivePage({ onClose }: { onClose: () => void }) {
  const { provider } = useWallet();
  const toast = useToast();
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const copy = () => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); };
  return (
    <Page title="Receive" onBack={onClose}>
      <section className="recv-card">
        <div className="recv-assets"><span className="chip-a"><EggMini size={20} />EGG</span><span className="chip-a"><GramMark size={18} color="#fff" />Gram</span></div>
        <div className="qr-wrap">
          <QR value={`ton://transfer/${addr}`} />
          <span className="qr-egg"><EggMini size={34} /></span>
        </div>
        <button className="recv-addr num" onClick={copy}>{addr.slice(0, 4)}<span>{addr.slice(4, -4)}</span>{addr.slice(-4)}</button>
      </section>
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="bigbtn" onClick={copy}><Copy width={20} height={20} /> Copy address</button>
        <button className="bigbtn soft" onClick={() => shareLink(`${endpoints.explorer}/${addr}`, `My EGG wallet address: ${addr}`)}>Share in Telegram</button>
      </div>
      <p className="hint center" style={{ marginTop: 16 }}>Only send EGG and Gram to this address, on the Gram network.</p>
    </Page>
  );
}
