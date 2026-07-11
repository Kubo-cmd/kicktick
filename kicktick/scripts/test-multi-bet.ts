#!/usr/bin/env npx ts-node
// Multi-bet devnet test: 3 YES + 3 NO bets (0.05 SOL each).
// Settle YES winner → claim YES ok, NO rejected.
// Usage: npx ts-node scripts/test-multi-bet.ts
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
  const deadlineSec = 16;
  const BET = 0.05 * LAMPORTS_PER_SOL;

  // === PDAs ===
  const matchPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH, i64Buf(fixtureId)], program.programId)[0];
  const vaultPda = PublicKey.findProgramAddressSync(
    [SEED_MATCH_VAULT, matchPda.toBuffer()], program.programId)[0];
  const roundPda = PublicKey.findProgramAddressSync(
    [SEED_ROUND, matchPda.toBuffer(), u64Buf(roundId)], program.programId)[0];

  console.log(`Deployer: ${deployer.publicKey.toBase58()}  Fixture: ${fixtureId}`);
  wallets.forEach((w,i) => console.log(`  w${i+1}: ${w.publicKey.toBase58()}`));
  console.log('PDAs:', { matchPda: matchPda.toBase58(), vaultPda: vaultPda.toBase58(), roundPda: roundPda.toBase58() });

  // 1. initMatch — Rust args: (fixture_id: i64, home_team: String, away_team: String)
  console.log('\n--- initMatch ---');
  await (program.methods.initMatch(
    new anchor.BN(fixtureId), 'HOME', 'AWAY',
  ) as any).accountsStrict({
    creator: deployer.publicKey,
    config: configPda,
    matchPda,
    matchVault: vaultPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log('✅');

  // 2. openRound — Rust args: (round_id, market_type, lock_seconds, deadline_seconds)
  console.log('--- openRound ---');
  await (program.methods.openRound(
    new anchor.BN(roundId), { varCheck: {} }, new anchor.BN(MIN_DURATION), new anchor.BN(deadlineSec),
  ) as any).accountsStrict({
    authority: deployer.publicKey,
    matchPda,
    round: roundPda,
    systemProgram: SystemProgram.programId,
  }).rpc();
  console.log('✅');

  // 3. Place bets: 3 YES (0), 3 NO (1), each 0.05 SOL — direct from wallet to vault
  const YES = 0, NO = 1;
  const betConfig = [
    { w: wallets[0], side: YES, label: 'YES-1' },
    { w: wallets[1], side: YES, label: 'YES-2' },
    { w: wallets[2], side: YES, label: 'YES-3' },
    { w: wallets[3], side: NO,  label: 'NO-1'  },
    { w: wallets[4], side: NO,  label: 'NO-2'  },
    { w: deployer,    side: NO,  label: 'NO-3'  },
  ];

  console.log(`--- placeBet (3×YES + 3×NO  @ ${BET/LAMPORTS_PER_SOL} SOL) ---`);
  for (const bc of betConfig) {
    const posPda = PublicKey.findProgramAddressSync(
      [SEED_POSITION, i64Buf(fixtureId), u64Buf(roundId), bc.w.publicKey.toBuffer()],
      program.programId,
    )[0];
    await (program.methods.placeBet(
      new anchor.BN(fixtureId), new anchor.BN(roundId), bc.side, new anchor.BN(BET),
    ) as any).accountsStrict({
      bettor: bc.w.publicKey,
      matchPda,
      matchVault: vaultPda,
      round: roundPda,
      position: posPda,
      systemProgram: SystemProgram.programId,
    }).signers([bc.w]).rpc();
    console.log(`  ${bc.label}  ${bc.w.publicKey.toBase58().slice(0,8)}…`);
    await sleep(250);
  }

  // Show totals
  const r = await program.account.round.fetch(roundPda);
  console.log(`Totals — YES: ${r.totalYes.toNumber()/LAMPORTS_PER_SOL} SOL | NO: ${r.totalNo.toNumber()/LAMPORTS_PER_SOL} SOL | Pool: ${(r.totalYes.toNumber()+r.totalNo.toNumber())/LAMPORTS_PER_SOL} SOL`);

  async function rpcWithRetry(promise: Promise<any>, retries = 8): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try { return await promise; }
      catch (e: any) {
        if (e.message?.includes('429') && i < retries - 1) {
          const delay = Math.min(2000 * (2 ** i), 30000);
          console.log(`  429, retry ${i+1}/${retries-1} in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        throw e;
      }
    }
  }

  // 4. Wait + settleOffchainRound — Rust args: (outcome, winner)
  console.log(`--- settleOffchainRound (wait ${deadlineSec+2}s) ---`);
  await sleep((deadlineSec + 2) * 1000);
  await rpcWithRetry((program.methods.settleOffchainRound({ yes: {} }, 1) as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc());
  console.log('✅');

  // 5. Finality wait + confirmRound
  console.log('--- confirmRound (wait 62s) ---');
  await sleep(62000);
  await rpcWithRetry((program.methods.confirmRound() as any)
    .accountsStrict({ caller: deployer.publicKey, matchPda, round: roundPda })
    .rpc());
  console.log('✅');

  // 6. Claim
  console.log('--- claimWinnings ---');
  for (const bc of betConfig) {
    const posPda = PublicKey.findProgramAddressSync(
      [SEED_POSITION, i64Buf(fixtureId), u64Buf(roundId), bc.w.publicKey.toBuffer()],
      program.programId,
    )[0];
    try {
      await (program.methods.claimWinnings(
        new anchor.BN(fixtureId), new anchor.BN(roundId),
      ) as any).accountsStrict({
        winner: bc.w.publicKey,
        matchPda,
        round: roundPda,
        position: posPda,
        matchVault: vaultPda,
        systemProgram: SystemProgram.programId,
      }).signers([bc.w]).rpc();
      const bal = await conn.getBalance(bc.w.publicKey);
      console.log(`  ✅ ${bc.label}  balance: ${bal/LAMPORTS_PER_SOL} SOL`);
      await sleep(250);
    } catch (e: any) {
      console.log(`  ❌ ${bc.label}  rejected: ${e.message?.slice(0,60)}`);
    }
  }
  console.log('\n=== Done ===');
}
main().catch(e => { console.error(e); process.exit(1); });
