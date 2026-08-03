#!/usr/bin/env node

import crypto from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const PROGRAM_ID = new PublicKey(
  process.env.KICKTICK_PROGRAM_ID ?? "a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2",
);
const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const CURRENT_VERSION = 2;
const POSITION_SIZE = 67;

function discriminator(name) {
  return crypto.createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function readI64(buffer, offset) {
  return buffer.readBigInt64LE(offset);
}

const connection = new Connection(RPC_URL, "confirmed");
const positionDiscriminator = discriminator("Position");
const positions = await connection.getProgramAccounts(PROGRAM_ID, {
  filters: [
    { dataSize: POSITION_SIZE },
    { memcmp: { offset: 0, bytes: bs58.encode(positionDiscriminator) } },
  ],
});

const liabilities = new Map();
let legacyPositionCount = 0;
let legacyLiability = 0n;

for (const { account } of positions) {
  const data = account.data;
  const claimed = data[65] !== 0;
  const version = data[66];
  if (claimed || version === CURRENT_VERSION) continue;

  const fixtureId = readI64(data, 40);
  const amount = data.readBigUInt64LE(57);
  const key = fixtureId.toString();
  const current = liabilities.get(key) ?? { amount: 0n, count: 0 };
  current.amount += amount;
  current.count += 1;
  liabilities.set(key, current);
  legacyPositionCount += 1;
  legacyLiability += amount;
}

const rows = [];
for (const [fixture, liability] of liabilities) {
  const fixtureBytes = Buffer.alloc(8);
  fixtureBytes.writeBigInt64LE(BigInt(fixture));
  const [matchPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), fixtureBytes],
    PROGRAM_ID,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("match_vault"), matchPda.toBuffer()],
    PROGRAM_ID,
  );
  const balance = BigInt(await connection.getBalance(vault, "confirmed"));
  const shortfall = liability.amount > balance ? liability.amount - balance : 0n;
  rows.push({
    fixture,
    vault: vault.toBase58(),
    positions: liability.count,
    liabilityLamports: liability.amount.toString(),
    balanceLamports: balance.toString(),
    shortfallLamports: shortfall.toString(),
  });
}

rows.sort((a, b) => a.fixture.localeCompare(b.fixture));
const deficient = rows.filter((row) => row.shortfallLamports !== "0");
const totalBalance = rows.reduce((sum, row) => sum + BigInt(row.balanceLamports), 0n);
const aggregateShortfall = legacyLiability > totalBalance ? legacyLiability - totalBalance : 0n;
const combinedDeficientShortfall = deficient.reduce(
  (sum, row) => sum + BigInt(row.shortfallLamports),
  0n,
);

console.log(
  JSON.stringify(
    {
      rpc: RPC_URL,
      programId: PROGRAM_ID.toBase58(),
      legacyPositionCount,
      legacyLiabilityLamports: legacyLiability.toString(),
      totalVaultBalanceLamports: totalBalance.toString(),
      aggregateShortfallLamports: aggregateShortfall.toString(),
      combinedDeficientShortfallLamports: combinedDeficientShortfall.toString(),
      deficient,
    },
    null,
    2,
  ),
);

if (deficient.length > 0) {
  console.error("BLOCK: one or more match vaults cannot cover unclaimed legacy principal");
  process.exit(1);
}
