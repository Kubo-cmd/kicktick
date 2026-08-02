import { useMemo, type ReactNode, type ComponentType, type PropsWithChildren } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

import { CONFIG } from './constants';

import '@solana/wallet-adapter-react-ui/styles.css';

// React 19 + wallet-adapter FC type mismatch workaround
const Conn = ConnectionProvider as ComponentType<PropsWithChildren<{ endpoint: string }>>;
const Wallets = WalletProvider as ComponentType<PropsWithChildren<{ wallets: any[]; autoConnect?: boolean }>>;
const Modal = WalletModalProvider as ComponentType<PropsWithChildren>;

export function WalletContextProvider({ children }: { children: ReactNode }) {
  // Single source of truth: CONFIG.rpcUrl (devnet default, localnet via VITE_ env).
  const endpoint = useMemo(() => CONFIG.rpcUrl, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <Conn endpoint={endpoint}>
      <Wallets wallets={wallets} autoConnect>
        <Modal>{children}</Modal>
      </Wallets>
    </Conn>
  );
}
