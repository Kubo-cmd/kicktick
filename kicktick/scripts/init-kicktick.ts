#!/usr/bin/env npx ts-node
// One-time init: deploy Config PDA on target cluster.
// Usage: npx ts-node scripts/init-kicktick.ts --cluster devnet

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

const SEED_CONFIG = Buffer.from('config');

function parseArgs(): string {
  const idx = process.argv.indexOf('--cluster');
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return 'devnet';
}

function loadDeployer(): Keypair {
  const walletPath = path.resolve(__dirname, '..', 'kicktick-deployer.json');
  const data = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

async function main() {
  const cluster = parseArgs();
  const url = cluster === 'devnet'
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';

  console.log(`\n=== KickTick Init ===`);
  console.log(`Cluster: ${cluster} (${url})`);

  const deployer = loadDeployer();
  console.log(`Deployer: ${deployer.publicKey.toBase58()}`);

  const connection = new anchor.web3.Connection(url, 'confirmed');
  const wallet = new Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.Kicktick as Program<Kicktick>;

  const configPda = PublicKey.findProgramAddressSync(
    [SEED_CONFIG],
    program.programId,
  )[0];
  console.log(`Config PDA: ${configPda.toBase58()}`);

  const existing = await connection.getAccountInfo(configPda);
  if (existing) {
    console.log(`Config already initialized. Skipping.\n`);
    return;
  }

  const balance = await connection.getBalance(deployer.publicKey);
  console.log(`Deployer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    throw new Error(`Insufficient SOL. Need >= 0.01 SOL.`);
  }

  console.log(`Calling initConfig...`);
  const tx = await (
    program.methods.initConfig() as any
  ).accountsStrict({
    admin: deployer.publicKey,
    config: configPda,
    systemProgram: SystemProgram.programId,
  }).signers([deployer]).rpc();

  console.log(`Tx: ${tx}`);

  const created = await connection.getAccountInfo(configPda);
  if (!created) throw new Error('initConfig: account not created');
  console.log(`Config PDA confirmed. Size: ${created.data.length} bytes`);
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('init-kicktick failed:', err);
  process.exit(1);
});
