'use client';

import { useState } from 'react';

interface Spike {
  id: string;
  match: string;
  type: string;
  magnitude: number;
  timestamp: number;
  rarity: 'common' | 'rare' | 'legendary';
}

const RARITY_STYLES = {
  common: 'border-gray-500/30 bg-gray-500/5',
  rare: 'border-teal/50 bg-teal/5 glow-teal',
  legendary: 'border-cyan/50 bg-cyan/5 glow-cyan',
};

const RARITY_LABELS = {
  common: 'text-gray-400',
  rare: 'text-teal',
  legendary: 'text-cyan',
};

const TYPE_ICONS: Record<string, string> = {
  odds_surge: '↑',
  odds_crash: '↓',
  goal_scored: '⚽',
  card_issued: '🟨',
  comeback: '↩',
  upset: '!',
};

export default function SpikesAlbum({ spikes }: { spikes: Spike[] }) {
  const [selectedSpike, setSelectedSpike] = useState<Spike | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Your Album</h2>
        <span className="text-sm text-gray-400">{spikes.length} moments</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {spikes.map((spike) => (
          <div
            key={spike.id}
            className={`card p-4 cursor-pointer border transition hover:scale-105 ${RARITY_STYLES[spike.rarity]}`}
            onClick={() => setSelectedSpike(spike)}
          >
            <div className="text-3xl mb-2">{TYPE_ICONS[spike.type] || '⚡'}</div>
            <div className="text-xs text-gray-400 mb-1">{spike.match}</div>
            <div className={`text-xs font-semibold uppercase ${RARITY_LABELS[spike.rarity]}`}>
              {spike.rarity}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {spike.magnitude}% move
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedSpike && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6"
          onClick={() => setSelectedSpike(null)}
        >
          <div
            className={`card p-6 max-w-md w-full border-2 ${RARITY_STYLES[selectedSpike.rarity]}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4 text-center">
              {TYPE_ICONS[selectedSpike.type] || '⚡'}
            </div>
            <h3 className="text-xl font-bold text-center mb-2">
              {selectedSpike.match}
            </h3>
            <p className="text-center text-gray-400 mb-4">
              {selectedSpike.type.replace('_', ' ')} — {selectedSpike.magnitude}% move
            </p>
            <div className="flex justify-between text-sm text-gray-500 mb-4">
              <span>Rarity: <span className={RARITY_LABELS[selectedSpike.rarity]}>{selectedSpike.rarity}</span></span>
              <span>{new Date(selectedSpike.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 btn-primary text-sm">Trade</button>
              <button className="flex-1 btn-secondary text-sm" onClick={() => setSelectedSpike(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
