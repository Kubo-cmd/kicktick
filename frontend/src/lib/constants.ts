// lib/constants.ts
// Program IDs and network config for KickTick

export const CONFIG = {
  // Solana cluster
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',

  // KickTick program (devnet — matches declare_id! + Anchor.toml [programs.devnet])
  kicktickProgramId: 'a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2',

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
