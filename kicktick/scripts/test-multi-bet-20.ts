#!/usr/bin/env npx ts-node
import * as anchor from '@anchor-lang/core';
import { Program } from '@anchor-lang/core';
import {
  PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Buffer } from 'buffer';

import { Kicktick } from '../target/types/kicktick';

const SEED_CONFIG = Buffer.from('config');
const SEED_MATCH = Buffer.from('match');
const SEED_MATCH_VAULT = Buffer.from('match_vault');
const SEED_ROUND = Buffer.from('round');
const SEED_POSITION = Buffer.from('position');

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function i64Buf(id: number): Buffer {
  const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(id)); return b;
}
function u64Buf(id: number): Buffer {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(id)); return b;
}
function fmtSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

interface BetCfg {
  label: string;
  w: Keypair;
  side: number;
  betLamports: number;
}

function makeBetCfg(label: string, side: number, sol: number): BetCfg {
  return { label, w: Keypair.generate(), side, betLamports: sol * LAMPORTS_PER_SOL };
}

async function main() {
  const conn = new anchor.web3.Connection('http://localhost:8899', 'confirmed');
  const deployer = Keypair.generate();

  // 20 wallets: 10 YES, 6 NO, 4 ABSTAIN
  const betConfig: BetCfg[] = [
    makeBetCfg('YES-01', 0, 0.8),
    makeBetCfg('YES-02', 0, 0.3),
    makeBetCfg('YES-03', 0, 1.5),
    makeBetCfg('YES-04', 0, 0.6),
    makeBetCfg('YES-05', 0, 2.0),
    makeBetCfg('YES-06', 0, 0.4),
    makeBetCfg('YES-07', 0, 1.1),
    makeBetCfg('YES-08', 0, 0.7),
    makeBetCfg('YES-09', 0, 0.9),
    makeBetCfg('YES-10', 0, 1.3),
    makeBetCfg('NO-01', 1, 0.5),
    makeBetCfg('NO-02', 1, 0.2),
    makeBetCfg('NO-03', 1, 0.8),
    makeBetCfg('NO-04', 1, 1.0),
    makeBetCfg('NO-05', 1, 0.3),
    makeBetCfg('NO-06', 1, 0.6),
    makeBetCfg('ABST-01', 2, 0.5),
    makeBetCfg('ABST-02', 2, 0.3),
    makeBetCfg('ABST-03', 2, 0.1),
    makeBetCfg('ABST-04', 2, 0.1),
  ];
  const YES_BETS = betConfig.filter(b => b.side === 0);
  const NO_BETS = betConfig.filter(b => b.side === 1);
  const ABST_BETS = betConfig.filter(b => b.side === 2);

  const fixtureId = Math.floor(Date.now() / 1000);
  const roundId = 1;
  const LOCK_SECS = 15;
  const DEADLINE_SECS = 16;

  console.log('=== Airdrop ===');
  const allWallets = [deployer, ...betConfig.map(b => b.w)];
  for (const w of allWallets) {
    const sig = await conn.requestAirdrop(w.publicKey, 5 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, 'confirmed');
  }
  console.log(`  Deployer + ${betConfig.length} wallets funded (5 SOL each)`);

  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(deployer), {});
  anchor.setProvider(provider);
  const idl = require('../target/idl/kicktick.json');
  const program = new Program<Kicktick>(idl as Kicktick, provider) as any;
  const progId = program.programId as PublicKey;

  const configPda = PublicKey.findProgramAddressSync([SEED_CONFIG], progId)[0];
  const matchPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH, i64Buf(fixtureId)], progId)[0];
  const vaultPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH_VAULT, matchPda.toBuffer()], progId)[0];
  const roundPda = PublicKey.findProgramAddressSync(
    [SEED_ROUND, matchPda.toBuffer(), u64Buf(roundId)], progId)[0];

  function posPdaOf(pk: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [SEED_POSITION, i64Buf(fixtureId), u64Buf(roundId), pk.toBuffer()], progId)[0];
  }

  console.log('\n--- initConfig ---');
  if (!(await conn.getAccountInfo(configPda))) {
    await (program.methods.initConfig() as any)
      .accountsStrict({ admin: deployer.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('  OK');
  } else {
    console.log('  skip (exists)');
  }

  console.log('\n--- initMatch ---');
  await (program.methods.initMatch(new anchor.BN(fixtureId), 'HOME', 'AWAY') as any)
    .accountsStrict({
      creator: deployer.publicKey, config: configPda, matchPda, matchVault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log('  OK');

  console.log('\n--- openRound (VARCheck) ---');
  await (program.methods.openRound(
    new anchor.BN(roundId), { varCheck: {} }, new anchor.BN(LOCK_SECS), new anchor.BN(DEADLINE_SECS),
  ) as any)
    .accountsStrict({ authority: deployer.publicKey, matchPda, round: roundPda, systemProgram: SystemProgram.programId })
    .rpc();
  console.log('  OK');

  console.log('\n=== Place bets ===');
  for (const bc of betConfig) {
    await (program.methods.placeBet(
      new anchor.BN(fixtureId), new anchor.BN(roundId), bc.side, new anchor.BN(bc.betLamports),
    ) as any)
      .accountsStrict({
        bettor: bc.w.publicKey, matchPda, matchVault: vaultPda, round: roundPda,
        position: posPdaOf(bc.w.publicKey), systemProgram: SystemProgram.programId,
      })
      .signers([bc.w])
      .rpc();
    console.log(`  ${bc.label.padEnd(8)} side=${bc.side} ${fmtSol(bc.betLamports)} SOL`);
    await sleep(100);
  }

  const roundAcc = await program.account.round.fetch(roundPda);
  const yesPool = roundAcc.totalYes.toNumber();
  const noPool = roundAcc.totalNo.toNumber();
  const abstPool = roundAcc.totalAbstain.toNumber();
  const totalPool = yesPool + noPool + abstPool;

  console.log(`\n=== Pool ===`);
  console.log(`  YES:     ${fmtSol(yesPool)} SOL (${YES_BETS.length} bettors)`);
  console.log(`  NO:      ${fmtSol(noPool)} SOL (${NO_BETS.length} bettors)`);
  console.log(`  ABSTAIN: ${fmtSol(abstPool)} SOL (${ABST_BETS.length} bettors)`);
  console.log(`  TOTAL:   ${fmtSol(totalPool)} SOL`);

  const expectedPool = betConfig.reduce((s, b) => s + b.betLamports, 0);
  if (totalPool !== expectedPool) {
    console.error(`  POOL MISMATCH! got=${totalPool} exp=${expectedPool}`);
    process.exit(1);
  }
  console.log('  Pool OK');

  const ratio = totalPool / yesPool;
  console.log(`\n=== Expected payouts (YES wins, winner=1) ===`);
  console.log(`  Multiplier: ${fmtSol(totalPool)} / ${fmtSol(yesPool)} = ${ratio.toFixed(4)}x`);
  const expectedPayouts = new Map<string, number>();
  for (const bc of YES_BETS) {
    const payout = Math.floor((bc.betLamports / yesPool) * totalPool);
    expectedPayouts.set(bc.label, payout);
    const net = payout - bc.betLamports;
    const roi = ((payout - bc.betLamports) / bc.betLamports * 100).toFixed(1);
    console.log(`  ${bc.label.padEnd(8)} bet=${fmtSol(bc.betLamports)} -> ${fmtSol(payout)} (net +${fmtSol(net)}, ROI ${roi}%)`);
  }

  console.log(`\n--- settleOffchainRound (wait ${DEADLINE_SECS + 2}s) ---`);
  await sleep((DEADLINE_SECS + 2) * 1000);
  await (program.methods.settleOffchainRound({ yes: {} }, 1) as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc();
  console.log('  OK');

  console.log('\n--- confirmRound (wait 62s) ---');
  await sleep(62000);
  await (program.methods.confirmRound() as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc();
  console.log('  OK');

  console.log(`\n=== Claim ===`);
  console.log(`Label     | Before    | After     | Net Delta | Exp Payout | Match |`);
  console.log('-' .repeat(85));
  let totalDistributed = 0;
  let errors = 0;
  for (const bc of betConfig) {
    const balBefore = await conn.getBalance(bc.w.publicKey);
    const expectedLamports = expectedPayouts.get(bc.label) ?? 0;

    try {
      await (program.methods.claimWinnings(new anchor.BN(fixtureId), new anchor.BN(roundId)) as any)
        .accountsStrict({
          winner: bc.w.publicKey, matchPda, round: roundPda,
          position: posPdaOf(bc.w.publicKey), matchVault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([bc.w])
        .rpc();
      const balAfter = await conn.getBalance(bc.w.publicKey);
      const net = balAfter - balBefore;
      const match = Math.abs(net - expectedLamports) <= 10000 ? 'OK' : 'MISMATCH';
      if (match !== 'OK') errors++;
      totalDistributed += net;
      console.log(`  ${bc.label.padEnd(8)}| ${fmtSol(balBefore)} | ${fmtSol(balAfter)} | ${fmtSol(net).padEnd(10)}| ${fmtSol(expectedLamports).padEnd(11)}| ${match}`);
    } catch {
      const isWinner = bc.side === 0;
      if (isWinner) {
        console.log(`  ${bc.label.padEnd(8)}| ${fmtSol(balBefore)} | --       | CLAIM_FAIL | --         | ERROR`);
        errors++;
      } else {
        console.log(`  ${bc.label.padEnd(8)}| ${fmtSol(balBefore)} | --       | REJECTED   | 0          | OK (expected)`);
      }
    }
    await sleep(100);
  }

  console.log(`\n=== Summary ===`);
  console.log(`  TOTAL POOL:   ${fmtSol(totalPool)} SOL`);
  console.log(`  YES pool:     ${fmtSol(yesPool)} SOL x ${YES_BETS.length} bettors`);
  console.log(`  NO pool:      ${fmtSol(noPool)} SOL x ${NO_BETS.length} bettors`);
  console.log(`  ABSTAIN pool: ${fmtSol(abstPool)} SOL x ${ABST_BETS.length} bettors`);
  console.log(`  Distributed:  ${fmtSol(totalDistributed)} SOL`);
  console.log(`  Payout ratio: ${ratio.toFixed(4)}x`);
  console.log(`  Errors:       ${errors}`);

  if (errors > 0) {
    console.error('\n  Some payouts did not match expected values');
    process.exit(1);
  }
  console.log('\n  All payouts verified OK');
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });