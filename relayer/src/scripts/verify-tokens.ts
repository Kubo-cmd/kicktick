import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export interface TokenInfo {
  symbol: string;
  mint: string;
  tokenProgram: string;
  exists: boolean;
  decimals?: number;
  supply?: string;
}

const DEVNET_RPC = "https://api.devnet.solana.com";

const TOKENS = [
  {
    symbol: "TxL",
    mint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  },
  {
    symbol: "USDT",
    mint: new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh"),
    tokenProgram: TOKEN_PROGRAM_ID,
  },
];

export async function verifyToken(
  connection: Connection,
  info: { symbol: string; mint: PublicKey; tokenProgram: PublicKey }
): Promise<TokenInfo> {
  try {
    const mintInfo = await getMint(connection, info.mint, "confirmed", info.tokenProgram);
    return {
      symbol: info.symbol,
      mint: info.mint.toBase58(),
      tokenProgram: info.tokenProgram.toBase58(),
      exists: true,
      decimals: mintInfo.decimals,
      supply: mintInfo.supply.toString(),
    };
  } catch {
    return {
      symbol: info.symbol,
      mint: info.mint.toBase58(),
      tokenProgram: info.tokenProgram.toBase58(),
      exists: false,
    };
  }
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  console.log("Verifying token mints on Solana devnet...\n");

  for (const token of TOKENS) {
    const result = await verifyToken(connection, token);
    if (result.exists) {
      console.log(`✅ ${result.symbol}: ${result.mint}`);
      console.log(`   Program: ${result.tokenProgram}`);
      console.log(`   Decimals: ${result.decimals}`);
      console.log(`   Supply: ${result.supply}\n`);
    } else {
      console.log(`❌ ${result.symbol}: ${result.mint} — NOT FOUND\n`);
    }
  }

  console.log("Verification complete.");
}

if (require.main === module) {
  main().catch(console.error);
}
