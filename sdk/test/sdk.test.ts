// SDK↔program parity tests. The reference vectors are computed with the
// exact seed recipes from programs/kicktick/src (constants.rs + each
// instruction's #[account(seeds=...)]) — the assertions below recompute
// them independently via raw web3.js to catch any drift in src/pda.ts.

import { describe, expect, it } from 'vitest';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { createHash } from 'crypto';
import {
  findConfigPda, findMatchPda, findMatchVaultPda, findRoundPda,
  findPositionPda, findSponsorVaultPda, i64Le, u64Le,
} from '../src/pda';
import {
  PROGRAM_ID, DEVNET_PROGRAM_ID, TXORACLE_PROGRAM_ID,
  SEEDS, MARKET_TYPE, OFFCHAIN_MARKETS, ROUND_STATUS, ROUND_OUTCOME, SIDE,
} from '../src/constants';
import {
  ixDiscriminator, buildInitMatch, buildOpenRound, buildPlaceBet,
  buildSettleOffchainRound, buildClaimWinnings, buildCancelRound,
} from '../src/instructions';

const PROG = new PublicKey(PROGRAM_ID);
const OWNER = Keypair.generate().publicKey;

// Independent reference derivation (does NOT go through src/pda.ts helpers).
function ref(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROG)[0];
}

describe('PDA seed parity with programs/kicktick', () => {
  it('match: ["match", fixture_id i64 LE]', () => {
    const [ours] = findMatchPda(12345);
    expect(ours.toBase58()).toBe(ref([Buffer.from('match'), i64Le(12345)]).toBase58());
  });

  it('match: negative fixture ids serialize as i64 LE, not utf8', () => {
    const [ours] = findMatchPda(-42);
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(-42n);
    expect(ours.toBase58()).toBe(ref([Buffer.from('match'), b]).toBase58());
  });

  it('match_vault: ["match_vault", match_pda]', () => {
    const [match] = findMatchPda(1);
    const [ours] = findMatchVaultPda(match);
    expect(ours.toBase58()).toBe(ref([Buffer.from('match_vault'), match.toBuffer()]).toBase58());
  });

  it('round: ["round", match_pda, round_id u64 LE]', () => {
    const [match] = findMatchPda(7);
    const [ours] = findRoundPda(match, 3);
    expect(ours.toBase58()).toBe(ref([Buffer.from('round'), match.toBuffer(), u64Le(3)]).toBase58());
  });

  it('position: ["position", fixture_id LE, round_id LE, owner]', () => {
    const [ours] = findPositionPda(7, 3, OWNER);
    expect(ours.toBase58()).toBe(
      ref([Buffer.from('position'), i64Le(7), u64Le(3), OWNER.toBuffer()]).toBase58()
    );
  });

  it('config and sponsor_vault are global (no per-match seed)', () => {
    const [c1] = findConfigPda();
    expect(c1.toBase58()).toBe(ref([Buffer.from('config')]).toBase58());
    const [s1] = findSponsorVaultPda();
    expect(s1.toBase58()).toBe(ref([Buffer.from('sponsor_vault')]).toBase58());
  });

  it('regression: utf8 fixture id derivation (old SDK) must NOT match', () => {
    const [ours] = findMatchPda(12345);
    const old = PublicKey.findProgramAddressSync(
      [Buffer.from('match'), Buffer.from('12345')], PROG
    )[0];
    expect(ours.equals(old)).toBe(false);
  });
});

describe('constants parity with program source', () => {
  it('program ids', () => {
    expect(PROGRAM_ID).toBe('CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc');       // declare_id
    expect(DEVNET_PROGRAM_ID).toBe('a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2'); // AGENTS.md
    expect(TXORACLE_PROGRAM_ID).toBe('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J');
  });

  it('seed strings match constants.rs', () => {
    expect(SEEDS).toEqual({
      CONFIG: 'config', MATCH: 'match', MATCH_VAULT: 'match_vault',
      ROUND: 'round', POSITION: 'position', SPONSOR_VAULT: 'sponsor_vault',
    });
  });

  it('market type ordinals follow state/round.rs enum order', () => {
    expect(MARKET_TYPE.NextGoalSide).toBe(0);
    expect(MARKET_TYPE.PenaltyShootoutShot).toBe(7);
    expect(MARKET_TYPE.PenaltyShot).toBe(8);
    expect(MARKET_TYPE.VARCheck).toBe(9);
    expect(OFFCHAIN_MARKETS).toEqual([8, 9]);
  });

  it('status/outcome/side ordinals match enums', () => {
    expect(ROUND_STATUS.Open).toBe(0);
    expect(ROUND_STATUS.ResolvedPending).toBe(2);
    expect(ROUND_STATUS.Cancelled).toBe(5);
    expect(ROUND_OUTCOME.Cancelled).toBe(6);
    expect(SIDE).toEqual({ Yes: 0, No: 1, Abstain: 2 });
  });
});

