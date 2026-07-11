import { useState, useMemo } from 'react';
import { useWs } from './WebSocketProvider';

export default function AdminFeedViewer() {
  const { messages } = useWs();
  const [filter, setFilter] = useState<string>('all');

  const messageTypes = useMemo(() => {
    const types = new Set(messages.map(m => m.type));
    return ['all', ...Array.from(types)];
  }, [messages]);

  const filteredMessages = useMemo(() => {
    if (filter === 'all') return messages;
    return messages.filter(m => m.type === filter);
  }, [messages, filter]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Live Event Feed</h1>

      <div className="mb-4 flex gap-2 flex-wrap">
        {messageTypes.map(type => (
          <button
            key={type}
            className={`px-3 py-1 rounded text-xs ${
              filter === type ? 'bg-teal text-black' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
            onClick={() => setFilter(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="card p-3 max-h-[70vh] overflow-y-auto">
        {filteredMessages.slice().reverse().map((msg, i) => (
          <div key={i} className="text-xs font-mono mb-2 pb-2 border-b border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                msg.type === 'error' || msg.type === 'error_log' ? 'bg-red-400/20 text-red-400' :
                msg.type === 'round_opened' ? 'bg-blue-400/20 text-blue-400' :
                msg.type === 'round_confirmed' ? 'bg-green-400/20 text-green-400' :
                msg.type === 'round_settled' ? 'bg-yellow-400/20 text-yellow-400' :
                'bg-gray-400/20 text-gray-400'
              }`}>{msg.type}</span>
            </div>
            <pre className="text-gray-300 whitespace-pre-wrap">
              {JSON.stringify(msg.data, null, 2)}
            </pre>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-8">
            Waiting for WebSocket messages...
          </div>
        )}
      </div>
    </div>
  );
}
