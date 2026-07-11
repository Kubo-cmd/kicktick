import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { CONFIG } from '@/lib/constants';

const RPC_URL = CONFIG.rpcUrl;
const PROGRAM_ID = new PublicKey(CONFIG.kicktickProgramId);

function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("config")], programId);
}

interface ConfigData {
  admin: string;
  txoracleProgramId: string;
  finalityDelay: number;
  minLiquidity: number;
}

export default function AdminConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchConfig() {
      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const [configPda] = deriveConfigPda(PROGRAM_ID);
        const acc = await conn.getAccountInfo(configPda);
        if (!cancelled) {
          if (acc) {
            const data = acc.data;
            const admin = new PublicKey(data.slice(8, 40)).toBase58();
            const txoracleProgramId = new PublicKey(data.slice(40, 72)).toBase58();
            const finalityDelay = Number(data.readBigUInt64LE(72));
            const minLiquidity = Number(data.readBigUInt64LE(80));
            setConfig({ admin, txoracleProgramId, finalityDelay, minLiquidity });
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch config:', err);
        if (!cancelled) setLoading(false);
      }
    }
    fetchConfig();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-gray-400">Loading config...</div>;
  if (!config) return <div className="text-red-400">Config PDA not found. Run init_config first.</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Configuration</h1>
      <div className="card p-4 max-w-lg">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-gray-400 mb-1">Admin Wallet</dt>
            <dd className="font-mono text-sm text-teal">{config.admin}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 mb-1">TxOracle Program ID</dt>
            <dd className="font-mono text-sm text-teal">{config.txoracleProgramId}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 mb-1">Finality Delay</dt>
            <dd className="font-mono text-sm">{config.finalityDelay} seconds</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 mb-1">Min Liquidity</dt>
            <dd className="font-mono text-sm">{config.minLiquidity / 1e9} SOL</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
