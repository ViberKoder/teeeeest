import { cfg, endpoints } from '../config';
import { haptic, shareLink } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Copy } from '../ui/Icons';
import { Page } from '../ui/native';
import { QR } from '../ui/QR';
import { useToast } from '../ui/toast';

export function ReceivePage({ onClose }: { onClose: () => void }) {
  const { provider } = useWallet();
  const toast = useToast();
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  return (
    <Page title="Receive" onBack={onClose}>
      <p className="hint center" style={{ padding: '4px 24px 16px', fontSize: 16 }}>Share your address or this QR code to receive EGG.</p>
      <div className="qr-card">
        <QR value={`ton://transfer/${addr}`} />
        <div className="addr" style={{ fontSize: 13, opacity: 0.8 }}>{addr}</div>
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}>
          <Copy width={20} height={20} /> Copy my address
        </button>
        <button className="btn soft" onClick={() => shareLink(`${endpoints.explorer}/${addr}`, `My EGG wallet address: ${addr}`)}>Share in Telegram</button>
      </div>
      <p className="hint center" style={{ marginTop: 16 }}>Only send EGG and TON to this address, on the TON network.</p>
    </Page>
  );
}
