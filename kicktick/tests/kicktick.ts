// kicktick/tests/kicktick.ts
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';

import { Kicktick } from '../target/types/kicktick';

const TXORACLE_PROGRAM_ID = new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J');
const USDT_MINT = new PublicKey('ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh');

describe('KickTick', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Kicktick as Program<Kicktick>;
  const creator = provider.wallet;

  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  const fixtureId = 12345;
  const marketType = { oddsSpike: {} };
  const description = 'Will odds spike >15% in next 60s?';
  const durationSeconds = new anchor.BN(60);
  const yesOddsAtCreation = 500; // 50.0%

  it('Creates a new micro prediction market', async () => {
    const timestamp = Date.now();
    [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('market'),
        creator.publicKey.toBuffer(),
        Buffer.from(new anchor.BN(fixtureId).toArrayLike(Buffer, 'le', 8)),
        Buffer.from(new anchor.BN(timestamp).toArrayLike(Buffer, 'le', 8)),
      ],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), marketPda.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .createMarket(
        new anchor.BN(fixtureId),
        marketType,
        description,
        durationSeconds,
        yesOddsAtCreation
      )
      .accounts({
        creator: creator.publicKey,
        market: marketPda,
        vault: vaultPda,
        usdtMint: USDT_MINT,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketAccount = await program.account.predictionMarket.fetch(marketPda);
    assert.equal(marketAccount.fixtureId.toNumber(), fixtureId);
    assert.equal(marketAccount.description, description);
    assert.equal(marketAccount.status.open, true);
    assert.equal(marketAccount.totalYesAmount.toNumber(), 0);
    assert.equal(marketAccount.totalNoAmount.toNumber(), 0);
  });

  it('Places a YES bet', async () => {
    const bettor = Keypair.generate();
    const amount = new anchor.BN(1_000_000); // 1 USDT

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), bettor.publicKey.toBuffer(), marketPda.toBuffer()],
      program.programId
    );

    const bettorTokenAccount = anchor.utils.token.associatedAddress({
      mint: USDT_MINT,
      owner: bettor.publicKey,
    });

    await program.methods
      .placeBet({ yes: {} }, amount)
      .accounts({
        bettor: bettor.publicKey,
        market: marketPda,
        position: positionPda,
        vault: vaultPda,
        bettorTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor])
      .rpc();

    const marketAccount = await program.account.predictionMarket.fetch(marketPda);
    assert.equal(marketAccount.totalYesAmount.toNumber(), 1_000_000);
  });

  it('Places a NO bet', async () => {
    const bettor = Keypair.generate();
    const amount = new anchor.BN(500_000); // 0.5 USDT

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), bettor.publicKey.toBuffer(), marketPda.toBuffer()],
      program.programId
    );

    const bettorTokenAccount = anchor.utils.token.associatedAddress({
      mint: USDT_MINT,
      owner: bettor.publicKey,
    });

    await program.methods
      .placeBet({ no: {} }, amount)
      .accounts({
        bettor: bettor.publicKey,
        market: marketPda,
        position: positionPda,
        vault: vaultPda,
        bettorTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([bettor])
      .rpc();

    const marketAccount = await program.account.predictionMarket.fetch(marketPda);
    assert.equal(marketAccount.totalNoAmount.toNumber(), 500_000);
  });

  it('Settles market with YES outcome (odds spiked)', async () => {
    // Simulate: odds moved from 500 to 700 (>15% spike)
    const settleOddsValue = 700;
    const attestationTs = new anchor.BN(Date.now());

    const [dailyOddsMerkleRoots] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('daily_odds_merkle_roots'),
        Buffer.from(new anchor.BN(Math.floor(Date.now() / 86400)).toArrayLike(Buffer, 'le', 2)),
      ],
      TXORACLE_PROGRAM_ID
    );

    await program.methods
      .settleMarket(settleOddsValue, attestationTs)
      .accounts({
        market: marketPda,
        txoracleProgram: TXORACLE_PROGRAM_ID,
        dailyOddsMerkleRoots,
      })
      .rpc();

    const marketAccount = await program.account.predictionMarket.fetch(marketPda);
    assert.equal(marketAccount.status.settled, true);
    assert.equal(marketAccount.outcome.yes, true);
    assert.equal(marketAccount.settleOddsValue, 700);
  });

  it('Claims winnings for YES winner', async () => {
    // Winner claims their payout
    const winner = Keypair.generate();

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), winner.publicKey.toBuffer(), marketPda.toBuffer()],
      program.programId
    );

    const winnerTokenAccount = anchor.utils.token.associatedAddress({
      mint: USDT_MINT,
      owner: winner.publicKey,
    });

    await program.methods
      .claimWinnings()
      .accounts({
        winner: winner.publicKey,
        market: marketPda,
        position: positionPda,
        vault: vaultPda,
        winnerTokenAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([winner])
      .rpc();

    const positionAccount = await program.account.position.fetch(positionPda);
    assert.equal(positionAccount.claimed, true);
  });

  it('Fails to create market with invalid duration', async () => {
    try {
      await program.methods
        .createMarket(
          new anchor.BN(99999),
          marketType,
          'Too short',
          new anchor.BN(5), // < 15 seconds - invalid
          500
        )
        .accounts({
          creator: creator.publicKey,
          market: marketPda,
          vault: vaultPda,
          usdtMint: USDT_MINT,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail('Should have thrown error');
    } catch (err) {
      assert.include(err.message, 'InvalidDuration');
    }
  });
});
