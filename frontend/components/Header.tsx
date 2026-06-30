'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function Header() {
  return (
    <header className="border-b border-white/5 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-cyan flex items-center justify-center font-bold text-sm">
            KT
          </div>
          <span className="font-bold text-lg">KickTick</span>
          <span className="text-gray-500">+</span>
          <span className="font-bold text-lg gradient-text">SPIKES</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="#markets"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Markets
          </a>
          <a
            href="#album"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Album
          </a>
          <WalletMultiButton
            style={{
              background: 'linear-gradient(135deg, #14B8A6, #06B6D4)',
              fontSize: '14px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: '600',
            }}
          />
        </div>
      </div>
    </header>
  );
}
