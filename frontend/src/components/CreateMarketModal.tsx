import { useState } from 'react';
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { CONFIG } from '@/lib/constants';
import { KickTickClient } from '@/lib/sdkClient';

interface Props {
  onClose: () => void;
}

const MARKET_TYPES = [
  { value: 'odds_spike', label: 'Odds Spike', desc: 'Will odds move >X% in N seconds?' },
  { value: 'next_goal', label: 'Next Goal', desc: 'Which team scores next?' },
  { value: 'next_card', label: 'Next Card', desc: 'Card in next 5 minutes?' },
  { value: 'over_under_corners', label: 'Corners', desc: 'Over/under corners in N min?' },
  { value: 'match_result', label: 'Match Result', desc: 'Who wins (short market)?' },
];

const DURATIONS = [
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
];

const RPC_URL = CONFIG.rpcUrl;

export default function CreateMarketModal({ onClose }: Props) {
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const [step, setStep] = useState(1);
  const [marketType, setMarketType] = useState('odds_spike');
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState('');
  const [fixtureId, setFixtureId] = useState('1001');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [creating, setCreating] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!publicKey || !signTransaction || !sendTransaction) {
      alert('Connect your wallet first');
      return;
    }
    const nid = Number(fixtureId);
    if (!nid || nid < 1) { alert('Enter a valid Fixture ID'); return; }
    if (!homeTeam.trim() || !awayTeam.trim()) { alert('Enter home and away team names'); return; }

    setCreating(true);
    setTxResult(null);
    try {
      const conn = new Connection(RPC_URL, 'confirmed');
      const walletAdapter = {
        publicKey,
        signTransaction,
        signAllTransactions: async (txs: any[]) => {
          const signed: any[] = [];
          for (const tx of txs) signed.push(await signTransaction(tx));
          return signed;
        },
      } as any;
      const client = new KickTickClient(conn, walletAdapter as any);
      const sig = await client.initMatch(nid, homeTeam.trim(), awayTeam.trim());
      console.log('initMatch tx:', sig);
      setTxResult(sig);
      setTimeout(() => onClose(), 2500);
    } catch (err: any) {
      console.error('initMatch failed:', err);
      alert(`Transaction failed: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="card p-6 max-w-lg w-full border border-teal/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Create Market</h2>
          <button
            className="text-gray-400 hover:text-white text-xl"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Step 1: Market Type */}
        {step === 1 && (
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Market Type</label>
            <div className="space-y-2 mb-6">
              {MARKET_TYPES.map((type) => (
                <button
                  key={type.value}
                  className={`w-full p-3 rounded-lg text-left transition ${
                    marketType === type.value
                      ? 'bg-teal/20 border border-teal/50'
                      : 'bg-navy border border-white/5 hover:border-white/20'
                  }`}
                  onClick={() => setMarketType(type.value)}
                >
                  <div className="font-medium text-sm">{type.label}</div>
                  <div className="text-xs text-gray-400">{type.desc}</div>
                </button>
              ))}
            </div>
            <button className="w-full btn-primary" onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        )}

        {/* Step 2: Duration & Details */}
        {step === 2 && (
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Duration</label>
            <div className="flex gap-2 mb-4">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    duration === d.value
                      ? 'bg-teal text-white'
                      : 'bg-navy text-gray-400 hover:text-white'
                  }`}
                  onClick={() => setDuration(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <label className="text-sm text-gray-400 mb-2 block">Fixture ID</label>
            <input
              type="text"
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-navy border border-white/10 text-white mb-4 focus:outline-none focus:border-teal/50"
              placeholder="TxODDS fixture ID"
            />

            <label className="text-sm text-gray-400 mb-2 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-navy border border-white/10 text-white mb-4 focus:outline-none focus:border-teal/50 resize-none"
              rows={2}
              placeholder="Describe your market..."
              maxLength={128}
            />

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Home Team</label>
                <input
                  type="text"
                  value={homeTeam}
                  onChange={(e) => setHomeTeam(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-navy border border-white/10 text-white text-sm focus:outline-none focus:border-teal/50"
                  placeholder="e.g. Brazil"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Away Team</label>
                <input
                  type="text"
                  value={awayTeam}
                  onChange={(e) => setAwayTeam(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-navy border border-white/10 text-white text-sm focus:outline-none focus:border-teal/50"
                  placeholder="e.g. Argentina"
                />
              </div>
            </div>

            {txResult && (
              <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 rounded-lg text-xs text-green-300 truncate">
                ✅ Tx: {txResult}
              </div>
            )}

            <div className="flex gap-2">
              <button className="flex-1 btn-secondary" onClick={() => setStep(1)} disabled={creating}>
                Back
              </button>
              <button
                className="flex-1 btn-primary"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Market'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
