#!/usr/bin/env npx ts-node
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BorshCoder, BN } from '@anchor-lang/core';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PDA = new PublicKey('BjQfSFFb2QFnduUCjekKCM7s8J97cnKNhpLaBYyg1RY7');
const PROGRAM_ID = new PublicKey('a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2');

function bn(val: any): number {
  return (val as BN).toNumber();
}

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'target', 'idl', 'kicktick.json'), 'utf-8'),
  );
  const coder = new BorshCoder(idl);

  const raw = await conn.getAccountInfo(CONFIG_PDA);
  if (!raw) { console.log('Config PDA not found.'); process.exit(1); }

  const dec = coder.accounts.decode('Config', raw.data);

  console.log('\n=== Config PDA ===');
  console.log(`Address:              ${CONFIG_PDA.toBase58()}`);
  console.log(`Program:              ${PROGRAM_ID.toBase58()}`);
  console.log(`Space:                ${raw.data.length} bytes`);
  console.log(`Owner:                ${raw.owner.toBase58()}`);
  console.log(`Lamports:             ${raw.lamports} (${raw.lamports / LAMPORTS_PER_SOL} SOL)`);
  console.log();
  console.log('--- Fields ---');
  console.log(`admin:                        ${dec.admin}`);
  console.log(`txoracle_program_id:          ${dec.txoracle_program_id}`);
  console.log(`daily_scores_merkle_roots:    ${dec.daily_scores_merkle_roots}`);
  console.log(`finality_delay:               ${bn(dec.finality_delay)} sec`);
  console.log(`min_liquidity:                ${bn(dec.min_liquidity)}`);
  console.log(`bump:                         ${dec.bump}`);
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
