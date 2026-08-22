// sdkClient.ts — browser-compatible KickTick SDK wrapper
// Replicates the auditing-safe instruction builders without Node.js crypto.
// Uses Web Crypto API (window.crypto.subtle) for Anchor discriminator hashes.

import { Connection, PublicKey, TransactionInstruction, Transaction } from '@solana/web3.js';
import type { SignerWalletAdapterProps } from '@solana/wallet-adapter-base';
import type { TransactionSignature } from '@solana/web3.js';
import { CONFIG } from './constants';

const PROGRAM_ID = new PublicKey(CONFIG.kicktickProgramId);

// Browser-compatible sha256 → first 8 bytes (Anchor discriminator)
async function ixDiscriminator(name: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`global:${name}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash.slice(0, 8));
}

function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length, true);
  const out = new Uint8Array(4 + bytes.length);
  out.set(len, 0);
  out.set(bytes, 4);
  return out;
}

// i64 little-endian
function i64Le(v: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, v, true);
  return buf;
}

// u64 little-endian
function u64Le(v: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, v, true);
  return buf;
}

// ── PDA derivation ──────────────────────────────────────────────

async function findMatchPda(fixtureId: number | bigint): Promise<[PublicKey, number]> {
  const buf = u64Le(BigInt(fixtureId));
  return PublicKey.findProgramAddressSync([Buffer.from('match'), buf], PROGRAM_ID);
}

async function findRoundPda(fixtureId: number | bigint, roundId: number | bigint): Promise<[PublicKey, number]> {
  const buf1 = u64Le(BigInt(fixtureId));
  const buf2 = u64Le(BigInt(roundId));
  return PublicKey.findProgramAddressSync([Buffer.from('round'), buf1, buf2], PROGRAM_ID);
}

async function findConfigPda(): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
}

// ── Instruction builders ──────────────────────────────────────────

async function buildInitMatch(
  creator: PublicKey,
  fixtureId: number | bigint,
  homeTeam: string,
  awayTeam: string,
): Promise<TransactionInstruction> {
  const [matchPda] = await findMatchPda(fixtureId);
  const discriminator = await ixDiscriminator('init_match');
  const fixtureBytes = u64Le(BigInt(fixtureId));
  const homeBytes = borshString(homeTeam);
  const awayBytes = borshString(awayTeam);
  const data = new Uint8Array(discriminator.length + fixtureBytes.length + homeBytes.length + awayBytes.length);
  data.set(discriminator, 0);
  data.set(fixtureBytes, discriminator.length);
  data.set(homeBytes, discriminator.length + fixtureBytes.length);
  data.set(awayBytes, discriminator.length + fixtureBytes.length + homeBytes.length);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // system_program placeholder
    ],
    data: Buffer.from(data),
  });
}

async function buildOpenRound(
  admin: PublicKey,
  fixtureId: number | bigint,
  roundId: number | bigint,
  marketType: number,
  lockSeconds: number,
  deadlineSeconds: number,
): Promise<TransactionInstruction> {
  const [matchPda] = await findMatchPda(fixtureId);
  const [roundPda] = await findRoundPda(fixtureId, roundId);
  const discriminator = await ixDiscriminator('open_round');
  const fixBytes = u64Le(BigInt(fixtureId));
  const ridBytes = u64Le(BigInt(roundId));
  const mtBytes = u64Le(BigInt(marketType));
  const lockBytes = i64Le(BigInt(lockSeconds));
  const deadBytes = i64Le(BigInt(deadlineSeconds));
  const data = new Uint8Array(
    discriminator.length + fixBytes.length + ridBytes.length +
    mtBytes.length + lockBytes.length + deadBytes.length
  );
  let off = 0;
  data.set(discriminator, off); off += discriminator.length;
  data.set(fixBytes, off); off += fixBytes.length;
  data.set(ridBytes, off); off += ridBytes.length;
  data.set(mtBytes, off); off += mtBytes.length;
  data.set(lockBytes, off); off += lockBytes.length;
  data.set(deadBytes, off);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}

// ── High-level API ───────────────────────────────────────────────

export class KickTickClient {
  constructor(
    public connection: Connection,
    public wallet: SignerWalletAdapterProps,
  ) {}

  async initMatch(fixtureId: number, homeTeam: string, awayTeam: string): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const ix = await buildInitMatch(this.wallet.publicKey, fixtureId, homeTeam, awayTeam);
    const tx = new Transaction().add(ix);
    const signature: TransactionSignature = await this.wallet.sendTransaction(tx, this.connection);
    return signature;
  }

  async openRound(
    fixtureId: number,
    roundId: number,
    marketType: number,
    lockSeconds: number,
    deadlineSeconds: number,
  ): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const ix = await buildOpenRound(
      this.wallet.publicKey, fixtureId, roundId, marketType, lockSeconds, deadlineSeconds
    );
    const tx = new Transaction().add(ix);
    const signature: TransactionSignature = await this.wallet.sendTransaction(tx, this.connection);
    return signature;
  }
}
