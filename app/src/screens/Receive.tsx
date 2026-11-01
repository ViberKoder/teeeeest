import { cfg } from '../config';
import { haptic } from '../lib/tg';
import { useWallet } from '../state/wallet';
import { Copy } from '../ui/Icons';
import { QR } from '../ui/QR';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';

export function ReceiveSheet({ onClose }: { onClose: () => void }) {
  const { provider } = useWallet();
  const toast = useToast();
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  return (
    <Sheet onClose={onClose} title="Receive">
      <div className="stack" style={{ alignItems: 'center', gap: 18 }}>
        <QR value={`ton://transfer/${addr}`} />
        <div className="addr">{addr}</div>
        <button className="btn soft" onClick={() => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); }}>
          <Copy /> Copy address
        </button>
        <p className="hint center">Only send TON and EGG to this address, on the TON network.</p>
      </div>
    </Sheet>
  );
}
