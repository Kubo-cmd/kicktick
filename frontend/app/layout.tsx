import type { Metadata } from 'next';
import './globals.css';
import { WalletContextProvider } from '@/lib/WalletContext';

export const metadata: Metadata = {
  title: 'KickTick + SPIKES | TxODDS World Cup Hackathon',
  description: 'Sub-minute micro prediction markets + collectible spike moments powered by TxODDS on Solana',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark text-white min-h-screen antialiased">
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  );
}
