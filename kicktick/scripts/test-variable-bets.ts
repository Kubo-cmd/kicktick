#!/usr/bin/env npx ts-node
// Variable bets test: small bets (≤0.01), compare pool states, verify payouts.
import * as anchor from '@anchor-lang/core';
import { Program } from '@anchor-lang/core';
import {
  PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
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

const PRIV_KEYS_B58 = [
  '33HJAFJNim56YWKZizY5Z3BMmZZorQZZZxBnUd1mkERLaxcUmSghVu9J1QVV5zA4y11NmXZ7AtGeARgShd6kTxtT',
  '31u2xTguBj9YCyKYCLe8Ut3pcBhvt3MU5dYQ19B7wJCWv5M6zEFWvRdJdwUWUsyGD5mGcisGUbSwoK1c2HM4Co38',
  '3By4H7QWHxQqbDZ5bPLxRx75fjZWkCL6tmGSubSspjyBn1ZYLwEUj1Tz2rWL1L8i12UYzf9EnBzejjkfAQnexPBR',
  '5wvgcTijzbvGa34o25uxroe3E6cA4U4yutC8Sb71EfQFeL5XLQz1aDHF7LJYoJATpqi1mCaSi9MasTAEmWRidmER',
  '2nYrzMpW3T7pqvhoGpotkwc2L4DkNzcabkYYAETquuHrbKgvGdV13k9Eap5ySLRmPtZmmpS26SgWUXDmMM8DDtVS',
];

async function main() {
  const conn = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '..', 'kicktick-deployer.json'), 'utf-8'))));
  const bs58 = require('bs58');
  const wallets = PRIV_KEYS_B58.map(b58 =>
    Keypair.fromSecretKey(Uint8Array.from(bs58.decode(b58))));

  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(deployer), {});
  anchor.setProvider(provider);
  const idl = require('../target/idl/kicktick.json');
  const program = new Program<Kicktick>(idl as Kicktick, provider) as any;

  const configPda = PublicKey.findProgramAddressSync([SEED_CONFIG], program.programId)[0];
  if (!(await conn.getAccountInfo(configPda))) {
    console.error('Config not initialized! Run init-kicktick.ts first');
    process.exit(1);
  }

  const fixtureId = Math.floor(Date.now() / 1000);
  const roundId = 1;
  const MIN_DURATION = 15;
  const deadlineSec = 40;
  const MIN_WALLET_BALANCE = 0.015 * LAMPORTS_PER_SOL; // bet + tx fees

  async function rpcWithRetry<T>(fn: () => Promise<T>, retries = 8): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try { return await fn(); }
      catch (e: any) {
        if (e.message?.includes('429') && i < retries - 1) {
          const delay = Math.min(2000 * (2 ** i), 30000);
          console.log(`  ⏳ 429, retry ${i+1}/${retries-1} in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        throw e;
      }
    }
    throw new Error('Max retries');
  }

  // === Bet config ===
  interface BetCfg {
    label: string; w: Keypair; side: number; betLamports: number;
  }

  const betConfig: BetCfg[] = [
    { label: 'YES-1', w: wallets[0], side: 0, betLamports: 0.01 * LAMPORTS_PER_SOL },
    { label: 'YES-2', w: wallets[1], side: 0, betLamports: 0.01 * LAMPORTS_PER_SOL },
    { label: 'YES-3', w: wallets[2], side: 0, betLamports: 0.01 * LAMPORTS_PER_SOL },
    { label: 'NO-1',  w: wallets[3], side: 1, betLamports: 0.01 * LAMPORTS_PER_SOL },
    { label: 'NO-2',  w: wallets[4], side: 1, betLamports: 0.01 * LAMPORTS_PER_SOL },
    { label: 'NO-3',  w: deployer,    side: 1, betLamports: 0.01 * LAMPORTS_PER_SOL },
  ];

  // === PDAs ===
  const matchPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH, i64Buf(fixtureId)], program.programId)[0];
  const vaultPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH_VAULT, matchPda.toBuffer()], program.programId)[0];
  const roundPda = PublicKey.findProgramAddressSync(
    [SEED_ROUND, matchPda.toBuffer(), u64Buf(roundId)], program.programId)[0];

  function posPdaOf(pk: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [SEED_POSITION, i64Buf(fixtureId), u64Buf(roundId), pk.toBuffer()], program.programId)[0];
  }

  console.log(`Fixture: ${fixtureId}  Match: ${matchPda.toBase58()}`);

  // ===== 1. Check wallet balances =====
  console.log('\n=== Wallets ===');
  for (const bc of betConfig) {
    const bal = await conn.getBalance(bc.w.publicKey);
    const ok = bal >= MIN_WALLET_BALANCE;
    console.log(`  ${bc.label.padEnd(6)} ${bc.w.publicKey.toBase58().slice(0,8)}… ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL ${ok ? '✅' : '❌ low'}`);
    if (!ok) {
      console.error(`  Insufficient balance, airdrop or fund wallet first`);
    }
  }

  // ===== 2. initMatch =====
  console.log('\n--- initMatch ---');
  await rpcWithRetry(() => (program.methods.initMatch(
    new anchor.BN(fixtureId), 'HOME', 'AWAY',
  ) as any).accountsStrict({
    creator: deployer.publicKey,
    config: configPda,
    matchPda,
    matchVault: vaultPda,
    systemProgram: SystemProgram.programId,
  }).rpc());
  console.log('  ✅');

  // ===== 3. openRound =====
  console.log('\n--- openRound ---');
  await rpcWithRetry(() => (program.methods.openRound(
    new anchor.BN(roundId), { varCheck: {} }, new anchor.BN(MIN_DURATION), new anchor.BN(deadlineSec),
  ) as any).accountsStrict({
    authority: deployer.publicKey,
    matchPda,
    round: roundPda,
    systemProgram: SystemProgram.programId,
  }).rpc());
  console.log('  ✅');

  // ===== 4. Place bets =====
  console.log('\n=== Place bets ===');
  for (const bc of betConfig) {
    await rpcWithRetry(() => (program.methods.placeBet(
      new anchor.BN(fixtureId), new anchor.BN(roundId), bc.side, new anchor.BN(bc.betLamports),
    ) as any).accountsStrict({
      bettor: bc.w.publicKey,
      matchPda,
      matchVault: vaultPda,
      round: roundPda,
      position: posPdaOf(bc.w.publicKey),
      systemProgram: SystemProgram.programId,
    }).signers([bc.w]).rpc());
    console.log(`  ${bc.label} ${(bc.betLamports/LAMPORTS_PER_SOL).toFixed(2)} SOL ✅`);
    await sleep(300);
  }

  // ===== 4b. YES-1 second bet (test position reuse: 0.005 more) =====
  console.log('\n--- YES-1 second bet 0.005 (same position, same side) ---');
  await rpcWithRetry(() => (program.methods.placeBet(
    new anchor.BN(fixtureId), new anchor.BN(roundId), 0, new anchor.BN(0.005 * LAMPORTS_PER_SOL),
  ) as any).accountsStrict({
    bettor: betConfig[0].w.publicKey,
    matchPda,
    matchVault: vaultPda,
    round: roundPda,
    position: posPdaOf(betConfig[0].w.publicKey),
    systemProgram: SystemProgram.programId,
  }).signers([betConfig[0].w]).rpc());
  console.log('  ✅ (YES-1 total: 0.015 SOL)');

  // ===== 5. Round totals =====
  const roundAcc = await program.account.round.fetch(roundPda);
  const yesPool = roundAcc.totalYes.toNumber();
  const noPool = roundAcc.totalNo.toNumber();
  const totalPool = yesPool + noPool;
  console.log(`\nPool — YES: ${(yesPool/LAMPORTS_PER_SOL).toFixed(3)} SOL | NO: ${(noPool/LAMPORTS_PER_SOL).toFixed(3)} SOL | Total: ${(totalPool/LAMPORTS_PER_SOL).toFixed(3)} SOL`);

  // ===== 6. settleOffchainRound (YES wins) =====
  console.log(`\n--- settleOffchainRound (wait ${deadlineSec+2}s) ---`);
  await sleep((deadlineSec + 2) * 1000);
  await rpcWithRetry(() => (program.methods.settleOffchainRound({ yes: {} }, 1) as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc());
  console.log('  ✅');

  // ===== 7. confirmRound =====
  console.log('\n--- confirmRound (wait 62s) ---');
  await sleep(62000);
  await rpcWithRetry(() => (program.methods.confirmRound() as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc());
  console.log('  ✅');

  // ===== 8. Claim + show payouts =====
  console.log('\n=== Claim ===');
  console.log('Label    | Before    | After     | Net Δ     | ROI   | Match?');
  console.log('-' .repeat(65));
  for (const bc of betConfig) {
    const balBefore = await conn.getBalance(bc.w.publicKey);
    const pos = await program.account.position.fetch(posPdaOf(bc.w.publicKey)).catch(() => null);
    if (!pos) { console.log(`  ${bc.label} no position`); continue; }
    const betTotal = pos.amount.toNumber();

    // Expected: (bet / winning_pool) × total_pool
    const expectedPayout = bc.side === 0 && yesPool > 0
      ? Math.floor((betTotal / yesPool) * totalPool) : 0;

    try {
      await rpcWithRetry(() => (program.methods.claimWinnings(
        new anchor.BN(fixtureId), new anchor.BN(roundId),
      ) as any).accountsStrict({
        winner: bc.w.publicKey,
        matchPda,
        round: roundPda,
        position: posPdaOf(bc.w.publicKey),
        matchVault: vaultPda,
        systemProgram: SystemProgram.programId,
      }).signers([bc.w]).rpc());
      const balAfter = await conn.getBalance(bc.w.publicKey);
      const net = balAfter - balBefore;
      const roi = ((net / betTotal) * 100).toFixed(1);
      const match = Math.abs(net - expectedPayout) <= 1000 ? '✓' : '✗';
      console.log(`  ${bc.label.padEnd(7)}| ${(balBefore/LAMPORTS_PER_SOL).toFixed(4)} | ${(balAfter/LAMPORTS_PER_SOL).toFixed(4)} | ${(net/LAMPORTS_PER_SOL).toFixed(4)} | ${roi}% | ${match}  (exp ${(expectedPayout/LAMPORTS_PER_SOL).toFixed(4)})`);
    } catch {
      console.log(`  ${bc.label.padEnd(7)}| —        | —        | LOST      | —    | ❌ NotWinner`);
    }
    await sleep(300);
  }

  // ===== 9. Summary =====
  console.log(`\n=== Summary ===`);
  console.log(`YES pool: ${(yesPool/LAMPORTS_PER_SOL).toFixed(3)} (0.01×3 + 0.005 YES-1 extra)`);
  console.log(`NO pool: ${(noPool/LAMPORTS_PER_SOL).toFixed(3)} (0.01×3)`);
  console.log(`Total distributed to winners: ${(totalPool/LAMPORTS_PER_SOL).toFixed(3)} SOL (100%, no house cut)`);
  console.log(`\nFormula: payout = (bet / winning_pool) × total_pool`);
  console.log(`YES-1: (0.015/${(yesPool/LAMPORTS_PER_SOL).toFixed(3)}) × ${(totalPool/LAMPORTS_PER_SOL).toFixed(3)} = ${((0.015/yesPool)*totalPool/LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`YES-2/3: (0.01/${(yesPool/LAMPORTS_PER_SOL).toFixed(3)}) × ${(totalPool/LAMPORTS_PER_SOL).toFixed(3)} = ${((0.01/yesPool)*totalPool/LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`\nDone.`);
}

main().catch(console.error);
