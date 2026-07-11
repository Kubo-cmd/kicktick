import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import path from "path";
import fs from "fs";
import { loadConfig } from "./config";
import { TxLineClient } from "./clients/txline-client";
import { AnchorClient } from "./clients/anchor-client";
import { activateApiToken } from "./clients/txline-auth";
import { ProofGatherer } from "./settlement/proof-gatherer";
import { Crank, CrankStatus } from "./settlement/crank";
import { WsServer, WsServerMessage } from "./api/ws-server";
import { MarketTrigger, type TriggerAction } from "./market/triggers";
import { FixtureWatcher } from "./market/fixture-watcher";
import { parseSoccerEvent } from "./market/event-parser";
import { normalizeSsePayload } from "./market/sse-normalize";
import { SseLogger } from "./market/sse-logger";
import type { FixtureRecord } from "@swingkiddo/txodds-client";

function actionSummary(actions: TriggerAction[]): string {
  return actions.map(a => {
    const extra = "marketType" in a ? ` ${(a as any).marketType}` : "";
    return `${a.type}[${a.fixtureId}:${a.roundId}${extra}]`;
  }).join(", ");
}

function getRoundMessage(status: CrankStatus): WsServerMessage | null {
  const { fixtureId, roundId, txSig } = status;
  if (!txSig) return null;
  switch (status.action) {
    case "open_round":
      return {
        type: "round_opened",
        data: { fixtureId, roundId, marketType: "", lockSeconds: 0, deadlineSeconds: 0, expiresAt: 0 },
      };
    case "settle_onchain":
    case "settle_offchain":
      return { type: "round_settled", data: { fixtureId, roundId, outcome: "", txSig } };
    case "confirm_round":
      return { type: "round_confirmed", data: { fixtureId, roundId, txSig } };
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  console.log("╔══════════════════════════════════════════╗");
  console.log("║       KickTick Relayer v0.1.0            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Solana RPC:      ${config.solanaRpcUrl}`);
  console.log(`  Keypair:         ${config.solanaPrivateKey ? "loaded from env" : "missing — check SOLANA_PRIVATE_KEY"}`);
  console.log(`  KickTick PID:    ${config.kicktickProgramId.toBase58()}`);
  console.log(`  TxOracle PID:    ${config.txoracleProgramId.toBase58()}`);
  console.log(`  WS Port:         ${config.wsPort}`);
  console.log(`  TxLINE Host:     ${config.txlineApiHost}`);
  console.log(`  TxLINE JWT:      ${config.txlineJwt ? "set" : "missing"}`);
  console.log(`  TxLINE Token:    ${config.txlineApiToken ? "set" : "missing"}`);

  if (!config.txlineJwt && !config.txlineApiToken) {
    console.warn("No TxLINE credentials configured — attempting guest auth...");
  }

  const wsServer = new WsServer(config.wsPort);
  const txlineClient = new TxLineClient(config);
  const anchorClient = new AnchorClient(config);
  const proofGatherer = new ProofGatherer(txlineClient);
  const crank = new Crank(anchorClient, proofGatherer);
  const fixtureWatcher = new FixtureWatcher(txlineClient, config);
  const marketTrigger = new MarketTrigger();
  const sseLogger = new SseLogger(
    path.resolve(__dirname, `../logs/sse-${new Date().toISOString().replace(/[:.]/g, "-")}.log`),
  );
  console.log(`  SSE log file:   ${sseLogger.path}`);

  let jwt = config.txlineJwt;
  if (!jwt) {
    console.log("Authenticating with TxLINE...");
    jwt = await txlineClient.authenticate();
    txlineClient.setJwt(jwt);
    console.log("TxLINE JWT obtained.");
  }

  if (!config.txlineApiToken) {
    console.log("Activating API token (World Cup free tier)...");
    const keypair = Keypair.fromSecretKey(Buffer.from(config.solanaPrivateKey, "hex"));
    try {
      const connection = new Connection(config.solanaRpcUrl, "confirmed");
      await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        config.txlMint,
        keypair.publicKey,
        false,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      console.log("TxL token account ready.");

      const solBalance = await connection.getBalance(keypair.publicKey);
      console.log(`  SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);

      const activation = await activateApiToken(jwt, keypair, {
        apiHost: config.txlineApiHost,
        serviceLevelId: 1,
        solanaRpcUrl: config.solanaRpcUrl,
      });
      const { txSig, apiToken } = activation;
      console.log(`  Subscribe txSig: ${txSig}`);
      const txStatus = await connection.getSignatureStatus(txSig);
      console.log(`  Tx confirmed: ${txStatus?.value?.confirmationStatus ?? "no"}`);

      txlineClient.setApiToken(apiToken);
      console.log("API token set, testing...");
      try {
        const testFixtures = await txlineClient.getFixtures(config.competitionId);
        console.log(`  API token OK: ${testFixtures.length} fixtures returned`);
      } catch (e) {
        console.warn(`  API token rejected: ${e instanceof Error ? e.message : e}`);
        throw e;
      }

      // Save API token to .env for reuse
      const envPath = path.resolve(__dirname, "../.env");
      let envContent = "";
      try { envContent = fs.readFileSync(envPath, "utf-8"); } catch {}
      const tokenLine = `TXLINE_API_TOKEN=${apiToken}`;
      if (envContent.includes("TXLINE_API_TOKEN=")) {
        envContent = envContent.replace(/^TXLINE_API_TOKEN=.*$/m, tokenLine);
      } else {
        envContent += `\n${tokenLine}\n`;
      }
      fs.writeFileSync(envPath, envContent, "utf-8");
      console.log(`  API token saved to .env`);
    } catch (err) {
      console.error("Failed to activate API token:", err instanceof Error ? err.message : err);
      console.warn("Continuing with limited guest access...");
    }
  }

  crank.on("status", (status: CrankStatus) => {
    wsServer.broadcast({ type: "tx_status", data: status });
    if (status.status === "confirmed") {
      const msg = getRoundMessage(status);
      if (msg) wsServer.broadcast(msg);
    }
  });

  crank.on("error", (err: Error) => {
    console.error(`Crank error: ${err.message}`);
    wsServer.broadcast({
      type: "error_log",
      data: {
        message: err.message,
        timestamp: Date.now(),
      },
    });
  });

  marketTrigger.on("actions", (actions) => {
    const summary = actionSummary(actions);
    console.log(`[ACTIONS] ${summary}`);
    crank.executeActions(actions).catch((e: Error) =>
      console.error(`Trigger action error: ${e.message} (actions: ${summary})`),
    );
  });

  wsServer.start();
  console.log(`WS server listening on port ${config.wsPort}`);

  wsServer.on("subscribe_all", (ws) => {
    const allFixtures = fixtureWatcher.getAllFixtures();
    for (const matchState of allFixtures) {
      ws.send(JSON.stringify({
        type: "match_state",
        data: {
          fixtureId: matchState.fixtureId,
          status: String(matchState.status),
          homeScore: matchState.homeScore,
          awayScore: matchState.awayScore,
          currentPeriod: matchState.currentPeriod,
          matchClockMs: matchState.matchClockMs,
        },
      }));
    }
    console.log(`[WS] Sent ${allFixtures.length} match states to new subscriber`);
  });

  console.log(`Fetching fixtures for competition ${config.competitionId} (World Cup)...`);
  let fixtures: { FixtureId: number }[] = [];
  try {
    fixtures = (await txlineClient.getFixtures(config.competitionId)) as FixtureRecord[];
    console.log(`Loaded ${fixtures.length} fixtures.`);
  } catch (err) {
    console.error("Failed to fetch fixtures:", err instanceof Error ? err.message : err);
  }

  const activeFixtures = fixtures;
  for (const fixture of activeFixtures) {
    const fixtureId = fixture.FixtureId;
    let matchState: Awaited<ReturnType<typeof fixtureWatcher.loadFixture>>;
    try {
      matchState = await fixtureWatcher.loadFixture(fixtureId);
      console.log(
        `  Fixture ${fixtureId}: ${matchState.participants.home} vs ${matchState.participants.away} [${matchState.currentPeriod}]`,
      );
    } catch (err) {
      console.error(`  Failed to load fixture ${fixtureId}:`, err instanceof Error ? err.message : err);
      continue;
    }

    // Init Match PDA on-chain if not yet created
    const [matchPda] = AnchorClient.deriveMatchPda(fixtureId, config.kicktickProgramId);
    const rpcConn = new Connection(config.solanaRpcUrl, "confirmed");
    const matchOnChain = await rpcConn.getAccountInfo(matchPda);
    if (matchOnChain) {
      console.log(`  Match ${fixtureId}: already on-chain (${matchPda.toBase58()})`);
    } else {
      try {
        const { sig } = await anchorClient.initMatch(
          fixtureId, matchState.participants.home, matchState.participants.away,
        );
        console.log(`  Match ${fixtureId}: created on-chain (${matchPda.toBase58()}, tx: ${sig})`);
      } catch (err) {
        console.error(`  Match ${fixtureId}: initMatch failed — skipping`, err instanceof Error ? err.message : err);
        continue;
      }
    }

    try {
      marketTrigger.startCronWindows(fixtureId);
    } catch (err) {
      console.error(`  Failed to start cron for fixture ${fixtureId}:`, err instanceof Error ? err.message : err);
    }
  }

  const sseLoop = (async () => {
    console.log("Starting SSE scores stream...");
    for await (const event of txlineClient.streamScores()) {
      try {
        if (event.event === "heartbeat") continue;
        sseLogger.write(event.data);
        const rawParsed = JSON.parse(event.data);
        if (Object.keys(rawParsed).length === 1 && "Ts" in rawParsed) continue;

        const rawData = normalizeSsePayload(rawParsed);
        if (!rawData.fixtureId) continue;

        if (typeof rawParsed.CompetitionId === "number" && rawParsed.CompetitionId !== config.competitionId) continue;

        const soccerEvent = parseSoccerEvent(rawData);
        if (!soccerEvent) {
          console.log(`[SKIP] action=${rawData.action} sportId=${rawParsed.SportId} gameState=${rawData.gameState} fixtureId=${rawData.fixtureId}`);
          continue;
        }

        const clockStr = rawData.clock ? `${rawData.clock.seconds}s` : "";
        console.log(`[EVENT] fixture=${rawData.fixtureId} action=${rawData.action} gameState=${rawData.gameState} seq=${rawData.seq} participant=${rawData.participant ?? "-"} clock=${clockStr}`);

        const matchState = fixtureWatcher.processEvent(soccerEvent, rawData.fixtureId);
        if (matchState) {
          wsServer.broadcast({
            type: "match_state",
            data: {
              fixtureId: matchState.fixtureId,
              status: String(matchState.status),
              homeScore: matchState.homeScore,
              awayScore: matchState.awayScore,
              currentPeriod: matchState.currentPeriod,
              matchClockMs: matchState.matchClockMs,
            },
          });

          wsServer.broadcast({
            type: "football_event",
            data: {
              action: soccerEvent.action,
              fixtureId: rawData.fixtureId,
              participant: soccerEvent.participant,
              description: `${soccerEvent.action} on fixture ${rawData.fixtureId}`,
            },
          });

          marketTrigger.processEvent(soccerEvent, rawData.fixtureId, matchState);
        }
      } catch (err) {
        console.error("SSE event error:", err instanceof Error ? err.message : err);
      }
    }
  })();

  const timeoutTimer = setInterval(() => {
    const allFixtures = fixtureWatcher.getAllFixtures();
    for (const matchState of allFixtures) {
      const fixtureId = matchState.fixtureId;
      try {
        const timeoutActions = marketTrigger.checkTimeouts(fixtureId);
        if (timeoutActions.length > 0) {
          console.log(`[TIMEOUT] fixture=${fixtureId} actions=${actionSummary(timeoutActions)}`);
          crank.executeActions(timeoutActions).catch((e: Error) =>
            console.error(`Timeout actions error [${fixtureId}]: ${e.message}`),
          );
        }
      } catch (err) {
        console.error(`Timeout check error [${fixtureId}]:`, err instanceof Error ? err.message : err);
      }
    }
  }, 5000);

  const cronTimer = setInterval(() => {
    const allFixtures = fixtureWatcher.getAllFixtures();
    for (const matchState of allFixtures) {
      const fixtureId = matchState.fixtureId;
      try {
        marketTrigger.runCronCheck(fixtureId, matchState);
      } catch (err) {
        console.error(`Cron window check error [${fixtureId}]:`, err instanceof Error ? err.message : err);
      }
    }
  }, 60_000);

  const statusTimer = setInterval(() => {
    wsServer.broadcast({
      type: "system_status",
      data: {
        clientCount: wsServer.clientCount,
        uptime: process.uptime(),
        activeFixtureCount: fixtureWatcher.getAllFixtures().length,
        solBalance: 0,
      },
    });
  }, 30_000);

  async function shutdown(): Promise<void> {
    console.log("\nShutting down...");
    clearInterval(timeoutTimer);
    clearInterval(cronTimer);
    clearInterval(statusTimer);
    for (const ms of fixtureWatcher.getAllFixtures()) {
      marketTrigger.stopCronWindows(ms.fixtureId);
    }
    wsServer.stop();
    sseLogger.close();
    console.log("Goodbye.");
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await sseLoop;
  } catch (err) {
    console.error("SSE stream ended:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
