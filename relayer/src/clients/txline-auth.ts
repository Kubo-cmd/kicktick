import { TxOddsClient } from "@swingkiddo/txodds-client";
import { Connection, Keypair } from "@solana/web3.js";

/** Result of a guest authentication call. */
export interface AuthResult {
  jwt: string;
}

/** Result of an API token activation (subscription + activation). */
export interface ActivationResult {
  txSig: string;
  apiToken: string;
}

/** Result of a connection test. */
export interface TestResult {
  ok: boolean;
  message: string;
}

const DEFAULT_SERVICE_LEVEL_ID = 1;
const DEFAULT_WEEKS = 4;

const DEFAULT_SOLANA_RPC = "https://api.devnet.solana.com";

/**
 * Create a TxOddsClient targeting the given API host.
 * Defaults to TxLINE devnet when no host is provided.
 */
function createClient(apiHost?: string): TxOddsClient {
  return apiHost ? new TxOddsClient(apiHost) : TxOddsClient.devnet();
}

/**
 * Perform guest authentication with TxLINE.
 * Returns a JWT that grants read-only access to free-tier data.
 *
 * @param apiHost - Optional custom API host (defaults to TxLINE devnet)
 * @returns AuthResult containing the JWT
 */
export async function authenticateGuest(apiHost?: string): Promise<AuthResult> {
  const client = createClient(apiHost);
  const jwt = await client.authenticate();
  return { jwt };
}

/**
 * Subscribe to a TxLINE service tier on-chain and activate the API token.
 * Requires a Solana keypair funded with TxL tokens for the subscription fee.
 *
 * @param jwt         - JWT from {@link authenticateGuest}
 * @param keypair     - Solana keypair (must hold TxL tokens for subscription)
 * @param options     - Optional configuration
 * @param options.apiHost         - Custom API host (defaults to TxLINE devnet)
 * @param options.serviceLevelId  - Service tier ID (default 1 = World Cup free)
 * @param options.weeks           - Subscription duration in weeks (default 4)
 * @param options.leagues         - League IDs for activation (default empty)
 * @param options.solanaRpcUrl    - Solana RPC URL (default devnet)
 * @returns ActivationResult containing the transaction signature and API token
 */
export async function activateApiToken(
  jwt: string,
  keypair: Keypair,
  options?: {
    apiHost?: string;
    serviceLevelId?: number;
    weeks?: number;
    leagues?: number[];
    solanaRpcUrl?: string;
  },
  ): Promise<ActivationResult> {
  const {
    apiHost,
    serviceLevelId = DEFAULT_SERVICE_LEVEL_ID,
    weeks = DEFAULT_WEEKS,
    leagues = [],
    solanaRpcUrl = DEFAULT_SOLANA_RPC,
  } = options ?? {};

  const client = createClient(apiHost);
  client.setJwt(jwt);

  const connection = new Connection(solanaRpcUrl, "confirmed");
  const txSig = await client.subscribeWithKeypair(
    keypair,
    serviceLevelId,
    weeks,
    connection,
  );
  const apiToken = await client.activate(txSig, leagues, keypair.secretKey);

  return { txSig, apiToken };
}

/**
 * Test connectivity with the TxLINE API.
 *
 * - Without arguments: attempts guest auth to verify the API is reachable.
 * - With a JWT: fetches the fixtures snapshot to verify the token is valid.
 * - With both JWT and API token: uses full auth headers.
 *
 * @param jwt      - Optional JWT for authenticated test
 * @param apiToken - Optional API token for full-access test
 * @param apiHost  - Optional custom API host (defaults to TxLINE devnet)
 * @returns `true` if the API responds successfully
 */
export async function testConnection(
  jwt?: string,
  apiToken?: string,
  apiHost?: string,
): Promise<TestResult> {
  const client = createClient(apiHost);

  if (!jwt) {
    try {
      await client.authenticate();
      return { ok: true, message: "Guest auth succeeded" };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during guest auth";
      return { ok: false, message };
    }
  }

  client.setJwt(jwt);
  if (apiToken) {
    client.setApiToken(apiToken);
  }

  try {
    await client.getFixturesSnapshot();
    return { ok: true, message: "Authenticated API access verified" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during API test";
    return { ok: false, message };
  }
}
