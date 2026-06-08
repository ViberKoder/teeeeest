import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RMJ Wallet',
  description:
    'Self-custodial TON wallet with Rolling Mintless Jetton (RMJ) support — TON, jettons, NFTs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
