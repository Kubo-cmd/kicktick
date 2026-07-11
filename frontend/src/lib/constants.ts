// lib/constants.ts
// Program IDs and network config for KickTick

export const CONFIG = {
  // Solana cluster
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',

  // KickTick program (replace after deploy)
  kicktickProgramId: 'DU7KRbgpjdhKtmHwNawUCvy61WMazi76unzNB2Y1chTJ',

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
