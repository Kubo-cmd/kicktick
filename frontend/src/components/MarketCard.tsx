import { useState } from 'react';

interface Market {
  id: string;
  fixtureId: number;
  match: string;
  type: string;
  description: string;
  endTime: number;
  totalYes: number;
  totalNo: number;
  status: string;
}

export default function MarketCard({ market }: { market: Market }) {
  const [betSide, setBetSide] = useState<'yes' | 'no' | null>(null);
  const [betAmount, setBetAmount] = useState('');

  const totalPool = market.totalYes + market.totalNo;
  const yesPercent = totalPool > 0 ? (market.totalYes / totalPool) * 100 : 50;
  const noPercent = totalPool > 0 ? (market.totalNo / totalPool) * 100 : 50;

  const timeLeft = Math.max(0, Math.floor((market.endTime - Date.now()) / 1000));

  const typeLabel: Record<string, string> = {
    odds_spike: 'Odds Spike',
    next_goal: 'Next Goal',
    next_card: 'Next Card',
    over_under_corners: 'Corners',
    match_result: 'Match Result',
  };

  return (
    <div className="card p-5 hover:border-teal/30 transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded bg-teal/20 text-teal font-medium">
              {typeLabel[market.type] || market.type}
            </span>
            <span className="text-xs text-gray-500">
              {timeLeft > 0 ? `${timeLeft}s left` : 'Expired'}
            </span>
          </div>
          <h3 className="font-semibold text-white">{market.match}</h3>
          <p className="text-sm text-gray-400">{market.description}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Pool</div>
          <div className="font-bold text-teal">${totalPool.toLocaleString()}</div>
        </div>
      </div>

      {/* Odds Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-teal font-medium">YES {yesPercent.toFixed(0)}%</span>
          <span className="text-cyan font-medium">NO {noPercent.toFixed(0)}%</span>
        </div>
        <div className="h-2 rounded-full bg-navy overflow-hidden flex">
          <div
            className="bg-teal transition-all"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="bg-cyan transition-all"
            style={{ width: `${noPercent}%` }}
          />
        </div>
      </div>

      {/* Bet Controls */}
      <div className="flex gap-2">
        <button
          className={`flex-1 py-2 rounded-lg font-semibold text-sm transition ${
            betSide === 'yes'
              ? 'bg-teal text-white'
              : 'bg-teal/10 text-teal hover:bg-teal/20'
          }`}
          onClick={() => setBetSide('yes')}
        >
          Bet YES
        </button>
        <button
          className={`flex-1 py-2 rounded-lg font-semibold text-sm transition ${
            betSide === 'no'
              ? 'bg-cyan text-white'
              : 'bg-cyan/10 text-cyan hover:bg-cyan/20'
          }`}
          onClick={() => setBetSide('no')}
        >
          Bet NO
        </button>
        <input
          type="number"
          placeholder="USDT"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          className="w-24 px-3 py-2 rounded-lg bg-navy border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal/50"
        />
      </div>

      {betSide && betAmount && (
        <button className="w-full mt-3 btn-primary text-sm">
          Place Bet: {betAmount} USDT on {betSide.toUpperCase()}
        </button>
      )}
    </div>
  );
}
