import { cfg } from '../config';
import { haptic } from '../lib/tg';
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
      <div className="stack" style={{ alignItems: 'center', gap: 18, marginTop: 16 }}>
        <QR value={`ton://transfer/${addr}`} />
        <div className="addr">{addr}</div>
        <button className="btn soft" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}>
          <Copy width={20} height={20} /> Copy address
        </button>
        <p className="hint center">Only send TON and EGG to this address, on the TON network.</p>
      </div>
    </Page>
  );
}
