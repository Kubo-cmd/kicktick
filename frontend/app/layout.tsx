import type { Metadata } from 'next';
import './globals.css';
import { WalletContextProvider } from '@/lib/WalletContext';

export const metadata: Metadata = {
  title: 'KickTick | Sub-Minute Micro Prediction Markets on Solana',
  description: 'Create and settle prediction markets in under 60 seconds using live TxODDS odds data + on-chain Merkle proof settlement.',
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
