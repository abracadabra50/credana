/**
 * Transaction Signing Routes
 * Requires passkey-bound session
 */

import { Router } from 'express';
import { z } from 'zod';
import { verifySession } from '../lib/jwt';
import { tkSignSolana, tkGetWalletInfo } from '../lib/turnkey';
import { db } from '../lib/db';
import { 
  Connection, 
  Transaction, 
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL 
} from '@solana/web3.js';

const router = Router();

// Middleware to verify passkey-bound session
const requirePasskey = (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    const payload = verifySession(token);
    
    if (!payload.passkeyBound) {
      return res.status(401).json({ 
        error: 'Passkey authentication required for signing',
        needPasskey: true 
      });
    }
    
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid session' });
  }
};

/**
 * Sign a Solana transaction
 */
router.post('/sign/solana', requirePasskey, async (req, res) => {
  try {
    const schema = z.object({
      txBase64: z.string(),
      description: z.string().optional(),
    });
    
    const { txBase64, description } = schema.parse(req.body);
    const { uid, orgId, walletId } = req.user;
    
    if (!orgId || !walletId) {
      return res.status(400).json({ 
        error: 'Turnkey wallet not configured' 
      });
    }
    
    // Get user for Turnkey user ID
    const user = db.getUserById(uid);
    if (!user || !user.turnkeyUserId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Validate transaction before signing
    try {
      const txBuffer = Buffer.from(txBase64, 'base64');
      const tx = Transaction.from(txBuffer);
      
      // Check if transaction interacts with approved programs
      const CREDANA_PROGRAM_ID = process.env.PROGRAM_ID || 'BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4';
      const hasCredanaInstruction = tx.instructions.some(
        ix => ix.programId.toString() === CREDANA_PROGRAM_ID
      );
      
      if (!hasCredanaInstruction && process.env.NODE_ENV === 'production') {
        return res.status(403).json({ 
          error: 'Transaction must interact with Credana program' 
        });
      }
      
      console.log(`[Sign] User ${uid} signing transaction:`, {
        description,
        instructions: tx.instructions.length,
        signatures: tx.signatures.length,
      });
    } catch (error) {
      console.error('[Sign] Invalid transaction:', error);
      return res.status(400).json({ error: 'Invalid transaction format' });
    }
    
    // Sign with Turnkey
    const result = await tkSignSolana(
      orgId,
      walletId,
      txBase64,
      user.turnkeyUserId
    );
    
    res.json({
      success: true,
      signedTxBase64: result.signatureBase64,
      activityId: result.activityId,
      description,
    });
  } catch (error: any) {
    console.error('[Sign] Solana signing error:', error);
    res.status(400).json({
      error: error.message || 'Failed to sign transaction',
    });
  }
});

/**
 * Build and sign a deposit collateral transaction
 */
router.post('/sign/deposit-collateral', requirePasskey, async (req, res) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      tokenMint: z.string().optional(),
    });
    
    const { amount, tokenMint } = schema.parse(req.body);
    const { uid, orgId, walletId } = req.user;
    
    if (!orgId || !walletId) {
      return res.status(400).json({ 
        error: 'Turnkey wallet not configured' 
      });
    }
    
    // Get user
    const user = db.getUserById(uid);
    if (!user || !user.solanaAddress || !user.turnkeyUserId) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Build transaction
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
    );
    
    const userPubkey = new PublicKey(user.solanaAddress);
    const programId = new PublicKey(
      process.env.PROGRAM_ID || 'BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4'
    );
    
    // Create deposit instruction
    // This is a simplified example - adapt to your actual program interface
    const tx = new Transaction();
    
    // Add compute budget if needed
    tx.add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: programId,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPubkey;
    
    // Serialize transaction
    const txBuffer = tx.serialize({ 
      requireAllSignatures: false,
      verifySignatures: false 
    });
    const txBase64 = txBuffer.toString('base64');
    
    // Sign with Turnkey
    const result = await tkSignSolana(
      orgId,
      walletId,
      txBase64,
      user.turnkeyUserId
    );
    
    res.json({
      success: true,
      signedTxBase64: result.signatureBase64,
      activityId: result.activityId,
      amount,
      tokenMint,
    });
  } catch (error: any) {
    console.error('[Sign] Deposit collateral error:', error);
    res.status(400).json({
      error: error.message || 'Failed to sign deposit transaction',
    });
  }
});

/**
 * Get wallet info and recent activity
 */
router.get('/wallet/info', requirePasskey, async (req, res) => {
  try {
    const { uid, orgId, walletId } = req.user;
    
    if (!orgId || !walletId) {
      return res.status(400).json({ 
        error: 'Turnkey wallet not configured' 
      });
    }
    
    // Get wallet info from Turnkey
    const walletInfo = await tkGetWalletInfo(orgId, walletId);
    
    // Get user
    const user = db.getUserById(uid);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get on-chain balance if address exists
    let balance = 0;
    if (user.solanaAddress) {
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
      );
      
      const pubkey = new PublicKey(user.solanaAddress);
      balance = await connection.getBalance(pubkey);
    }
    
    res.json({
      wallet: {
        address: user.solanaAddress,
        balance: balance / LAMPORTS_PER_SOL,
        ...walletInfo.wallet,
      },
      recentActivity: walletInfo.recentActivities,
    });
  } catch (error: any) {
    console.error('[Wallet] Info error:', error);
    res.status(400).json({
      error: error.message || 'Failed to get wallet info',
    });
  }
});

export default router; 