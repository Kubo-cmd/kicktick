#!/usr/bin/env npx ts-node
// Devnet verification: deposit → initMatch → openRound → placeBet → settleOffchain → confirm → claim
// Usage: npx ts-node scripts/verify-devnet.ts
// Each step prints tx signature — paste into https://solscan.io/tx/XXX?cluster=devnet

import * as anchor from '@anchor-lang/core';
import { Program, Wallet } from '@anchor-lang/core';
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

import { Kicktick } from '../target/types/kicktick';

// Seed constants (must match Rust program)
const SEED_CONFIG = Buffer.from('config');
const SEED_MATCH = Buffer.from('match');
const SEED_MATCH_VAULT = Buffer.from('match_vault');
const SEED_SESSION_BUDGET = Buffer.from('session_budget');
const SEED_ROUND = Buffer.from('round');
const SEED_POSITION = Buffer.from('position');

function loadDeployer(): Keypair {
  const walletPath = path.resolve(__dirname, '..', 'kicktick-deployer.json');
  const data = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function fixtureIdBuf(id: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(id));
  return buf;
}

function roundIdBuf(id: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(id));
  return buf;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const url = 'https://api.devnet.solana.com';
  console.log(`\n=== KickTick Devnet Verification ===\n`);

  const deployer = loadDeployer();
  const connection = new anchor.web3.Connection(url, 'confirmed');
  const wallet = new Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.Kicktick as Program<Kicktick>;
  const programId = program.programId;

  // ── Derive PDAs ──
  const [configPda] = PublicKey.findProgramAddressSync([SEED_CONFIG], programId);
  console.log(`Config PDA:   ${configPda.toBase58()}`);

  const fixtureId = Math.floor(Date.now() / 1000); // unique per run
  const roundId = 1;
  const homeTeam = 'FC Barcelona';
  const awayTeam = 'Real Madrid';
  const depositAmount = new anchor.BN(0.05 * LAMPORTS_PER_SOL); // 0.05 SOL
  const betAmount = new anchor.BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL

  const [matchPda] = PublicKey.findProgramAddressSync(
    [SEED_MATCH, fixtureIdBuf(fixtureId)],
    programId,
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [SEED_MATCH_VAULT, matchPda.toBuffer()],
    programId,
  );
  const [budgetPda] = PublicKey.findProgramAddressSync(
    [SEED_SESSION_BUDGET, deployer.publicKey.toBuffer(), matchPda.toBuffer()],
    programId,
  );
  const [roundPda] = PublicKey.findProgramAddressSync(
    [SEED_ROUND, matchPda.toBuffer(), roundIdBuf(roundId)],
    programId,
  );
  const [positionPda] = PublicKey.findProgramAddressSync(
    [SEED_POSITION, fixtureIdBuf(fixtureId), roundIdBuf(roundId), deployer.publicKey.toBuffer()],
    programId,
  );

  console.log(`Fixture ID:   ${fixtureId}`);
  console.log(`Match PDA:    ${matchPda.toBase58()}`);
  console.log(`Vault PDA:    ${vaultPda.toBase58()}`);
  console.log(`Budget PDA:   ${budgetPda.toBase58()}`);
  console.log(`Round PDA:    ${roundPda.toBase58()}`);
  console.log(`Position PDA: ${positionPda.toBase58()}`);
  console.log('');

  // ── Step 0: Check Config ──
  const configAcct = await connection.getAccountInfo(configPda);
  if (!configAcct) {
    console.log('Config not found — call scripts/init-kicktick.ts first');
    process.exit(1);
  }
  console.log('✅ Config initialized\n');

  // ── Step 1: Init Match ──
  const matchExists = await connection.getAccountInfo(matchPda);
  if (!matchExists) {
    console.log('--- initMatch ---');
    const tx = await (program.methods.initMatch(
      new anchor.BN(fixtureId),
      homeTeam,
      awayTeam,
    ) as any).accountsStrict({
      creator: deployer.publicKey,
      config: configPda,
      matchPda: matchPda,
      systemProgram: SystemProgram.programId,
    }).rpc();
    console.log(`Tx: ${tx}`);
    console.log(`https://solscan.io/tx/${tx}?cluster=devnet\n`);
  } else {
    console.log('⏭️  Match exists\n');
  }

  // ── Step 2: Fund Session Budget (deposit SOL → vault) ──
  console.log('--- fundSessionBudget ---');
  const tx1 = await (program.methods.fundSessionBudget(depositAmount) as any).accountsStrict({
    user: deployer.publicKey,
    budget: budgetPda,
    matchPda: matchPda,
    matchVault: vaultPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log(`Tx: ${tx1}`);
  console.log(`https://solscan.io/tx/${tx1}?cluster=devnet\n`);

  // ── Step 3: Open Round (OffChain market — VARCheck) ──
  console.log('--- openRound ---');
  const lockSeconds = 15;
  const deadlineSeconds = 16;
  // MarketType: 0=NextGoalSide, 1=GoalInWindow, ..., 10=VARCheck (OffChain)
  const marketType = { varCheck: {} };

  const tx2 = await (program.methods.openRound(
    new anchor.BN(roundId),
    marketType,
    new anchor.BN(lockSeconds),
    new anchor.BN(deadlineSeconds),
  ) as any).accountsStrict({
    authority: deployer.publicKey,
    matchPda: matchPda,
    round: roundPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log(`Tx: ${tx2}`);
  console.log(`https://solscan.io/tx/${tx2}?cluster=devnet\n`);

  // ── Step 4: Place Bet (YES side = 0) ──
  // NOTE: side 0=YES, 1=NO. Winner mapping: 1=YES, 2=NO.
  // Fix in claim.rs:56 — round.winner-1 == position.side.
  console.log('--- placeBet ---');
  const tx3 = await (program.methods.placeBet(
    new anchor.BN(fixtureId),
    new anchor.BN(roundId),
    0, // side: YES
    betAmount,
  ) as any).accountsStrict({
    bettor: deployer.publicKey,
    budget: budgetPda,
    matchPda: matchPda,
    round: roundPda,
    position: positionPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log(`Tx: ${tx3}`);
  console.log(`https://solscan.io/tx/${tx3}?cluster=devnet\n`);

  // ── Verify round state ──
  const roundAcct = await connection.getAccountInfo(roundPda);
  if (roundAcct) {
    console.log(`Round account: ${roundAcct.data.length} bytes, owner: ${roundAcct.owner.toBase58()}`);
  }
  const budgetAcct = await connection.getAccountInfo(budgetPda);
  if (budgetAcct) {
    console.log(`Budget account: ${budgetAcct.data.length} bytes`);
  }
  const positionAcct = await connection.getAccountInfo(positionPda);
  if (positionAcct) {
    console.log(`Position account: ${positionAcct.data.length} bytes`);
  }

  // ── Step 5: Settle OffChain (no txoracle CPI needed) ──
  console.log('\n--- settleOffchainRound ---');
  // Wait for deadline to pass (expires_at = now + deadlineSeconds)
  console.log(`Waiting ${deadlineSeconds + 5}s for deadline...`);
  await sleep((deadlineSeconds + 5) * 1000);

  const tx4 = await (program.methods.settleOffchainRound(
    { yes: {} }, // RoundOutcome::Yes
    1, // winner: 1 = Yes (from Solana side index)
  ) as any).accountsStrict({
    caller: deployer.publicKey,
    matchPda: matchPda,
    round: roundPda,
  }).rpc();
  console.log(`Tx: ${tx4}`);
  console.log(`https://solscan.io/tx/${tx4}?cluster=devnet\n`);

  // ── Step 6: Confirm Round (after 60s finality delay) ──
  console.log('--- confirmRound (waiting 60s for finality delay) ---');
  console.log('Waiting 65 seconds...');
  await sleep(65000);

  const tx5 = await (program.methods.confirmRound() as any).accountsStrict({
    caller: deployer.publicKey,
    matchPda: matchPda,
    round: roundPda,
  }).rpc();
  console.log(`Tx: ${tx5}`);
  console.log(`https://solscan.io/tx/${tx5}?cluster=devnet\n`);

  // ── Step 7: Claim Winnings ──
  console.log('--- claimWinnings ---');
  const tx6 = await (program.methods.claimWinnings(
    new anchor.BN(fixtureId),
    new anchor.BN(roundId),
  ) as any).accountsStrict({
    winner: deployer.publicKey,
    matchPda: matchPda,
    round: roundPda,
    position: positionPda,
    matchVault: vaultPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log(`Tx: ${tx6}`);
  console.log(`https://solscan.io/tx/${tx6}?cluster=devnet\n`);

  console.log('✅ Full loop verified!');
  console.log('Check every tx on Solscan:');
  console.log(`  https://solscan.io/tx/${tx1}?cluster=devnet`);
  console.log(`  https://solscan.io/tx/${tx2}?cluster=devnet`);
  console.log(`  https://solscan.io/tx/${tx3}?cluster=devnet`);
  console.log(`  https://solscan.io/tx/${tx4}?cluster=devnet`);
  console.log(`  https://solscan.io/tx/${tx5}?cluster=devnet`);
  console.log(`  https://solscan.io/tx/${tx6}?cluster=devnet`);
}

main().catch((err) => {
  console.error('verify-devnet failed:', err);
  process.exit(1);
});
