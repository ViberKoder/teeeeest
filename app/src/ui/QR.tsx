import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function QR({ value }: { value: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    void QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1d1208', light: '#0000' } }).then(setSvg);
  }, [value]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
