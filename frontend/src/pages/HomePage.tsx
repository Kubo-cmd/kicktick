import { useState } from 'react';
import MarketCard from '@/components/MarketCard';
import CreateMarketModal from '@/components/CreateMarketModal';
import LiveOddsFeed from '@/components/LiveOddsFeed';

const DEMO_MARKETS = [
  {
    id: '1',
    fixtureId: 1001,
    match: 'Brazil vs Argentina',
    type: 'odds_spike',
    description: 'Will odds move >15% in next 60s?',
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
  {
    id: '4',
    fixtureId: 1004,
    match: 'Italy vs Portugal',
    type: 'match_result',
    description: 'Italy wins (short format)?',
    endTime: Date.now() + 90000,
    totalYes: 4100,
    totalNo: 1900,
    status: 'open',
  },
];

const ARCH_DIAGRAM = [
  "                         TxLINE API (txline-dev.txodds.com)",
  "                      ┌────────────────────────────────────────┐",
  "                      │POST /auth/guest/start → JWT            │",
  "                      │POST /api/token/activate                │",
  "                      │GET  /api/odds/snapshot/{id}            │",
  "                      │GET  /api/scores/stat-validation        │",
  "                      │GET  /api/odds/stream (SSE)             │",
  "                      │GET  /api/scores/stream (SSE)           │",
  "                      └────────────────────────────────────────┘",
  "                                    │",
  "                                    ▼",
  "┌────────────────────────────────────────────────────────┐",
  "│RELAYER (Node/TS crank — no DB, no REST API)            │",
  "│                                                        │",
  "│txline-auth.ts ──► txodds-client SDK ──► JWT + API token│",
  "│                                                        │",
  "│SSE scores stream ──► fixture-watcher (StatusId 1-19)   │",
  "│     │                                                  │",
  "│     ▼                                                  │",
  "│market-trigger.ts (rules engine)                        │",
  "│  • Event-triggered: goal→NextGoalSide, corner→NextCorne│",
  "│  • Cron: every 5min→GoalInWindow                       │",
  "│  • Shootout mode: PE status→sequential rounds          │",
  "│  • Timeouts: deadline→settle(NO)                       │",
  "│     │                                                  │",
  "│     ├──► proof-gatherer (GET /stat-validation)         │",
  "│     │       │                                          │",
  "│     │       ▼                                          │",
  "│     │   crank.ts (build tx → sign → send to devnet)    │",
  "│     │       │                                          │",
  "│     └──► ws-server.ts (WebSocket → frontend)           │",
  "└────────────────────────────────────────────────────────┘",
  "│CPI validate_stat                                       ││ WebSocket",
  "           ▼                                 ▼",
  "┌──────────────────────┐       ┌──────────────────────┐",
  "│Solana Devnet         │       │Frontend (Vite + React│",
  "│                      │       │                      │",
  "│kicktick program      │       │Header (wallet)       │",
  "│  init_config         │       │MarketCard (bet UI)   │",
  "│  init_match          │       │CreateMarketModal     │",
  "│  open_round          │       │LiveOddsFeed (demo)   │",
  "│  place_bet           │       │                      │",
  "│  settle_round        │       │Wallet: Phantom/Solf  │",
  "│  settle_offchain_    │       │                      │",
  "│    round             │       │Currently: demo data  │",
  "│  confirm_round       │       │No on-chain integra-  │",
  "│  cancel_round        │       │tion yet              │",
  "│  challenge_equivoca- │       │                      │",
  "│    tion              │       │No on-chain integra-  │",
  "│  txoracle program    │       │tion yet              │",
  "│    validate_stat     │       │                      │",
  "│    (CPI)             │       │                      │",
  "│                      │       │                      │",
  "└──────────────────────┘       └──────────────────────┘",
].join("\n");

export default function HomePage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen">
      <section className="px-6 py-12 max-w-6xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            <span className="gradient-text">KickTick</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            Sub-minute micro prediction markets on Solana.<br />
            Settle in <span className="text-teal">&lt;60s</span> using live TxODDS odds + on-chain Merkle proofs.
          </p>
          <div className="flex gap-4 justify-center">
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              Create Market
            </button>
            <a href="#markets" className="btn-secondary">
              Browse Markets
            </a>
          </div>
        </section>

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
              <div className="text-2xl font-bold text-teal">312</div>
              <div className="text-xs text-gray-400">Markets Settled</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan">89</div>
              <div className="text-xs text-gray-400">Live Matches</div>
            </div>
          </div>
        </section>

        <section id="markets" className="px-6 max-w-6xl mx-auto pb-16">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Live Markets</h2>
            <p className="text-sm text-gray-400">Create, bet, and settle in seconds using real-time TxODDS data.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="grid gap-4">
                {DEMO_MARKETS.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
            </div>
            <div>
              <LiveOddsFeed />
            </div>
          </div>
        </section>

        <section id="architecture" className="px-6 max-w-6xl mx-auto pb-16">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Architecture</h2>
            <p className="text-sm text-gray-400">Three subsystems: Anchor program (on-chain) ↔ Relayer (off-chain crank) ↔ Frontend.</p>
          </div>
          <div className="card p-4 overflow-x-auto">
            <pre className="text-xs leading-relaxed text-gray-300 whitespace-pre">{ARCH_DIAGRAM}</pre>
          </div>
        </section>

        {showCreate && (
          <CreateMarketModal onClose={() => setShowCreate(false)} />
        )}
      </div>
  );
}
