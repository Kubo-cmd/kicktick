'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import MarketCard from '@/components/MarketCard';
import CreateMarketModal from '@/components/CreateMarketModal';
import SpikesAlbum from '@/components/SpikesAlbum';
import LiveOddsFeed from '@/components/LiveOddsFeed';

// Demo data - replace with real SDK calls
const DEMO_MARKETS = [
  {
    id: '1',
    fixtureId: 1001,
    match: 'Brazil vs Argentina',
    type: 'odds_spike',
    description: 'Will odds spike >15% in next 60s?',
    endTime: Date.now() + 45000,
    totalYes: 2500,
    totalNo: 1800,
    status: 'open',
  },
  {
    id: '2',
    fixtureId: 1002,
    match: 'France vs Germany',
    type: 'next_goal',
    description: 'Next goal by France?',
    endTime: Date.now() + 120000,
    totalYes: 3200,
    totalNo: 2100,
    status: 'open',
  },
  {
    id: '3',
    fixtureId: 1003,
    match: 'Spain vs England',
    type: 'over_under_corners',
    description: 'Over 3 corners in next 5 min?',
    endTime: Date.now() + 180000,
    totalYes: 900,
    totalNo: 1400,
    status: 'open',
  },
];

const DEMO_SPIKES = [
  { id: '1', match: 'Brazil vs Argentina', type: 'odds_surge', magnitude: 22, timestamp: Date.now() - 300000, rarity: 'rare' },
  { id: '2', match: 'France vs Germany', type: 'goal_scored', magnitude: 35, timestamp: Date.now() - 600000, rarity: 'legendary' },
  { id: '3', match: 'Spain vs England', type: 'odds_crash', magnitude: 18, timestamp: Date.now() - 900000, rarity: 'common' },
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'markets' | 'spikes'>('markets');
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="px-6 py-12 max-w-6xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          <span className="gradient-text">KickTick</span> +{' '}
          <span className="gradient-text">SPIKES</span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
          Sub-minute prediction markets + collectible spike moments.
          Powered by <span className="text-teal">TxODDS</span> live World Cup data on{' '}
          <span className="text-cyan">Solana</span>.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Create Market
          </button>
          <button className="btn-secondary">
            View Album
          </button>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="px-6 max-w-6xl mx-auto mb-8">
        <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-teal">142</div>
            <div className="text-xs text-gray-400">Active Markets</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-cyan">$24.5K</div>
            <div className="text-xs text-gray-400">Total Volume</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-teal">1,847</div>
            <div className="text-xs text-gray-400">Spikes Minted</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-cyan">89</div>
            <div className="text-xs text-gray-400">Live Matches</div>
          </div>
        </div>
      </section>

      {/* Tab Navigation */}
      <section className="px-6 max-w-6xl mx-auto mb-6">
        <div className="flex gap-2">
          <button
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'markets'
                ? 'bg-teal/20 text-teal border border-teal/50'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('markets')}
          >
            KickTick Markets
          </button>
          <button
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === 'spikes'
                ? 'bg-cyan/20 text-cyan border border-cyan/50'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('spikes')}
          >
            SPIKES Album
          </button>
        </div>
      </section>

      {/* Content */}
      <section className="px-6 max-w-6xl mx-auto pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {activeTab === 'markets' ? (
              <div className="grid gap-4">
                {DEMO_MARKETS.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
            ) : (
              <SpikesAlbum spikes={DEMO_SPIKES} />
            )}
          </div>
          <div>
            <LiveOddsFeed />
          </div>
        </div>
      </section>

      {/* Create Market Modal */}
      {showCreate && (
        <CreateMarketModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
