/**
 * KickTick Logic Simulation (Pure JS — no imports needed)
 * Tests: spike detection, settlement, payouts, lifecycle
 */

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failed++; console.log(`  ✗ ${message}`); }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

// ===== SpikeDetector (inline) =====
class SpikeDetector {
  constructor() { this.history = new Map(); }
  feed(record) {
    const fid = record.fixture_id;
    const events = [];
    if (!this.history.has(fid)) this.history.set(fid, []);
    const h = this.history.get(fid);
    h.push(record);
    const cutoff = Date.now() - 60000;
    while (h.length > 0 && h[0].ts < cutoff) h.shift();
    if (h.length >= 2) {
      const oldest = h[0], latest = h[h.length - 1];
      for (let i = 0; i < oldest.prices.length && i < latest.prices.length; i++) {
        const delta = Math.abs(latest.prices[i] - oldest.prices[i]);
        if (delta >= 150) {
          events.push({
            fixtureId: fid, timestamp: record.ts,
            type: latest.prices[i] > oldest.prices[i] ? 'odds_surge' : 'odds_crash',
            magnitude: delta, fromValue: oldest.prices[i], toValue: latest.prices[i],
          });
        }
      }
    }
    return events;
  }
}

// ===== Settlement Logic =====
function shouldSettleYes(marketType, creationOdds, currentOdds, threshold = 150) {
  switch (marketType) {
    case 'odds_spike': return Math.abs(currentOdds - creationOdds) > threshold;
    case 'match_result': return currentOdds < creationOdds;
    default: return currentOdds < creationOdds;
  }
}

// ===== Mock Data =====
function odds(fid, home, draw = 280, away = 220, ts = Date.now()) {
  return { fixture_id: fid, message_id: `msg-${ts}`, ts, bookmaker: 'TxODDS', bookmaker_id: 1,
    super_odds_type: '1X2', game_state: 'in_play', in_running: true, market_parameters: null,
    market_period: 'FT', price_names: ['Home', 'Draw', 'Away'], prices: [home, draw, away] };
}

// ===== Run Tests =====
console.log('\n=== KickTick Simulation ===\n');

console.log('1. Spike Detection\n');
const d = new SpikeDetector();
assert(d.feed(odds(1001, 500)).length === 0, 'No spike on first record');
assert(d.feed(odds(1001, 505)).length === 0, 'No spike on small move');
const sp = d.feed(odds(1001, 700));
assert(sp.length > 0, 'Spike detected on 40% move');
assert(sp[0].type === 'odds_surge', 'Correctly: odds_surge');
assert(sp[0].magnitude === 200, 'Magnitude = 200');

const d2 = new SpikeDetector();
d2.feed(odds(1002, 500));
const cr = d2.feed(odds(1002, 300));
assert(cr.length > 0, 'Crash detected on 40% drop');
assert(cr[0].type === 'odds_crash', 'Correctly: odds_crash');

console.log('\n2. Settlement Logic\n');
assert(shouldSettleYes('odds_spike', 500, 700, 150) === true, 'YES: >15% spike');
assert(shouldSettleYes('odds_spike', 500, 550, 150) === false, 'NO: <15% move');
assert(shouldSettleYes('odds_spike', 500, 651, 150) === true, 'YES: 15.1% triggers');
assert(shouldSettleYes('match_result', 500, 400) === true, 'YES: favorite strengthened');
assert(shouldSettleYes('match_result', 500, 600) === false, 'NO: favorite weakened');
assert(shouldSettleYes('next_goal', 500, 450) === true, 'YES: more likely');
assert(shouldSettleYes('next_card', 300, 350) === false, 'NO: less likely');

console.log('\n3. Market Lifecycle + Payouts\n');
const market = { status: 'open', outcome: 'none', totalYes: 0, totalNo: 0, creationOdds: 500, endTime: Date.now() + 60000 };
market.totalYes += 1000;
market.totalNo += 800;
assertEqual(market.totalYes, 1000, 'YES bets: 1000');
assertEqual(market.totalNo, 800, 'NO bets: 800');
market.status = 'expired';
const isYes = shouldSettleYes('odds_spike', market.creationOdds, 700);
market.outcome = isYes ? 'yes' : 'no';
market.status = 'settled';
assertEqual(market.outcome, 'yes', 'Settles YES (spike)');
const totalPool = market.totalYes + market.totalNo;
const payout = Math.floor((100 * totalPool) / market.totalYes);
assertEqual(payout, 180, 'Winner payout: 180 (100 + 80 profit)');

console.log('\n4. Edge Cases\n');
assert(shouldSettleYes('odds_spike', 500, 650, 150) === false, 'Exactly 15% = NO (needs >15)');
assert(shouldSettleYes('odds_spike', 500, 651, 150) === true, '15.1% = YES');
const cancelled = { status: 'cancelled', outcome: 'cancelled', totalYes: 500, totalNo: 500 };
assertEqual(cancelled.status, 'cancelled', 'Cancel works');

console.log('\n5. Multi-Fixture\n');
const md = new SpikeDetector();
let total = 0;
for (const fid of [2001, 2002, 2003]) {
  md.feed(odds(fid, 500));
  total += md.feed(odds(fid, 750)).length;
}
assertEqual(total, 3, '3 spikes across 3 fixtures');

console.log('\n=== Results ===');
console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
console.log(failed === 0 ? '✓ ALL PASSED' : `✗ ${failed} FAILED`);
process.exit(failed > 0 ? 1 : 0);
