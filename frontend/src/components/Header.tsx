import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="border-b border-white/5 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-cyan flex items-center justify-center font-bold text-sm">
            KT
          </div>
          <span className="font-bold text-lg">KickTick</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal/20 text-teal font-mono">SOLANA</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="#markets"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            Markets
          </a>
          <Link to="/admin" className="text-sm text-gray-400 hover:text-white transition">
            Admin
          </Link>
          <a
            href="https://github.com/Kubo-cmd/kicktick"
            target="_blank"
            className="text-sm text-gray-400 hover:text-white transition"
          >
            GitHub
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
