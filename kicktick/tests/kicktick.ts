import * as anchor from '@anchor-lang/core';
import { Program } from '@anchor-lang/core';
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { assert } from 'chai';

import { Kicktick } from '../target/types/kicktick';

const SEED_CONFIG = Buffer.from('config');
const SEED_MATCH = Buffer.from('match');
const SEED_MATCH_VAULT = Buffer.from('match_vault');
const SEED_ROUND = Buffer.from('round');
const SEED_POSITION = Buffer.from('position');

describe('KickTick (Native SOL)', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Kicktick as Program<Kicktick>;
  const admin = provider.wallet;

  let configPda: PublicKey;
  let matchPda: PublicKey;
  let vaultPda: PublicKey;
  let roundPda: PublicKey;
  let positionPda: PublicKey;

  const fixtureId = new anchor.BN(54321);
  const homeTeam = 'Home FC';
  const awayTeam = 'Away United';
  const betAmount = new anchor.BN(10_000_000); // 0.01 SOL
  const roundId = new anchor.BN(1);
  const LOCK_SECS = 15;
  const DEADLINE_SECS = 16;

  const bettor2 = Keypair.generate();

  before(async () => {
    configPda = PublicKey.findProgramAddressSync(
      [SEED_CONFIG],
      program.programId,
    )[0];

    const existing = await provider.connection.getAccountInfo(configPda);
    if (!existing) {
      await (program.methods.initConfig() as any)
        .accountsStrict({
          admin: admin.publicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const created = await provider.connection.getAccountInfo(configPda);
      if (!created) throw new Error('init_config failed');
    }

    // Fund bettor2 for placeBet
    const sig = await provider.connection.requestAirdrop(
      bettor2.publicKey, 0.1 * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, 'confirmed');
  });

  it('1. init_match creates match PDA + vault', async () => {
    matchPda = PublicKey.findProgramAddressSync(
      [SEED_MATCH, fixtureId.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    )[0];
    vaultPda = PublicKey.findProgramAddressSync(
      [SEED_MATCH_VAULT, matchPda.toBuffer()],
      program.programId,
    )[0];

    await (program.methods
      .initMatch(fixtureId, homeTeam, awayTeam) as any)
      .accountsStrict({
        creator: admin.publicKey,
        config: configPda,
        matchPda,
        matchVault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const matchAccount = await program.account.match.fetch(matchPda);
    assert.equal(matchAccount.fixtureId.toNumber(), fixtureId.toNumber());
    assert.equal(matchAccount.homeTeam.trimEnd(), homeTeam);
    assert.equal(matchAccount.awayTeam.trimEnd(), awayTeam);
    assert.ok(matchAccount.vaultBump > 0, 'vault bump derived');
    assert.equal(matchAccount.totalDeposited.toNumber(), 0);

    const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
    assert.ok(vaultInfo !== null, 'vault PDA must exist after init_match');
    assert.ok(vaultInfo!.owner.equals(SystemProgram.programId), 'vault must be system-owned');
    assert.equal(vaultInfo!.data.length, 0, 'vault must have zero-size data');
    assert.ok(vaultInfo!.lamports > 0, 'vault must hold rent-exempt lamports');
  });

  it('2. open_round + place_bet sends SOL directly to vault', async () => {
    roundPda = PublicKey.findProgramAddressSync(
      [SEED_ROUND, matchPda.toBuffer(), roundId.toArrayLike(Buffer, 'le', 8)],
      program.programId,
    )[0];
    positionPda = PublicKey.findProgramAddressSync(
      [
        SEED_POSITION,
        fixtureId.toArrayLike(Buffer, 'le', 8),
        roundId.toArrayLike(Buffer, 'le', 8),
        admin.publicKey.toBuffer(),
      ],
      program.programId,
    )[0];

    await (program.methods
      .openRound(roundId, { varCheck: {} }, new anchor.BN(LOCK_SECS), new anchor.BN(DEADLINE_SECS)) as any)
      .accountsStrict({
        authority: admin.publicKey,
        matchPda,
        round: roundPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultBefore = await provider.connection.getBalance(vaultPda);

    await (program.methods
      .placeBet(fixtureId, roundId, 0 /* YES */, betAmount) as any)
      .accountsStrict({
        bettor: admin.publicKey,
        matchPda,
        matchVault: vaultPda,
        round: roundPda,
        position: positionPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAfter = await provider.connection.getBalance(vaultPda);
    assert.equal(
      vaultAfter - vaultBefore,
      betAmount.toNumber(),
      'vault balance must increase by bet amount',
    );

    const matchAccount = await program.account.match.fetch(matchPda);
    assert.equal(
      matchAccount.totalDeposited.toNumber(),
      betAmount.toNumber(),
      'match total_deposited = bet',
    );

    const roundAccount = await program.account.round.fetch(roundPda);
    assert.equal(roundAccount.totalYes.toNumber(), betAmount.toNumber());
  });

  it('3. second bettor places NO (opposing side)', async () => {
    const noPositionPda = PublicKey.findProgramAddressSync(
      [
        SEED_POSITION,
        fixtureId.toArrayLike(Buffer, 'le', 8),
        roundId.toArrayLike(Buffer, 'le', 8),
        bettor2.publicKey.toBuffer(),
      ],
      program.programId,
    )[0];

    const vaultBefore = await provider.connection.getBalance(vaultPda);

    await (program.methods
      .placeBet(fixtureId, roundId, 1 /* NO */, betAmount) as any)
      .accountsStrict({
        bettor: bettor2.publicKey,
        matchPda,
        matchVault: vaultPda,
        round: roundPda,
        position: noPositionPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor2])
      .rpc();

    const vaultAfter = await provider.connection.getBalance(vaultPda);
    assert.equal(
      vaultAfter - vaultBefore,
      betAmount.toNumber(),
      'vault balance increased by second bet',
    );

    const roundAccount = await program.account.round.fetch(roundPda);
    assert.equal(roundAccount.totalNo.toNumber(), betAmount.toNumber());
    assert.equal(
      roundAccount.totalYes.toNumber() + roundAccount.totalNo.toNumber(),
      betAmount.toNumber() * 2,
    );
  });

  it('4. settle_offchain + confirm + claim_winnings', async () => {
    // Wait for round to expire
    await new Promise(r => setTimeout(r, (DEADLINE_SECS + 1) * 1000));

    // Settle — YES wins (winner=1)
    await (program.methods
      .settleOffchainRound({ yes: {} }, 1) as any)
      .accountsStrict({
        caller: admin.publicKey,
        matchPda,
        round: roundPda,
      })
      .rpc();

    const roundSettled = await program.account.round.fetch(roundPda);
    assert.equal(roundSettled.winner, 1, 'YES (1) wins');

    // Wait finality for confirmRound
    await new Promise(r => setTimeout(r, 60000));

    await (program.methods
      .confirmRound() as any)
      .accountsStrict({
        caller: admin.publicKey,
        matchPda,
        round: roundPda,
      })
      .rpc();

    // Claim — YES should succeed, NO should fail
    const vaultBeforeClaim = await provider.connection.getBalance(vaultPda);
    const adminBefore = await provider.connection.getBalance(admin.publicKey);

    await (program.methods
      .claimWinnings(fixtureId, roundId) as any)
      .accountsStrict({
        winner: admin.publicKey,
        matchPda,
        round: roundPda,
        position: positionPda,
        matchVault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAfterClaim = await provider.connection.getBalance(vaultPda);
    const adminAfter = await provider.connection.getBalance(admin.publicKey);

    // Vault balance decreased — payout sent
    assert.ok(
      vaultAfterClaim < vaultBeforeClaim,
      'vault balance must decrease after claim',
    );
    // Admin received payout (minus tx fees)
    assert.ok(
      adminAfter > adminBefore,
      'winner must receive SOL',
    );
  });

  describe('Negative path tests', () => {
    const negBase = 54322;
    const negLock = 15;
    const negDeadline = 16;

    async function mkMatch(fid: number) {
      const fidBN = new anchor.BN(fid);
      const mPda = PublicKey.findProgramAddressSync(
        [SEED_MATCH, fidBN.toArrayLike(Buffer, 'le', 8)],
        program.programId,
      )[0];
      const vPda = PublicKey.findProgramAddressSync(
        [SEED_MATCH_VAULT, mPda.toBuffer()],
        program.programId,
      )[0];
      await (program.methods
        .initMatch(fidBN, 'Neg Home', 'Neg Away') as any)
        .accountsStrict({
          creator: admin.publicKey,
          config: configPda,
          matchPda: mPda,
          matchVault: vPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      return { fidBN, mPda, vPda };
    }

    async function mkRound(mPda: PublicKey, rId: anchor.BN, marketType: any) {
      const rPda = PublicKey.findProgramAddressSync(
        [SEED_ROUND, mPda.toBuffer(), rId.toArrayLike(Buffer, 'le', 8)],
        program.programId,
      )[0];
      await (program.methods
        .openRound(rId, marketType, new anchor.BN(negLock), new anchor.BN(negDeadline)) as any)
        .accountsStrict({
          authority: admin.publicKey,
          matchPda: mPda,
          round: rPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      return rPda;
    }

    it('open_round sets settlement_model correctly per market type', async () => {
      const cases: [number, any, boolean][] = [
        [negBase,     { varCheck: {} },     false],
        [negBase + 1, { penaltyShot: {} },  false],
        [negBase + 2, { nextGoalSide: {} }, false],
        [negBase + 3, { goalInWindow: {} }, true],
      ];

      for (const [fid, mt, expectOnChain] of cases) {
        const { mPda } = await mkMatch(fid);
        const rPda = await mkRound(mPda, new anchor.BN(1), mt);
        const acc = await program.account.round.fetch(rPda);
        if (expectOnChain) {
          assert.ok(acc.settlementModel.onChain !== undefined, `${fid}: expected OnChain`);
        } else {
          assert.ok(acc.settlementModel.offChain !== undefined, `${fid}: expected OffChain`);
        }
      }
    });

    it('settle_offchain_round accepts Home | Away | NoGoal | Yes | No | Cancelled', async () => {
      const outcomes: [any, number][] = [
        [{ home: {} }, 1],
        [{ away: {} }, 2],
        [{ noGoal: {} }, 3],
        [{ yes: {} }, 1],
        [{ no: {} }, 2],
        [{ cancelled: {} }, 0],
      ];

      for (let i = 0; i < outcomes.length; i++) {
        const [outcome, winner] = outcomes[i];
        const fid = negBase + 10 + i;
        const { mPda } = await mkMatch(fid);
        const rPda = await mkRound(mPda, new anchor.BN(1), { varCheck: {} });

        await new Promise(r => setTimeout(r, (negDeadline + 1) * 1000));

        await (program.methods
          .settleOffchainRound(outcome, winner) as any)
          .accountsStrict({
            caller: admin.publicKey,
            matchPda: mPda,
            round: rPda,
          })
          .rpc();

        const acc = await program.account.round.fetch(rPda);
        assert.equal(acc.winner, winner, `winner for ${JSON.stringify(outcome)}`);
      }
    });

    it('settle_round rejects offchain market with InvalidSettlementMethod', async () => {
      const fid = negBase + 20;
      const { mPda } = await mkMatch(fid);
      const rPda = await mkRound(mPda, new anchor.BN(1), { varCheck: {} });

      await new Promise(r => setTimeout(r, (negDeadline + 1) * 1000));

      const zero32 = new Array(32).fill(0);
      const dummyArgs = {
        ts: new anchor.BN(0),
        fixtureSummary: {
          fixtureId: new anchor.BN(0),
          updateStats: {
            updateCount: 0,
            minTimestamp: new anchor.BN(0),
            maxTimestamp: new anchor.BN(0),
          },
          eventsSubTreeRoot: zero32,
        },
        fixtureProof: [],
        mainTreeProof: [],
        predicate: { threshold: 0, comparison: { greaterThan: {} } },
        statA: {
          statToProve: { key: 0, value: 0, period: 0 },
          eventStatRoot: zero32,
          statProof: [],
        },
        statB: null,
        op: null,
      };

      const fake = Keypair.generate().publicKey;

      try {
        await (program.methods
          .settleRound(dummyArgs) as any)
          .accountsStrict({
            caller: admin.publicKey,
            matchPda: mPda,
            round: rPda,
            dailyScoresMerkleRoots: fake,
            txoracleProgram: fake,
          })
          .rpc();
        assert.fail('Expected InvalidSettlementMethod error');
      } catch (err: any) {
        assert.ok(
          err.toString().includes('InvalidSettlementMethod'),
          `Expected InvalidSettlementMethod, got: ${err}`,
        );
      }
    });

    it('settle_offchain_round rejects onchain market', async () => {
      const fid = negBase + 30;
      const { mPda } = await mkMatch(fid);
      const rPda = await mkRound(mPda, new anchor.BN(1), { goalInWindow: {} });

      await new Promise(r => setTimeout(r, (negDeadline + 1) * 1000));

      try {
        await (program.methods
          .settleOffchainRound({ yes: {} }, 1) as any)
          .accountsStrict({
            caller: admin.publicKey,
            matchPda: mPda,
            round: rPda,
          })
          .rpc();
        assert.fail('Expected InvalidSettlementMethod error');
      } catch (err: any) {
        assert.ok(
          err.toString().includes('InvalidSettlementMethod'),
          `Expected InvalidSettlementMethod, got: ${err}`,
        );
      }
    });
  });
});