import { useMemo } from 'react';
import { useWs, WsServerMessage } from './WebSocketProvider';

function latestOf<T extends WsServerMessage>(msgs: WsServerMessage[], type: T['type']): T | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === type) return msgs[i] as T;
  }
  return undefined;
}

export default function AdminDashboard() {
  const { messages, isConnected } = useWs();

  const uniqueFixtures = useMemo(() => {
    const seen = new Set<number>();
    return messages
      .filter((m): m is Extract<WsServerMessage, { type: 'match_state' }> => m.type === 'match_state')
      .filter(m => {
        if (seen.has(m.data.fixtureId)) return false;
        seen.add(m.data.fixtureId);
        return true;
      });
  }, [messages]);

  const recentTx = useMemo(
    () => messages.filter(m => m.type === 'tx_status').slice(-20).reverse(),
    [messages],
  );

  const recentErrors = useMemo(
    () => messages.filter(m => m.type === 'error' || m.type === 'error_log').slice(-10).reverse(),
    [messages],
  );

  const systemStatus = latestOf(messages, 'system_status') as Extract<WsServerMessage, { type: 'system_status' }> | undefined;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <div className="text-xs text-gray-400 mb-1">WebSocket</div>
          <div className={`text-lg font-bold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-400 mb-1">Active Fixtures</div>
          <div className="text-lg font-bold text-teal">{uniqueFixtures.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-400 mb-1">WS Clients</div>
          <div className="text-lg font-bold text-cyan">
            {systemStatus ? systemStatus.data.clientCount : '-'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-400 mb-1">Relayer SOL</div>
          <div className="text-lg font-bold text-teal">
            {systemStatus ? `${(systemStatus.data.solBalance / 1e9).toFixed(2)} SOL` : '-'}
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Active Matches</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray-400">
                <th className="p-3">Fixture ID</th>
                <th className="p-3">Status</th>
                <th className="p-3">Score</th>
                <th className="p-3">Period</th>
                <th className="p-3">Clock</th>
              </tr>
            </thead>
            <tbody>
              {uniqueFixtures.map(m => (
                <tr key={m.data.fixtureId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <a href={`/admin/matches/${m.data.fixtureId}`} className="text-teal hover:underline">
                      {m.data.fixtureId}
                    </a>
                  </td>
                  <td className="p-3">{m.data.status}</td>
                  <td className="p-3">{m.data.homeScore} - {m.data.awayScore}</td>
                  <td className="p-3">{m.data.currentPeriod}</td>
                  <td className="p-3 font-mono">{(m.data.matchClockMs / 1000).toFixed(0)}s</td>
                </tr>
              ))}
              {uniqueFixtures.length === 0 && (
                <tr><td colSpan={5} className="p-3 text-gray-500 text-center">No match data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Recent Crank Transactions</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray-400">
                <th className="p-3">Fixture</th>
                <th className="p-3">Round</th>
                <th className="p-3">Status</th>
                <th className="p-3">Tx Sig</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((tx, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">{tx.data.fixtureId}</td>
                  <td className="p-3">{tx.data.roundId}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      tx.data.status === 'confirmed' ? 'bg-green-400/10 text-green-400' :
                      tx.data.status === 'failed' ? 'bg-red-400/10 text-red-400' :
                      tx.data.status === 'sent' ? 'bg-yellow-400/10 text-yellow-400' :
                      'bg-gray-400/10 text-gray-400'
                    }`}>{tx.data.status}</span>
                  </td>
                  <td className="p-3 font-mono text-xs text-gray-400">
                    {tx.data.txSig ? tx.data.txSig.slice(0, 16) + '...' : '-'}
                  </td>
                </tr>
              ))}
              {recentTx.length === 0 && (
                <tr><td colSpan={4} className="p-3 text-gray-500 text-center">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {recentErrors.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 text-red-400">Recent Errors</h2>
          <div className="card p-3">
            {recentErrors.map((e, i) => (
              <div key={i} className="text-xs font-mono text-red-400 mb-1">
                {'message' in e.data ? e.data.message : ''}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
