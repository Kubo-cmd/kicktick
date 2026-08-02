// lib/constants.ts
// Program IDs and network config for KickTick

// Vite injects import.meta.env at build time. VITE_ overrides let the same
// build target localnet for full-stack E2E without touching committed defaults.
// Default stays devnet (matches declare_id! + Anchor.toml [programs.devnet]).
const env = (typeof import.meta !== 'undefined' ? (import.meta as any).env : {}) ?? {};

const CLUSTER: 'devnet' | 'localnet' =
  env.VITE_KICKTICK_CLUSTER === 'localnet' ? 'localnet' : 'devnet';

const RPC_URL: string =
  env.VITE_KICKTICK_RPC_URL ??
  (CLUSTER === 'localnet'
    ? 'http://127.0.0.1:8899'
    : 'https://api.devnet.solana.com');

export const CONFIG = {
  // Solana cluster
  cluster: CLUSTER,
  rpcUrl: RPC_URL,

  // KickTick program
  // devnet  — matches declare_id! + Anchor.toml [programs.devnet]
  // localnet — Anchor.toml [programs.localnet] (CCmcpUZtt) unless overridden
  kicktickProgramId:
    env.VITE_KICKTICK_PROGRAM_ID ??
    (CLUSTER === 'localnet'
      ? 'CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc'
      : 'a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2'),

  // TxODDS Oracle
  txodds: {
    devnet: {
      apiBase: 'https://txline-dev.txodds.com',
      programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
      usdtMint: 'ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh',
    },
    mainnet: {
      apiBase: 'https://txline.txodds.com',
      programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
      usdtMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    },
  },

  // Market settings
  minDuration: 15,       // seconds
  maxDuration: 300,      // seconds
  settleGracePeriod: 60, // seconds after expiry
} as const;
