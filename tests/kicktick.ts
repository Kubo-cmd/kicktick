// EXECUTION NOTE: This suite requires `anchor test`, which starts a local validator.
// This file is typechecked in CI without starting a validator or deploying the program.

import * as anchor from "@coral-xyz/anchor";
import { AnchorError, BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import assert from "node:assert/strict";
import type { Kicktick } from "../target/types/kicktick";

const CONFIG_SEED = Buffer.from("config");
const MATCH_SEED = Buffer.from("match");
const MATCH_VAULT_SEED = Buffer.from("match_vault");
const ROUND_SEED = Buffer.from("round");
const POSITION_SEED = Buffer.from("position");
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

const YES = 0;
const NO = 1;
const YES_WINNER = 1;
const NO_WINNER = 2;
const YES_STAKE = new BN(20_000_000);
const NO_STAKE = new BN(10_000_000);
const FINALITY_WAIT_MS = 61_000;

function i64(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

function u64(value: BN): Buffer {
  return value.toArrayLike(Buffer, "le", 8);
}

function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

function matchPda(programId: PublicKey, fixtureId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MATCH_SEED, i64(fixtureId)],
    programId,
  )[0];
}

function matchVaultPda(programId: PublicKey, matchAddress: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [MATCH_VAULT_SEED, matchAddress.toBuffer()],
    programId,
  )[0];
}

function roundPda(
  programId: PublicKey,
  matchAddress: PublicKey,
  roundId: BN,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ROUND_SEED, matchAddress.toBuffer(), u64(roundId)],
    programId,
  )[0];
}

function positionPda(
  programId: PublicKey,
  fixtureId: BN,
  roundId: BN,
  owner: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [POSITION_SEED, i64(fixtureId), u64(roundId), owner.toBuffer()],
    programId,
  )[0];
}

function penaltyShotMarket(): { penaltyShot: Record<string, never> } {
  return { penaltyShot: {} };
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof AnchorError) {
    return error.error.errorCode.code;
  }

  const candidate = error as {
    error?: { errorCode?: { code?: string } };
  };
  return candidate?.error?.errorCode?.code;
}

async function expectAnchorError(
  promise: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    assert.fail(`expected Anchor error ${expectedCode}`);
  } catch (error) {
    if (error instanceof assert.AssertionError) {
      throw error;
    }

    const actualCode = errorCode(error);
    const rendered = error instanceof Error ? error.message : String(error);
    assert.ok(
      actualCode?.toLowerCase() === expectedCode.toLowerCase() ||
        rendered.toLowerCase().includes(expectedCode.toLowerCase()),
      `expected ${expectedCode}, received ${actualCode ?? rendered}`,
    );
  }
}

