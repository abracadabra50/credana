import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { connection, wallet, CREDANA_PROGRAM_ID, getUserPositionPDA, getConfigPDA } from './solana-client';
import { logger } from '../../utils/logger';
import { recordMetrics } from '../../utils/metrics';

// Instruction discriminators (first 8 bytes of instruction data)
const RECORD_DEBT_DISCRIMINATOR = Buffer.from([0x4f, 0x3a, 0x94, 0x8c, 0x7d, 0x5a, 0xb2, 0x1f]);

export interface RecordDebtParams {
  userWallet: string;
  usdcAmount: number; // Amount in cents
  transactionId: string;
}

export async function recordDebtOnChain({
  userWallet,
  usdcAmount,
  transactionId,
}: RecordDebtParams): Promise<string | null> {
  const startTime = Date.now();
  
  try {
    logger.info('Recording debt on-chain', {
      userWallet,
      usdcAmount,
      transactionId,
    });

    const userPubkey = new PublicKey(userWallet);
    const [userPositionPDA] = getUserPositionPDA(userPubkey);
    const [configPDA] = getConfigPDA();

    // Convert cents to on-chain USDC amount (6 decimals)
    // $1.00 = 100 cents = 1,000,000 micro-USDC
    const usdcAmountOnChain = usdcAmount * 10000; // 100 cents * 10000 = 1M micro-USDC

    // Create record_debt instruction
    const recordDebtIx = createRecordDebtInstruction({
      userPosition: userPositionPDA,
      config: configPDA,
      authority: wallet.publicKey,
      usdcAmount: usdcAmountOnChain,
    });

    // Build and send transaction
    const transaction = new Transaction().add(recordDebtIx);
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign transaction
    transaction.sign(wallet);

    // Send transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }
    );

    // Confirm transaction
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    if (confirmation.value.err) {
      logger.error('Transaction failed', {
        signature,
        error: confirmation.value.err,
        userWallet,
        usdcAmount,
      });
      return null;
    }

    const responseTime = Date.now() - startTime;
    
    logger.info('Debt recorded successfully', {
      signature,
      userWallet,
      usdcAmount,
      usdcAmountOnChain,
      transactionId,
      responseTime,
    });

    recordMetrics('blockchain.record_debt.success', 1, {
      userWallet: userWallet.slice(0, 8),
    });
    recordMetrics('blockchain.record_debt.response_time', responseTime);

    return signature;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Failed to record debt on-chain', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userWallet,
      usdcAmount,
      transactionId,
      responseTime,
    });

    recordMetrics('blockchain.record_debt.error', 1, {
      error: error instanceof Error ? error.constructor.name : 'UnknownError',
    });

    return null;
  }
}

function createRecordDebtInstruction({
  userPosition,
  config,
  authority,
  usdcAmount,
}: {
  userPosition: PublicKey;
  config: PublicKey;
  authority: PublicKey;
  usdcAmount: number;
}): TransactionInstruction {
  // Instruction data: discriminator (8 bytes) + usdc_amount (8 bytes)
  const data = Buffer.alloc(16);
  RECORD_DEBT_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(usdcAmount), 8);

  return new TransactionInstruction({
    keys: [
      { pubkey: userPosition, isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: CREDANA_PROGRAM_ID,
    data,
  });
}

// Helper function to initialize user position (if needed)
export async function initializeUserPosition(userWallet: string): Promise<string | null> {
  try {
    const userPubkey = new PublicKey(userWallet);
    const [userPositionPDA] = getUserPositionPDA(userPubkey);

    // Check if position already exists
    const existingAccount = await connection.getAccountInfo(userPositionPDA);
    if (existingAccount) {
      logger.info('User position already exists', { userWallet, userPositionPDA: userPositionPDA.toString() });
      return null;
    }

    // TODO: Implement init_position instruction
    logger.info('User position initialization needed', { userWallet });
    return null;

  } catch (error) {
    logger.error('Failed to initialize user position', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userWallet,
    });
    return null;
  }
}

// Helper function to get current debt (placeholder)
export async function getCurrentDebt(userWallet: string): Promise<number> {
  try {
    const userPubkey = new PublicKey(userWallet);
    const [userPositionPDA] = getUserPositionPDA(userPubkey);

    const accountInfo = await connection.getAccountInfo(userPositionPDA);
    if (!accountInfo) {
      return 0; // No position = no debt
    }

    // TODO: Parse account data to extract debt
    // For now, return 0
    return 0;

  } catch (error) {
    logger.error('Failed to get current debt', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userWallet,
    });
    return 0;
  }
} 