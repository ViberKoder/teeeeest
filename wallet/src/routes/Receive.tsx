import { Screen, Card, Button, useToast, Toast } from '../ui/components';
import { loadVault } from '../state/vault';
import { copyToClipboard, haptic } from '../services/tma';

export function Receive() {
  const vault = loadVault();
  const [toast, setToast, hideToast] = useToast();
  if (!vault) return null;

  function copy() {
    void copyToClipboard(vault!.account.address);
    haptic('light');
    setToast('Address copied');
  }

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    `ton://transfer/${vault.account.address}`,
  )}`;

  return (
    <Screen back="/home">
      <h1 className="title">Receive</h1>
      <p className="subtitle">Share your address or QR to receive TON and jettons on the {vault.account.network}.</p>
      <Card>
        <div className="qr-wrap">
          <img src={qrSrc} alt="QR" width={240} height={240} />
        </div>
        <div className="code" style={{ textAlign: 'center' }}>{vault.account.address}</div>
        <Button full onClick={copy}>Copy address</Button>
      </Card>
      <Toast message={toast} onDone={hideToast} />
    </Screen>
  );
}
