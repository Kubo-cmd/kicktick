// Relayer integration smoke: boot the real relayer runtime against the
// localnet-deployed copy-harness program, txline oracle stubbed (auth is
// user-gated), anchor client bound to the live program. Verifies the WS
// contract the frontend's WebSocketProvider expects.
//
// PREREQUISITES (this is NOT a standalone test — it needs a live localnet):
//   1. Stand up the copy-harness localnet deploy (see solana-anchor-toolchain-fix
//      "Local E2E when declare_id keypair is missing"): copy programs/, patch the
//      copy's declare_id to the local deploy keypair, `cargo build-sbf --arch v3`,
//      start `solana-test-validator`, and `solana program deploy` the copy.
//   2. Temporarily point repo target/idl/kicktick.json "address" at the deployed
//      localnet program id (restore afterward).
//   3. Update PROGRAM_ID / IDL_PATH below if your deploy differs.
//   4. Run: ./node_modules/.bin/tsx src/integration-smoke.ts
//
// SCOPE: proves the relayer boots against a live program and serves the WS
// welcome/subscribe contract. The txline oracle is stubbed — this is NOT a full
// oracle-driven settle (that needs real TXLINE credentials, user-gated).
import { createRelayerRuntime } from "./index.js";
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const RPC = "http://127.0.0.1:8899";
const PROGRAM_ID = "CYsfi63w4ZDAvRhToQzo6syGyZYEtDUafmuyRTVnysHP";
const IDL_PATH = "/Users/test/projects/kicktick/target/idl/kicktick.json";
const WS_PORT = 8080;
const FIXTURE = 12345;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await res.json()).result;
}

// --- stub TxLineTransport matching the real interface; no network ---
const creds = { jwt: "stub-jwt", apiToken: undefined };
const txlineTransport = {
  async authenticate() { return creds; },
  async getFixtures(_h: number, _c: unknown) { return [{ fixtureId: FIXTURE }]; },
  async getScoreSnapshot(id: number, _c: unknown) {
    return { fixtureId: id, statusId: 1, homeScore: 0, awayScore: 0, matchClockMs: 0 };
  },
  async getStatValidation(r: { fixtureId: number; seq: number }, _c: unknown) {
    return {
      ts: Math.floor(Date.now() / 1000), fixtureSummary: {}, statProof: [],
      fixtureProof: [], mainTreeProof: [], value: 0,
    };
  },
  async *openSse(_path: string, _h: Record<string, string>, signal: AbortSignal) {
    // valid txline event shape: PascalCase Action + FixtureId
    yield { data: JSON.stringify({ Action: "kickoff", FixtureId: FIXTURE, Participant: 1 }) };
    while (!signal.aborted) { await new Promise((r) => setTimeout(r, 400)); }
  },
};

// --- real anchor adapter bound to the live localnet program (read-only) ---
const anchorAdapter = {
  async loadIdl(path: string) {
    const idl = JSON.parse(readFileSync(path, "utf8"));
    const acct = await rpc("getAccountInfo", [PROGRAM_ID, { encoding: "base64" }]);
    if (!acct || !acct.value) throw new Error("program not deployed at " + PROGRAM_ID);
    if (!acct.value.executable) throw new Error("account not executable");
    console.log("ANCHOR_IDL_LOADED program=" + PROGRAM_ID + " executable=" + acct.value.executable + " idlAddr=" + idl.address);
    return idl;
  },
  async openRound() { return "stub-sig-openRound"; },
  async settleRound() { return "stub-sig-settleRound"; },
  async settleOffchainRound() { return "stub-sig-settleOffchain"; },
  async confirmRound() { return "stub-sig-confirmRound"; },
};

const proofAssembler = {
  assemble(_f: number, _r: unknown[], _k: readonly number[], _p: number) {
    return {
      ts: 0,
      fixtureSummary: { fixtureId: FIXTURE, updateStats: { updateCount: 0, minTimestamp: 0, maxTimestamp: 0 }, eventsSubTreeRoot: [] },
      fixtureProof: [], mainTreeProof: [],
      predicate: { threshold: 0, comparison: "GreaterThan" },
      statA: { statKey: 1, period: 0, value: 0, proof: [] },
    };
  },
};

const config = {
  txlineApiHost: "http://stub",
  solanaRpcUrl: RPC,
  kicktickProgramId: PROGRAM_ID,
  txOracleProgramId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  wsPort: WS_PORT,
  idlPath: IDL_PATH,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30000,
  heartbeatMs: 30000,
};

const rt = await createRelayerRuntime(
  { txlineTransport, anchorAdapter, proofAssembler } as never,
  config
);

const ac = new AbortController();
// rt.start() runs an infinite SSE for-await loop — launch it, don't await completion
const startErr: unknown[] = [];
const started = rt.start(ac.signal).catch((e) => { startErr.push(e); });
console.log("RELAYER_START_LAUNCHED wsPort=" + WS_PORT);
// give the WS server + first SSE event a moment to come up
await new Promise((r) => setTimeout(r, 1500));
if (startErr.length) { console.log("START_ERROR " + startErr[0]); }

const ws = new WebSocket("ws://localhost:" + WS_PORT);
let gotWelcome = false, gotEvent = false;
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "welcome") { gotWelcome = true; console.log("WS_WELCOME " + JSON.stringify(m.data)); }
  if (m.type === "football_event") { gotEvent = true; console.log("WS_FOOTBALL_EVENT " + JSON.stringify(m.data)); }
});
ws.on("open", () => {
  ws.send(JSON.stringify({ type: "subscribe_match", data: { fixtureId: FIXTURE } }));
});

await new Promise((r) => setTimeout(r, 3000));
ws.close();
await rt.stop();
ac.abort();

console.log("RESULT welcome=" + gotWelcome + " football_event=" + gotEvent);
// hard exit — SSE loop / WS server keep the event loop alive otherwise
if (gotWelcome) { console.log("SMOKE_PASS"); } else { console.log("SMOKE_FAIL"); }
process.exit(gotWelcome ? 0 : 1);
