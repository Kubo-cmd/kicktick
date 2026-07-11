import { expect } from "chai";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { AnchorClient, MarketType } from "../../src/clients/anchor-client";
import { DEFAULT_KICKTICK_PROGRAM_ID, Config } from "../../src/config";
import { ChildProcess, spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const PROGRAM_ID = DEFAULT_KICKTICK_PROGRAM_ID.toBase58();
const PROGRAM_SO = path.resolve(
  __dirname,
  "../../../kicktick/target/deploy/kicktick.so",
);
const RPC_URL = "http://127.0.0.1:8899";
const FIXTURE_ID = 99901;
const LOCK_SECS = 15;
const DEADLINE_SECS = 16;
const BET_AMOUNT = 10_000_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTestConfig(keypair: Keypair): Config {
  return {
    txlineJwt: "",
    txlineApiToken: "",
    txlineApiHost: "",
    solanaRpcUrl: RPC_URL,
    solanaPrivateKey: Buffer.from(keypair.secretKey).toString("hex"),
    kicktickProgramId: new PublicKey(PROGRAM_ID),
    txoracleProgramId: new PublicKey(
      "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    ),
    usdtMint: new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh"),
    txlMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    wsPort: 0,
    competitionId: 72,
  };
}

describe("AnchorClient Integration (localnet)", function () {
  this.timeout(300_000);

  let validator: ChildProcess;
  let adminKeypair: Keypair;
  let client: AnchorClient;
  let connection: Connection;
  let matchPda: PublicKey;
  let vaultPda: PublicKey;

  before(async function () {
    if (!fs.existsSync(PROGRAM_SO)) {
      this.skip();
      return;
    }

    adminKeypair = Keypair.generate();

    const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), "kicktick-ledger-"));

    validator = spawn(
      "solana-test-validator",
      [
        "--reset",
        "--quiet",
        "--ledger",
        ledgerDir,
        "--bpf-program",
        PROGRAM_ID,
        PROGRAM_SO,
      ],
      { stdio: "pipe", detached: false },
    );

    validator.stdout?.on("data", () => {});
    validator.stderr?.on("data", () => {});

    connection = new Connection(RPC_URL, "confirmed");

    let ready = false;
    for (let i = 0; i < 120; i++) {
      try {
        await connection.getVersion();
        ready = true;
        break;
      } catch {
        await sleep(500);
      }
    }
    if (!ready) throw new Error("Validator did not start in time");

    const sig = await connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(sig, "confirmed");

    client = new AnchorClient(makeTestConfig(adminKeypair));

    await client.initConfig();

    const result = await client.initMatch(FIXTURE_ID, "Home FC", "Away United");
    matchPda = result.matchPda;
    vaultPda = result.vaultPda;
  });

  after(async function () {
    if (validator) {
      validator.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1000));
      if (!validator.killed) validator.kill("SIGKILL");
    }
  });

  describe("openRound", () => {
    const roundId = 1;

    it("creates round account with Open status", async () => {
      await client.openRound(roundId, "VARCheck" as MarketType, LOCK_SECS, DEADLINE_SECS, matchPda);

      const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
      const round = await client.fetchRound(roundPda);

      expect(round.roundId.toNumber()).to.equal(roundId);
      expect(round.status).to.deep.equal({ open: {} });
      expect(round.totalYes.toNumber()).to.equal(0);
      expect(round.totalNo.toNumber()).to.equal(0);
    });
  });

  describe("settleOffchainRound", () => {
    const roundId = 1;

    it("settles round after deadline", async () => {
      await sleep((DEADLINE_SECS + 1) * 1000);

      await client.settleOffchainRound(roundId, matchPda, "Yes", 1);

      const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
      const round = await client.fetchRound(roundPda);

      expect(round.status).to.deep.equal({ resolvedPending: {} });
      expect(round.winner).to.equal(1);
      expect(round.outcome).to.deep.equal({ yes: {} });
    });
  });

  describe("confirmRound", () => {
    const roundId = 1;

    it("confirms round after finality delay", async () => {
      await sleep(61_000);

      await client.confirmRound(roundId, matchPda);

      const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
      const round = await client.fetchRound(roundPda);

      expect(round.status).to.deep.equal({ settled: {} });
    });
  });

  describe("placeBet + claimWinnings", () => {
    const roundId = 2;
    let bettor2: Keypair;

    before(async () => {
      bettor2 = Keypair.generate();
      const sig = await connection.requestAirdrop(
        bettor2.publicKey,
        1 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    });

    it("full betting lifecycle", async () => {
      await client.openRound(roundId, "PenaltyShot" as MarketType, LOCK_SECS, DEADLINE_SECS, matchPda);

      const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);

      await client.placeBet(FIXTURE_ID, roundId, 0, BET_AMOUNT, matchPda);
      await client.placeBet(FIXTURE_ID, roundId, 1, BET_AMOUNT, matchPda, bettor2);

      const roundAfterBets = await client.fetchRound(roundPda);
      expect(roundAfterBets.totalYes.toNumber()).to.equal(BET_AMOUNT);
      expect(roundAfterBets.totalNo.toNumber()).to.equal(BET_AMOUNT);

      const vaultAfterBets = await connection.getBalance(vaultPda);

      await sleep((DEADLINE_SECS + 1) * 1000);

      await client.settleOffchainRound(roundId, matchPda, "Yes", 1);

      const roundSettled = await client.fetchRound(roundPda);
      expect(roundSettled.status).to.deep.equal({ resolvedPending: {} });
      expect(roundSettled.winner).to.equal(1);

      await sleep(61_000);

      await client.confirmRound(roundId, matchPda);

      const roundConfirmed = await client.fetchRound(roundPda);
      expect(roundConfirmed.status).to.deep.equal({ settled: {} });

      const adminBefore = await connection.getBalance(adminKeypair.publicKey);
      await client.claimWinnings(FIXTURE_ID, roundId, matchPda);
      const adminAfter = await connection.getBalance(adminKeypair.publicKey);

      expect(adminAfter).to.be.greaterThan(adminBefore);

      const vaultAfterClaim = await connection.getBalance(vaultPda);
      expect(vaultAfterClaim).to.be.lessThan(vaultAfterBets);
    });
  });
});
