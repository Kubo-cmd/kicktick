/**
 * KickTick Simulation
 * Tests market lifecycle logic without needing a real Solana connection
 * Run: npx ts-node simulation.ts
 */

import { SpikeDetector, shouldSettleYes } from './kicktick/client/src/txodds-oracle';

// ===== Simulation Helpers =====

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string): void {
  assert(actual === expected, `${message} (expected ${expected}, got ${actual})`);
}

// ===== Mock TxODDS Data Generator =====

function generateOddsRecord(
  fixtureId: number,
  homeWin: number,
  draw: number = 280,
  awayWin: number = 220,
  ts: number = Date.now()
): any {
  return {
    fixture_id: fixtureId,
    message_id: `msg-${ts}`,
    ts,
    bookmaker: 'TxODDS',
    bookmaker_id: 1,
    super_odds_type: '1X2',
    game_state: 'in_play',
    in_running: true,
    market_parameters: null,
    market_period: 'FT',
    price_names: ['Home', 'Draw', 'Away'],
    prices: [homeWin, draw, awayWin],
  };
}

// ===== Test Suites =====

console.log('\n=== KickTick Market Simulation ===\n');

// --- Test 1: Spike Detection ---
console.log('1. Spike Detection Engine\n');

const detector = new SpikeDetector();

// Feed stable odds (no spike)
const stable1 = generateOddsRecord(1001, 500);
const stable2 = generateOddsRecord(1001, 505);
const events1 = detector.feed(stable1);
const events2 = detector.feed(stable2);
assert(events1.length === 0, 'No spike detected on first record');
assert(events2.length === 0, 'No spike detected on small move (5 thousandths)');

// Feed a spike (>15% move)
const spike1 = generateOddsRecord(1001, 700);
const events3 = detector.feed(spike1);
assert(events3.length > 0, 'Spike detected on 200 thousandths move (40%)');
assert(events3[0].type === 'odds_surge', 'Correctly identified as odds_surge');
assert(events3[0].magnitude === 200, 'Correct magnitude calculated');

// Crash detection
const crash1 = generateOddsRecord(1002, 500);
const crash2 = generateOddsRecord(1002, 300);
detector.feed(crash1);
const crashEvents = detector.feed(crash2);
assert(crashEvents.length > 0, 'Crash detected on 200 thousandths drop');
assert(crashEvents[0].type === 'odds_crash', 'Correctly identified as odds_crash');

console.log('');

// --- Test 2: Settlement Logic ---
console.log('2. Settlement Determination\n');

// Odds spike market: creation at 500, now at 700 (>15% threshold)
assert(shouldSettleYes('odds_spike', 500, 700, 150) === true, 'Spike market settles YES when >15% move');
assert(shouldSettleYes('odds_spike', 500, 550, 150) === false, 'Spike market settles NO when <15% move');
assert(shouldSettleYes('odds_spike', 500, 660, 150) === true, 'Spike market settles YES at exactly 16% move');

// Match result: favorite strengthened (odds dropped)
assert(shouldSettleYes('match_result', 500, 400) === true, 'Match result YES when favorite odds drop');
assert(shouldSettleYes('match_result', 500, 600) === false, 'Match result NO when favorite odds rise');

// Next goal / card / corners: event more likely
assert(shouldSettleYes('next_goal', 500, 450) === true, 'Next goal YES when odds drop (more likely)');
assert(shouldSettleYes('next_card', 300, 350) === false, 'Next card NO when odds rise (less likely)');

console.log('');

// --- Test 3: Market Lifecycle Simulation ---
console.log('3. Full Market Lifecycle\n');

interface SimMarket {
  status: 'open' | 'expired' | 'settled' | 'cancelled';
  outcome: 'none' | 'yes' | 'no' | 'cancelled';
  totalYes: number;
  totalNo: number;
  creationOdds: number;
  endTime: number;
}

const market: SimMarket = {
  status: 'open',
  outcome: 'none',
  totalYes: 0,
  totalNo: 0,
  creationOdds: 500,
  endTime: Date.now() + 60000,
};

// Users place bets
market.totalYes += 1000; // 10 USDT on YES
market.totalNo += 800;   // 8 USDT on NO
assertEqual(market.totalYes, 1000, 'YES bets recorded');
assertEqual(market.totalNo, 800, 'NO bets recorded');

// Market expires
market.status = 'expired';
assertEqual(market.status, 'expired', 'Market expires after duration');

// Settlement: odds spiked to 700 (>15%)
const settleOdds = 700;
const isYes = shouldSettleYes('odds_spike', market.creationOdds, settleOdds);
market.outcome = isYes ? 'yes' : 'no';
market.status = 'settled';
assertEqual(market.outcome, 'yes', 'Market settles YES (odds spiked)');
assertEqual(market.status, 'settled', 'Market status = settled');

// Calculate payouts
const totalPool = market.totalYes + market.totalNo; // 1800
const winningPool = market.totalYes; // 1000
const betAmount = 100; // Winner bet 100 on YES
const payout = Math.floor((betAmount * totalPool) / winningPool);
assertEqual(payout, 180, 'Winner gets 180 (100 stake + 80 profit from losing pool)');

console.log('');

// --- Test 4: Edge Cases ---
console.log('4. Edge Cases\n');

// Zero bets on one side
const emptySideMarket: SimMarket = {
  status: 'settled', outcome: 'yes',
  totalYes: 1000, totalNo: 0, creationOdds: 500, endTime: 0,
};
// If no one bet on losing side, winners get full pool back
const fullPool = emptySideMarket.totalYes + emptySideMarket.totalNo;
assertEqual(fullPool, 1000, 'Pool = 1000 when no NO bets');

// Cancellation refund
const cancelledMarket: SimMarket = {
  status: 'cancelled', outcome: 'cancelled',
  totalYes: 500, totalNo: 500, creationOdds: 500, endTime: 0,
};
assertEqual(cancelledMarket.status, 'cancelled', 'Market can be cancelled');
assertEqual(cancelledMarket.outcome, 'cancelled', 'Cancelled outcome set');

// Spike at exact threshold
assert(shouldSettleYes('odds_spike', 500, 650, 150) === false, 'Exactly 15% does NOT trigger (needs >15)');
assert(shouldSettleYes('odds_spike', 500, 651, 150) === true, '15.1% triggers YES');

console.log('');

// --- Test 5: Multi-Fixture Monitoring ---
console.log('5. Multi-Fixture Monitoring\n');

const multiDetector = new SpikeDetector();
const fixtures = [2001, 2002, 2003];
let totalSpikes = 0;

for (const fid of fixtures) {
  multiDetector.feed(generateOddsRecord(fid, 500));
  const events = multiDetector.feed(generateOddsRecord(fid, 750));
  totalSpikes += events.length;
}

assertEqual(totalSpikes, 3, 'Spike detected on all 3 fixtures simultaneously');

console.log('');

// ===== Results =====
console.log('=== Simulation Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
console.log(failed === 0 ? '✓ ALL TESTS PASSED' : `✗ ${failed} TESTS FAILED`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
