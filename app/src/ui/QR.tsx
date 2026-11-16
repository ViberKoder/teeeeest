import QRCode from 'qrcode';
import { ReactNode, useEffect, useState } from 'react';

/** A QR code on a white tile; `logo` sits in the middle (the code uses the highest error correction so it still scans). */
export function QR({ value, logo }: { value: string; logo?: ReactNode }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    void QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: logo ? 'H' : 'M', color: { dark: '#16210f', light: '#0000' } }).then(setSvg);
  }, [value, logo]);
  return (
    <div className="qr">
      <div className="qr-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      {logo && <span className="qr-logo">{logo}</span>}
    </div>
  );
}
