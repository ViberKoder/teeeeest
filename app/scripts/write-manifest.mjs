// Writes public/tonconnect-manifest.json for the origin the Mini App is served from.
import { writeFileSync } from 'node:fs';
const url = (process.env.VITE_PUBLIC_URL || '').replace(/\/$/, '');
if (!url) { console.error('VITE_PUBLIC_URL is required'); process.exit(1); }
writeFileSync(new URL('../public/tonconnect-manifest.json', import.meta.url), JSON.stringify({
  url, name: 'EGG Wallet', iconUrl: `${url}/icon.png`,
}, null, 2));
console.log('wrote public/tonconnect-manifest.json for', url);
