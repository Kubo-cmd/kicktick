import { useEffect, useState } from 'react';

interface OddsUpdate {
  id: string;
  match: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  inPlay: boolean;
  lastChange: number;
}

// Demo feed - replace with real TxODDS SSE connection
const DEMO_FEED: OddsUpdate[] = [
  { id: '1', match: 'Brazil vs Argentina', homeWin: 520, draw: 280, awayWin: 200, inPlay: true, lastChange: -30 },
  { id: '2', match: 'France vs Germany', homeWin: 350, draw: 300, awayWin: 350, inPlay: true, lastChange: 15 },
  { id: '3', match: 'Spain vs England', homeWin: 420, draw: 280, awayWin: 300, inPlay: true, lastChange: -50 },
  { id: '4', match: 'Italy vs Portugal', homeWin: 380, draw: 320, awayWin: 300, inPlay: false, lastChange: 0 },
];

export default function LiveOddsFeed() {
  const [feed, setFeed] = useState(DEMO_FEED);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setFeed((prev) =>
        prev.map((item) => ({
          ...item,
          homeWin: Math.max(50, Math.min(900, item.homeWin + (Math.random() - 0.5) * 40)),
          awayWin: Math.max(50, Math.min(900, item.awayWin + (Math.random() - 0.5) * 40)),
          draw: Math.max(100, Math.min(500, item.draw + (Math.random() - 0.5) * 20)),
          lastChange: Math.floor((Math.random() - 0.5) * 60),
        }))
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <h3 className="font-semibold text-sm">Live Odds (TxODDS)</h3>
      </div>

      <div className="space-y-3">
        {feed.map((item) => (
          <div key={item.id} className="p-3 rounded-lg bg-navy/50 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white">{item.match}</span>
              {item.inPlay && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                  LIVE
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-500">Home</div>
                <div className={`text-sm font-bold ${item.lastChange < 0 ? 'text-teal' : 'text-white'}`}>
                  {(item.homeWin / 10).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Draw</div>
                <div className="text-sm font-bold text-gray-300">
                  {(item.draw / 10).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Away</div>
                <div className={`text-sm font-bold ${item.lastChange > 0 ? 'text-cyan' : 'text-white'}`}>
                  {(item.awayWin / 10).toFixed(1)}%
                </div>
              </div>
            </div>
            {item.lastChange !== 0 && (
              <div className={`text-[10px] mt-1 text-right ${item.lastChange < 0 ? 'text-teal' : 'text-cyan'}`}>
                {item.lastChange > 0 ? '+' : ''}{item.lastChange / 10}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
