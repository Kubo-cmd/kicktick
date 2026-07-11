import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Connection, PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { CONFIG } from '@/lib/constants';
import { useWs, WsServerMessage } from './WebSocketProvider';

const RPC_URL = CONFIG.rpcUrl;
const PROGRAM_ID = new PublicKey(CONFIG.kicktickProgramId);

function deriveMatchPda(fixtureId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(fixtureId), 0);
  return PublicKey.findProgramAddressSync([Buffer.from("match"), buf], PROGRAM_ID);
}

export default function AdminMatchDetail() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const fid = Number(fixtureId);
  const { messages, subscribeMatch, unsubscribeMatch } = useWs();
  const { publicKey } = useWallet();
  const [matchData, setMatchData] = useState<{ fixtureId: number; address: string; exists: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOpenRound, setShowOpenRound] = useState(false);
  const [openRoundForm, setOpenRoundForm] = useState({
    marketType: 'NextGoalSide',
    roundId: 1,
    lockSeconds: 30,
    deadlineSeconds: 90,
  });

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;

    async function fetchMatch() {
      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const [matchPda] = deriveMatchPda(fid);
        const acc = await conn.getAccountInfo(matchPda);
        if (!cancelled) {
          setMatchData({
            fixtureId: fid,
            address: matchPda.toBase58(),
            exists: !!acc,
          });
        }
      } catch (err) {
        console.error('Failed to fetch match:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMatch();
    subscribeMatch(fid);
    return () => {
      cancelled = true;
      unsubscribeMatch(fid);
    };
  }, [fid]);

  type MatchStateMsg = Extract<WsServerMessage, { type: 'match_state' }>;
  const wsMatchState = useMemo(() => {
    const msgs = messages.filter((m): m is MatchStateMsg => m.type === 'match_state' && m.data.fixtureId === fid);
    return msgs.length > 0 ? msgs[msgs.length - 1].data : null;
  }, [messages, fid]);

  type RoundMsg = Extract<WsServerMessage, { type: 'round_opened' | 'round_settled' | 'round_confirmed' | 'round_cancelled' }>;
  const roundEvents = useMemo(() =>
    messages.filter((m): m is RoundMsg =>
      (m.type === 'round_opened' || m.type === 'round_settled' ||
       m.type === 'round_confirmed' || m.type === 'round_cancelled') &&
      m.data.fixtureId === fid
    ),
  [messages, fid]);

  const eventLog = useMemo(() =>
    messages.filter((m): m is Extract<WsServerMessage, { type: 'football_event' }> =>
      m.type === 'football_event' && m.data.fixtureId === fid
    ).slice(-50),
  [messages, fid]);

  type TxStatusMsg = Extract<WsServerMessage, { type: 'tx_status' }>;
  const txStatuses = useMemo(() =>
    messages.filter((m): m is TxStatusMsg => m.type === 'tx_status' && m.data.fixtureId === fid).slice(-20),
  [messages, fid]);

  if (loading) {
    return <div className="text-gray-400">Loading match data...</div>;
  }

  return (
    <div>
      <Link to="/admin/dashboard" className="text-sm text-teal hover:underline mb-4 inline-block">
        &larr; Back to Dashboard
      </Link>

      <h1 className="text-2xl font-bold mb-2">Match {fid}</h1>
      {matchData && (
        <p className="text-gray-400 text-sm mb-6">
          PDA: <span className="font-mono text-xs opacity-60">{matchData.address}</span>
          {matchData.exists ? <span className="ml-3 text-green-400">✓ On-chain</span> : <span className="ml-3 text-red-400">✗ Not initialized</span>}
        </p>
      )}

      {wsMatchState && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card p-4 text-center">
            <div className="text-xs text-gray-400">Status</div>
            <div className="text-lg font-bold">{wsMatchState.status}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs text-gray-400">Score</div>
            <div className="text-lg font-bold">{wsMatchState.homeScore} - {wsMatchState.awayScore}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs text-gray-400">Period</div>
            <div className="text-lg font-bold">{wsMatchState.currentPeriod}</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-xs text-gray-400">Clock</div>
            <div className="text-lg font-bold font-mono">{(wsMatchState.matchClockMs / 1000).toFixed(0)}s</div>
          </div>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Round Activity</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray-400">
                <th className="p-3">Event</th>
                <th className="p-3">Round ID</th>
                <th className="p-3">Market Type</th>
                <th className="p-3">Outcome/Tx</th>
              </tr>
            </thead>
            <tbody>
              {roundEvents.slice(-30).reverse().map((e, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      e.type === 'round_opened' ? 'bg-blue-400/10 text-blue-400' :
                      e.type === 'round_settled' ? 'bg-yellow-400/10 text-yellow-400' :
                      e.type === 'round_confirmed' ? 'bg-green-400/10 text-green-400' :
                      e.type === 'round_cancelled' ? 'bg-red-400/10 text-red-400' : ''
                    }`}>{e.type}</span>
                  </td>
                  <td className="p-3 font-mono">{e.data.roundId}</td>
                  <td className="p-3">{(e.data as any).marketType || '-'}</td>
                  <td className="p-3 font-mono text-xs text-gray-400">
                    {(e.data as any).outcome || (e.data as any).txSig?.slice(0, 16) || '-'}
                  </td>
                </tr>
              ))}
              {roundEvents.length === 0 && (
                <tr><td colSpan={4} className="p-3 text-gray-500 text-center">No round activity yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">SSE Event Log</h2>
        <div className="card p-3 max-h-80 overflow-y-auto">
          {eventLog.map((e, i) => (
            <div key={i} className="text-xs font-mono mb-1 text-gray-300">
              <span className="text-teal">{e.data.action}</span>
              {' '}{e.data.description}
            </div>
          ))}
          {eventLog.length === 0 && (
            <div className="text-gray-500 text-sm">No SSE events received yet</div>
          )}
        </div>
      </section>

      {txStatuses.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Crank Tx Status</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-gray-400">
                  <th className="p-3">Action</th>
                  <th className="p-3">Round</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tx Sig</th>
                </tr>
              </thead>
              <tbody>
                {txStatuses.slice().reverse().map((tx, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="p-3 font-mono text-xs">{(tx.data as any).action || '-'}</td>
                    <td className="p-3">{tx.data.roundId}</td>
                    <td className="p-3">{tx.data.status}</td>
                    <td className="p-3 font-mono text-xs text-gray-400">
                      {tx.data.txSig ? tx.data.txSig.slice(0, 16) + '...' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Admin Actions</h2>
        <div className="card p-4">
          <p className="text-sm text-gray-400 mb-3">
            Connected as: <span className="font-mono text-teal">{publicKey?.toBase58().slice(0, 8)}...</span>
          </p>
          <div className="flex gap-3">
            <button
              className="btn-primary text-sm"
              onClick={() => setShowOpenRound(true)}
            >
              + Open Round
            </button>
            <button
              className="btn-secondary text-sm"
              onClick={() => alert('Cancel round (Task 9)')}
            >
              Cancel Round
            </button>
          </div>
        </div>
      </section>

      {showOpenRound && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowOpenRound(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Open Round</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Market Type</label>
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  value={openRoundForm.marketType}
                  onChange={e => setOpenRoundForm(f => ({ ...f, marketType: e.target.value }))}
                >
                  {['NextGoalSide', 'GoalInWindow', 'NextCorner', 'CornerInWindow', 'NextYellowCard', 'YellowCardInWindow', 'RedCardInMatch', 'PenaltyShootoutShot', 'PenaltyShot', 'VARCheck'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Round ID</label>
                <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  value={openRoundForm.roundId}
                  onChange={e => setOpenRoundForm(f => ({ ...f, roundId: Number(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Lock (s)</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={openRoundForm.lockSeconds}
                    onChange={e => setOpenRoundForm(f => ({ ...f, lockSeconds: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Deadline (s)</label>
                  <input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={openRoundForm.deadlineSeconds}
                    onChange={e => setOpenRoundForm(f => ({ ...f, deadlineSeconds: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button className="btn-primary text-sm flex-1" onClick={() => {
                  alert(`TODO: call openRound(fixture=${fid}, marketType=${openRoundForm.marketType}, roundId=${openRoundForm.roundId})`);
                  setShowOpenRound(false);
                }}>Open Round</button>
                <button className="btn-secondary text-sm" onClick={() => setShowOpenRound(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
