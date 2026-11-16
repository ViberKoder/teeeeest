import { useState } from 'react';
import { cfg, endpoints } from '../config';
import { haptic, shareLink } from '../lib/tg';
import { Asset } from '../state/nav';
import { useWallet } from '../state/wallet';
import { EggCoin } from '../ui/EggCoin';
import { GramCoin } from '../ui/Gram';
import { Copy, Share } from '../ui/Icons';
import { QR } from '../ui/QR';
import { Sheet } from '../ui/Sheet';
import { useToast } from '../ui/toast';

/** Receive: one address for everything. The code carries the egg (or the diamond), so people know what they are scanning. */
export function ReceiveSheet({ onClose, asset: start }: { onClose: () => void; asset?: Asset }) {
  const { provider, masterAddress } = useWallet();
  const toast = useToast();
  const [asset, setAsset] = useState<Asset>(start ?? (masterAddress ? 'EGG' : 'Gram'));
  if (!provider) return null;
  const addr = provider.address.toString({ bounceable: false, testOnly: cfg.network === 'testnet' });
  const copy = () => { void navigator.clipboard?.writeText(addr); haptic.success(); toast('Address copied'); };
  const half = Math.ceil(addr.length / 2);
  return (
    <Sheet onClose={onClose} title="Receive" tall footer={
      <div className="foot-duo">
        <button className="btn-soft" onClick={() => shareLink(`${endpoints.explorer}/${addr}`, `My wallet address: ${addr}`)}><Share width={20} height={20} />Share</button>
        <button className="btn-main" onClick={copy}><Copy width={20} height={20} />Copy address</button>
      </div>
    }>
      {masterAddress && (
        <div className="asset-seg" role="tablist">
          {(['EGG', 'Gram'] as Asset[]).map((a) => (
            <button key={a} className={asset === a ? 'on' : ''} onClick={() => { setAsset(a); haptic.select(); }}>{a === 'EGG' ? <EggCoin size={22} /> : <GramCoin size={22} />}{a}</button>
          ))}
        </div>
      )}
      <div className={`recv-card ${asset === 'EGG' ? 'egg' : 'gram'}`}>
        <p className="recv-hint">Scan to send {asset} to this wallet</p>
        <QR value={`ton://transfer/${addr}`} logo={asset === 'EGG' ? <EggCoin size={46} /> : <GramCoin size={46} />} />
        <button className="recv-addr num" onClick={copy} aria-label="Copy address"><span>{addr.slice(0, half)}</span><span>{addr.slice(half)}</span></button>
      </div>
      <p className="foot-note">Only send EGG and Gram to this address, on the TON network. Anything else may be lost.</p>
    </Sheet>
  );
}
