import { useState } from 'react';

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

export default function CreateMarketModal({ onClose }: Props) {
  const [step, setStep] = useState(1);
  const [marketType, setMarketType] = useState('odds_spike');
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState('');
  const [fixtureId, setFixtureId] = useState('1001');

  const handleCreate = () => {
    // TODO: Call KickTickManager.createMarket()
    console.log('Creating market:', { fixtureId, marketType, description, duration });
    alert('Market created! (Connect SDK for real transactions)');
    onClose();
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

            <div className="flex gap-2">
              <button className="flex-1 btn-secondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button className="flex-1 btn-primary" onClick={handleCreate}>
                Create Market
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