async function fund(
  provider: anchor.AnchorProvider,
  recipient: PublicKey,
): Promise<void> {
  const signature = await provider.connection.requestAirdrop(
    recipient,
    2 * LAMPORTS_PER_SOL,
  );
  await provider.connection.confirmTransaction(signature, "confirmed");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe("kicktick", function () {
  this.timeout(1_000_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Kicktick as Program<Kicktick>;
  const admin = provider.wallet.publicKey;
  const yesBettor = Keypair.generate();
  const noBettor = Keypair.generate();
  const unauthorized = Keypair.generate();

  // Fixed IDs are safe because `anchor test` provisions a fresh local ledger.
  const fixtureId = new BN(42_424_242);
  const unauthorizedFixtureId = new BN(42_424_243);
  const happyRoundId = new BN(1);
  const cancelledRoundId = new BN(2);
  const shortLockRoundId = new BN(101);
  const longLockRoundId = new BN(102);
  const longDeadlineRoundId = new BN(103);
  const zeroAmountRoundId = new BN(104);
  const invalidSideRoundId = new BN(105);
  const unauthorizedOpenRoundId = new BN(106);
  const inconsistentSettlementRoundId = new BN(107);
  const invalidMarketOutcomeRoundId = new BN(109);
  const earlySettlementRoundId = new BN(110);
  const disabledOnchainRoundId = new BN(111);

  const config = configPda(program.programId);
  const programData = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
  const matchAddress = matchPda(program.programId, fixtureId);
  const matchVault = matchVaultPda(program.programId, matchAddress);

  function roundAddress(roundId: BN): PublicKey {
    return roundPda(program.programId, matchAddress, roundId);
  }

  function positionAddress(roundId: BN, owner: PublicKey): PublicKey {
    return positionPda(program.programId, fixtureId, roundId, owner);
  }

  async function openRound(
    roundId: BN,
    lockSeconds = new BN(15),
    deadlineSeconds = new BN(300),
  ): Promise<void> {
    await program.methods
      .openRound(
        roundId,
        penaltyShotMarket(),
        lockSeconds,
        deadlineSeconds,
      )
      .accountsStrict({
        authority: admin,
        config,
        matchPda: matchAddress,
        round: roundAddress(roundId),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async function placeBet(
    bettor: Keypair,
    roundId: BN,
    side: number,
    amount: BN,
  ): Promise<void> {
    await program.methods
      .placeBet(fixtureId, roundId, side, amount)
      .accountsStrict({
        bettor: bettor.publicKey,
        matchPda: matchAddress,
        matchVault,
        round: roundAddress(roundId),
        position: positionAddress(roundId, bettor.publicKey),
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor])
      .rpc();
  }

  before("funds ephemeral test signers", async () => {
    await Promise.all([
      fund(provider, yesBettor.publicKey),
      fund(provider, noBettor.publicKey),
      fund(provider, unauthorized.publicKey),
    ]);
  });

  it("initializes the global config PDA", async () => {
    await program.methods
      .initConfig()
      .accountsStrict({
        admin,
        program: program.programId,
        programData,
        config,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.config.fetch(config);
    assert.ok(state.admin.equals(admin));
    assert.equal(state.finalityDelay.toNumber(), 60);
    assert.equal(state.minLiquidity.toNumber(), 10_000_000);
  });

  it("rejects match initialization by a non-admin signer", async () => {
    const unauthorizedMatch = matchPda(
      program.programId,
      unauthorizedFixtureId,
    );
    const unauthorizedVault = matchVaultPda(
      program.programId,
      unauthorizedMatch,
    );

    await expectAnchorError(
      program.methods
        .initMatch(unauthorizedFixtureId, "Wrong", "Signer")
        .accountsStrict({
          creator: unauthorized.publicKey,
          config,
          matchPda: unauthorizedMatch,
          matchVault: unauthorizedVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized",
    );
  });

  it("initializes a match and its system-owned vault", async () => {
    await program.methods
      .initMatch(fixtureId, "Kick FC", "Tick United")
      .accountsStrict({
        creator: admin,
        config,
        matchPda: matchAddress,
        matchVault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.match.fetch(matchAddress);
    const vault = await provider.connection.getAccountInfo(matchVault);

    assert.ok(state.fixtureId.eq(fixtureId));
    assert.equal(state.homeTeam, "Kick FC");
    assert.equal(state.awayTeam, "Tick United");
    assert.deepEqual(state.status, { pending: {} });
    assert.ok(vault);
    assert.ok(vault.owner.equals(SystemProgram.programId));
  });

  it("rejects lock durations below 15 seconds", async () => {
    await expectAnchorError(
      openRound(shortLockRoundId, new BN(14)),
      "InvalidLockDuration",
    );
  });

  it("rejects on-chain markets until oracle settlement is implemented", async () => {
    await expectAnchorError(
      program.methods
        .openRound(
          disabledOnchainRoundId,
          { goalInWindow: {} },
          new BN(15),
          new BN(300),
        )
        .accountsStrict({
          authority: admin,
          config,
          matchPda: matchAddress,
          round: roundAddress(disabledOnchainRoundId),
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "OnchainSettlementDisabled",
    );
  });

  it("rejects lock durations above 300 seconds", async () => {
    await expectAnchorError(
      openRound(longLockRoundId, new BN(301)),
      "InvalidLockDuration",
    );
  });

  it("rejects deadlines above 300 seconds", async () => {
    await expectAnchorError(
      openRound(longDeadlineRoundId, new BN(15), new BN(301)),
      "InvalidDeadline",
    );
  });

  it("rejects deadlines earlier than the market lock", async () => {
    await expectAnchorError(
      openRound(new BN(108), new BN(30), new BN(29)),
      "InvalidDeadline",
    );
  });

  it("rejects round creation by a non-admin signer", async () => {
    await expectAnchorError(
      program.methods
        .openRound(
          unauthorizedOpenRoundId,
          penaltyShotMarket(),
          new BN(15),
          new BN(300),
        )
        .accountsStrict({
          authority: unauthorized.publicKey,
          config,
          matchPda: matchAddress,
          round: roundAddress(unauthorizedOpenRoundId),
          systemProgram: SystemProgram.programId,
        })
        .signers([unauthorized])
        .rpc(),
      "Unauthorized",
    );
  });

  it("opens the happy-path off-chain round", async () => {
    await openRound(happyRoundId);

    const state = await program.account.round.fetch(
      roundAddress(happyRoundId),
    );
    assert.ok(state.matchPda.equals(matchAddress));
    assert.ok(state.roundId.eq(happyRoundId));
    assert.deepEqual(state.marketType, { penaltyShot: {} });
    assert.deepEqual(state.settlementModel, { offChain: {} });
    assert.deepEqual(state.status, { open: {} });
  });

  it("rejects a zero-value bet", async () => {
    await openRound(zeroAmountRoundId);
    await expectAnchorError(
      placeBet(yesBettor, zeroAmountRoundId, YES, new BN(0)),
      "ZeroAmount",
    );
  });

  it("rejects a side greater than ABSTAIN", async () => {
    await openRound(invalidSideRoundId);
    await expectAnchorError(
      placeBet(noBettor, invalidSideRoundId, 3, new BN(1_000_000)),
      "InvalidSide",
    );
  });

  it("places YES and NO bets and records both positions", async () => {
    await placeBet(yesBettor, happyRoundId, YES, YES_STAKE);
    await placeBet(noBettor, happyRoundId, NO, NO_STAKE);

    const [round, yesPosition, noPosition, matchState] = await Promise.all([
      program.account.round.fetch(roundAddress(happyRoundId)),
      program.account.position.fetch(
        positionAddress(happyRoundId, yesBettor.publicKey),
      ),
      program.account.position.fetch(
        positionAddress(happyRoundId, noBettor.publicKey),
      ),
      program.account.match.fetch(matchAddress),
    ]);

    assert.ok(round.totalYes.eq(YES_STAKE));
    assert.ok(round.totalNo.eq(NO_STAKE));
    assert.equal(yesPosition.side, YES);
    assert.ok(yesPosition.amount.eq(YES_STAKE));
    assert.equal(yesPosition.version, 2);
    assert.equal(noPosition.side, NO);
    assert.ok(noPosition.amount.eq(NO_STAKE));
    assert.equal(noPosition.version, 2);
    assert.ok(matchState.totalDeposited.eq(YES_STAKE.add(NO_STAKE)));
  });

  it("rejects mixing sides in one position PDA", async () => {
    await expectAnchorError(
      placeBet(yesBettor, happyRoundId, NO, new BN(1_000_000)),
      "PositionSideMismatch",
    );
  });

  it("rejects betting after a round has been cancelled", async () => {
    await openRound(cancelledRoundId);
    await program.methods
      .cancelRound()
      .accountsStrict({
        authority: admin,
        config,
        round: roundAddress(cancelledRoundId),
      })
      .rpc();

    await expectAnchorError(
      placeBet(noBettor, cancelledRoundId, NO, new BN(1_000_000)),
      "RoundNotOpen",
    );

    const state = await program.account.round.fetch(
      roundAddress(cancelledRoundId),
    );
    assert.deepEqual(state.status, { cancelled: {} });
    assert.equal(state.winner, 0);
  });

  it("rejects inconsistent outcome and winner data", async () => {
    await openRound(inconsistentSettlementRoundId);
    await expectAnchorError(
      program.methods
        .settleOffchainRound({ yes: {} }, NO_WINNER)
        .accountsStrict({
          caller: admin,
          config,
          matchPda: matchAddress,
          round: roundAddress(inconsistentSettlementRoundId),
        })
        .rpc(),
      "OutcomeWinnerMismatch",
    );
  });

  it("rejects outcomes that are invalid for an off-chain market", async () => {
    await openRound(invalidMarketOutcomeRoundId);
    await expectAnchorError(
      program.methods
        .settleOffchainRound({ home: {} }, YES_WINNER)
        .accountsStrict({
          caller: admin,
          config,
          matchPda: matchAddress,
          round: roundAddress(invalidMarketOutcomeRoundId),
        })
        .rpc(),
      "InvalidMarketOutcome",
    );
  });

  it("rejects off-chain settlement before the betting lock time", async () => {
    await openRound(earlySettlementRoundId);
    await expectAnchorError(
      program.methods
        .settleOffchainRound({ yes: {} }, YES_WINNER)
        .accountsStrict({
          caller: admin,
          config,
          matchPda: matchAddress,
          round: roundAddress(earlySettlementRoundId),
        })
        .rpc(),
      "BettingWindowStillOpen",
    );
  });

  it("rejects settlement when the selected winning side has no stake", async () => {
    await sleep(16_000);
    await expectAnchorError(
      program.methods
        .settleOffchainRound({ yes: {} }, YES_WINNER)
        .accountsStrict({
          caller: admin,
          config,
          matchPda: matchAddress,
          round: roundAddress(earlySettlementRoundId),
        })
        .rpc(),
      "EmptyWinningPool",
    );
  });

  it("settles the happy-path round with YES as winner", async () => {
    await program.methods
      .settleOffchainRound({ yes: {} }, YES_WINNER)
      .accountsStrict({
        caller: admin,
        config,
        matchPda: matchAddress,
        round: roundAddress(happyRoundId),
      })
      .rpc();

    const state = await program.account.round.fetch(
      roundAddress(happyRoundId),
    );
    assert.deepEqual(state.status, { resolvedPending: {} });
    assert.deepEqual(state.outcome, { yes: {} });
    assert.equal(state.winner, YES_WINNER);
  });

  it("enforces finality, confirms settlement, and pays the YES winner", async () => {
    await expectAnchorError(
      program.methods
        .confirmRound()
        .accountsStrict({
          caller: admin,
          round: roundAddress(happyRoundId),
        })
        .rpc(),
      "FinalityDelayNotElapsed",
    );

    await sleep(FINALITY_WAIT_MS);

    await program.methods
      .confirmRound()
      .accountsStrict({
        caller: admin,
        round: roundAddress(happyRoundId),
      })
      .rpc();

    const vaultBefore = await provider.connection.getBalance(matchVault);
    const winnerBefore = await provider.connection.getBalance(
      yesBettor.publicKey,
    );

    await program.methods
      .claimWinnings(fixtureId, happyRoundId)
      .accountsStrict({
        winner: yesBettor.publicKey,
        matchPda: matchAddress,
        round: roundAddress(happyRoundId),
        position: positionAddress(happyRoundId, yesBettor.publicKey),
        matchVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([yesBettor])
      .rpc();

    const [round, position, vaultAfter, winnerAfter] = await Promise.all([
      program.account.round.fetch(roundAddress(happyRoundId)),
      program.account.position.fetch(
        positionAddress(happyRoundId, yesBettor.publicKey),
      ),
      provider.connection.getBalance(matchVault),
      provider.connection.getBalance(yesBettor.publicKey),
    ]);

    const expectedPayout = YES_STAKE.add(NO_STAKE).toNumber();
    assert.deepEqual(round.status, { settled: {} });
    assert.equal(position.claimed, true);
    assert.equal(vaultBefore - vaultAfter, expectedPayout);
    assert.ok(winnerAfter > winnerBefore);
  });
});
