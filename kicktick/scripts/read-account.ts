#!/usr/bin/env npx ts-node
// Usage: npx ts-node scripts/read-account.ts <Type> <Address>
// Types: Config, Match_, Round, Position, SponsorVault
// Example: npx ts-node scripts/read-account.ts Match_ Dg3...

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BorshCoder, BN } from '@anchor-lang/core';
import * as fs from 'fs';
import * as path from 'path';

function fmt(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object' && val.toBase58) return val.toBase58();
  if (val instanceof BN) return val.toNumber();
  if (Array.isArray(val)) return val.length > 20 ? `[${val.length} items]` : val;
  return val;
}

function pretty(val: any, indent = ''): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val !== 'object') return String(val);
  if (val.toBase58) return val.toBase58();
  if (val instanceof BN) return val.toNumber().toLocaleString();
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    if (val.length > 10) return `[${val.length} items]`;
    return '[' + val.map(v => pretty(v)).join(', ') + ']';
  }
  const keys = Object.keys(val);
  if (keys.length === 0) return '{}';
  const lines: string[] = [];
  for (const k of keys) {
    const v = val[k];
    lines.push(`${indent}  ${k}: ${pretty(v, indent + '  ')}`);
  }
  return '\n' + lines.join('\n');
}

async function main() {
  const typeName = process.argv[2];
  const addrStr = process.argv[3];
  if (!typeName || !addrStr) {
    console.log('Usage: npx ts-node scripts/read-account.ts <Type> <Address>');
    console.log('Types: Config, Match_, Round, Position, SponsorVault');
    process.exit(1);
  }

  const idl = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'target', 'idl', 'kicktick.json'), 'utf-8'),
  );
  const coder = new BorshCoder(idl);
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const addr = new PublicKey(addrStr);

  const raw = await conn.getAccountInfo(addr);
  if (!raw) {
    console.log(`Account not found: ${addrStr}`);
    process.exit(1);
  }

  const dec = coder.accounts.decode(typeName, raw.data);

  console.log(`\n=== ${typeName} ===`);
  console.log(`Address:    ${addr.toBase58()}`);
  console.log(`Owner:      ${raw.owner.toBase58()}`);
  console.log(`Size:       ${raw.data.length} bytes`);
  console.log(`Lamports:   ${raw.lamports} (${(raw.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
  console.log(`Executable: ${raw.executable}`);
  console.log(`--- Fields ---`);
  console.log(pretty(dec));
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