describe('instruction builders', () => {
  it('discriminators are real Anchor sighashes', () => {
    expect(ixDiscriminator('init_config')).toEqual(
      createHash('sha256').update('global:init_config').digest().subarray(0, 8)
    );
    expect(ixDiscriminator('place_bet').length).toBe(8);
  });

  it('place_bet: account order matches PlaceBet (bettor, match, vault, round, position, system)', () => {
    const ix = buildPlaceBet(OWNER, 42, 1, SIDE.Yes, 1_000_000);
    expect(ix.programId.equals(PROG)).toBe(true);
    const [match] = findMatchPda(42);
    const [vault] = findMatchVaultPda(match);
    const [round] = findRoundPda(match, 1);
    const [position] = findPositionPda(42, 1, OWNER);
    expect(ix.keys.map(k => k.pubkey.toBase58())).toEqual([
      OWNER.toBase58(), match.toBase58(), vault.toBase58(),
      round.toBase58(), position.toBase58(), SystemProgram.programId.toBase58(),
    ]);
    // data: disc(8) + fixture i64 + round u64 + side u8 + amount u64
    expect(ix.data.length).toBe(8 + 8 + 8 + 1 + 8);
    expect(ix.data.readBigInt64LE(8)).toBe(42n);
    expect(ix.data.readBigUInt64LE(16)).toBe(1n);
    expect(ix.data[24]).toBe(0);
    expect(ix.data.readBigUInt64LE(25)).toBe(1_000_000n);
  });

  it('init_match: creator, config, match, match_vault, system + borsh args', () => {
    const ix = buildInitMatch(OWNER, 99, 'Home FC', 'Away FC');
    const [match] = findMatchPda(99);
    const [vault] = findMatchVaultPda(match);
    expect(ix.keys[3]!.pubkey.toBase58()).toBe(vault.toBase58());
    expect(ix.data.readBigInt64LE(8)).toBe(99n);
    // home team borsh string at 16: len + bytes
    expect(ix.data.readUInt32LE(16)).toBe(7);
    expect(ix.data.subarray(20, 27).toString()).toBe('Home FC');
  });

  it('open_round: authority, config, match, round, system + enum ordinal arg', () => {
    const ix = buildOpenRound(OWNER, 5, 1, MARKET_TYPE.VARCheck, 15, 120);
    expect(ix.keys.length).toBe(5);
    expect(ix.data.readBigUInt64LE(8)).toBe(1n);   // round_id
    expect(ix.data[16]).toBe(9);                   // VARCheck ordinal
    expect(ix.data.readBigInt64LE(17)).toBe(15n);  // lock_seconds
    expect(ix.data.readBigInt64LE(25)).toBe(120n); // deadline_seconds
  });

  it('settle_offchain_round: caller, config, match, round + outcome/winner bytes', () => {
    const ix = buildSettleOffchainRound(OWNER, 5, 1, ROUND_OUTCOME.Yes, 1);
    expect(ix.keys.map(k => k.isSigner)).toEqual([true, false, false, false]);
    expect(ix.data[ix.data.length - 2]).toBe(ROUND_OUTCOME.Yes);
    expect(ix.data[ix.data.length - 1]).toBe(1);
  });

  it('claim_winnings: winner, match, round, position, vault, system', () => {
    const ix = buildClaimWinnings(OWNER, 5, 2);
    const [match] = findMatchPda(5);
    const [vault] = findMatchVaultPda(match);
    const [round] = findRoundPda(match, 2);
    const [position] = findPositionPda(5, 2, OWNER);
    expect(ix.keys.map(k => k.pubkey.toBase58())).toEqual([
      OWNER.toBase58(), match.toBase58(), round.toBase58(),
      position.toBase58(), vault.toBase58(), SystemProgram.programId.toBase58(),
    ]);
  });

  it('cancel_round: authority, config, round (no match account)', () => {
    const ix = buildCancelRound(OWNER, 5, 2);
    const [match] = findMatchPda(5);
    const [round] = findRoundPda(match, 2);
    expect(ix.keys.length).toBe(3);
    expect(ix.keys[2]!.pubkey.toBase58()).toBe(round.toBase58());
  });
});
