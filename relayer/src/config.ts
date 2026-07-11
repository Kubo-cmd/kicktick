import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const constantsPath = path.resolve(__dirname, "../config/constants.json");
const constants = JSON.parse(fs.readFileSync(constantsPath, "utf-8"));

export const DEFAULT_KICKTICK_PROGRAM_ID = new PublicKey(constants.kicktickProgramId);
export const DEFAULT_TXORACLE_PROGRAM_ID = new PublicKey(constants.txoracleProgramId);

export interface Config {
  txlineJwt: string;
  txlineApiToken: string;
  txlineApiHost: string;
  solanaRpcUrl: string;
  solanaPrivateKey: string;
  kicktickProgramId: PublicKey;
  txoracleProgramId: PublicKey;
  usdtMint: PublicKey;
  txlMint: PublicKey;
  wsPort: number;
  competitionId: number;
}

export function loadConfig(): Config {
  return {
    txlineJwt: process.env.TXLINE_JWT || "",
    txlineApiToken: process.env.TXLINE_API_TOKEN || "",
    txlineApiHost: process.env.TXLINE_API_HOST || constants.txlineApiHost,
    solanaRpcUrl: process.env.SOLANA_RPC_URL || constants.solanaRpcUrl,
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || "",
    kicktickProgramId: new PublicKey(
      process.env.KICKTICK_PROGRAM_ID || constants.kicktickProgramId
    ),
    txoracleProgramId: new PublicKey(
      process.env.TXORACLE_PROGRAM_ID || constants.txoracleProgramId
    ),
    usdtMint: new PublicKey(
      process.env.USDT_MINT || constants.usdtMint
    ),
    txlMint: new PublicKey(
      process.env.TXL_MINT || constants.txlMint
    ),
    wsPort: parseInt(process.env.WS_PORT || String(constants.wsPort), 10),
    competitionId: parseInt(process.env.COMPETITION_ID || String(constants.competitionId), 10),
  };
}
