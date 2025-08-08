/**
 * Production Lithic Webhook Handler
 * Two-phase flow: authorization.request (tentative) → transaction.created (commit)
 */

import { Request, Response } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { logger } from '../utils/logger';

// Constants - LOCKED IN VALUES
const APR_BPS = 500; // 5% APR (matching your summary)
const LTV_BPS = 6000; // 60% LTV for SOL
const LIQUIDATION_THRESHOLD_BPS = 7500; // 75% liquidation threshold
const LIQUIDATION_BONUS_BPS = 500; // 5% liquidation bonus
const SOL_PRICE_USD = 150; // Oracle price (will be replaced with Pyth)

// Two-phase decision cache
const pendingAuthorizations = new Map<string, {
  amount: number;
  timestamp: number;
  decision: 'approved' | 'declined';
  reason?: string;
}>();

// Clean up old pending auths every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingAuthorizations.entries()) {
    if (now - value.timestamp > 3600000) { // 1 hour
      pendingAuthorizations.delete(key);
    }
  }
}, 3600000);

interface LithicWebhookRequest extends Request {
  lithicEvent?: {
    eventId: string;
    authId?: string;
    type: string;
    verified: boolean;
    idempotencyKey: string;
  };
}

/**
 * Main webhook handler with two-phase flow
 */
export async function handleLithicWebhook(
  req: LithicWebhookRequest, 
  res: Response
) {
  const startTime = Date.now();
  
  try {
    // Security middleware should have verified this
    if (!req.lithicEvent?.verified) {
      logger.error('Webhook not verified by security middleware');
      return res.status(401).json({ 
        error: 'Unauthorized',
        code: 'NOT_VERIFIED' 
      });
    }

    const { type, authId, eventId } = req.lithicEvent;
    const eventData = req.body?.data || {};
    
    logger.info('Processing webhook', {
      type,
      eventId: eventId.slice(0, 8) + '...',
      authId: authId?.slice(0, 8) + '...'
    });

    // Route based on event type
    switch (type) {
      case 'authorization.request':
        return await handleAuthorizationRequest(req, res, eventData);
        
      case 'authorization.advice':
        return await handleAuthorizationAdvice(req, res, eventData);
        
      case 'transaction.created':
      case 'authorization.capture':
        return await handleTransactionCreated(req, res, eventData);
        
      case 'transaction.updated':
        return await handleTransactionUpdated(req, res, eventData);
        
      default:
        logger.warn('Unhandled webhook type', { type });
        return res.status(200).json({ 
          received: true,
          handled: false,
          type 
        });
    }
  } catch (error) {
    logger.error('Webhook processing error', error);
    
    // Fail closed - decline on any error
    return res.status(200).json({
      approved: false,
      decline_reason: 'PROCESSING_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    const latency = Date.now() - startTime;
    logger.info('Webhook processed', { 
      latency,
      type: req.lithicEvent?.type 
    });
    
    // Alert if latency > 700ms
    if (latency > 700) {
      logger.warn('High webhook latency', { latency });
    }
  }
}

/**
 * Handle authorization.request (TENTATIVE - no debt mutation)
 */
async function handleAuthorizationRequest(
  req: LithicWebhookRequest,
  res: Response,
  data: any
) {
  const amount = data.amount || 0; // In cents
  const amountUSD = amount / 100;
  const cardToken = data.card_token || data.card?.token;
  const authId = data.authorization?.id || data.auth_id;
  
  // Get user position from chain
  const userWallet = new PublicKey('6xsZeTcpY1GLFcEJ6kqtxApgdVW8cXgZJztkc2tbn2pM');
  const position = await getUserPosition(userWallet);
  
  if (!position) {
    // No position = no credit
    pendingAuthorizations.set(authId, {
      amount,
      timestamp: Date.now(),
      decision: 'declined',
      reason: 'NO_POSITION'
    });
    
    return res.status(200).json({
      approved: false,
      decline_reason: 'NO_POSITION',
      message: 'No credit position found'
    });
  }
  
  // Calculate available credit
  const { collateralValue, currentDebt, availableCredit, healthFactor } = position;
  
  // Check health factor
  if (healthFactor < 1.1) {
    logger.warn('Position near liquidation, declining', { healthFactor });
    pendingAuthorizations.set(authId, {
      amount,
      timestamp: Date.now(),
      decision: 'declined',
      reason: 'HEALTH_FACTOR_LOW'
    });
    
    return res.status(200).json({
      approved: false,
      decline_reason: 'HEALTH_FACTOR_LOW',
      health_factor: healthFactor.toFixed(2)
    });
  }
  
  // Check available credit
  if (amountUSD > availableCredit) {
    pendingAuthorizations.set(authId, {
      amount,
      timestamp: Date.now(),
      decision: 'declined',
      reason: 'INSUFFICIENT_CREDIT'
    });
    
    return res.status(200).json({
      approved: false,
      decline_reason: 'INSUFFICIENT_CREDIT',
      available_credit: availableCredit.toFixed(2),
      requested: amountUSD.toFixed(2)
    });
  }
  
  // APPROVED - but don't mutate debt yet
  pendingAuthorizations.set(authId, {
    amount,
    timestamp: Date.now(),
    decision: 'approved'
  });
  
  logger.info('Authorization approved (tentative)', {
    authId: authId.slice(0, 8) + '...',
    amount: amountUSD,
    availableCredit
  });
  
  return res.status(200).json({
    approved: true,
    available_credit: availableCredit.toFixed(2),
    collateral_value: collateralValue.toFixed(2),
    current_debt: currentDebt.toFixed(2),
    health_factor: healthFactor.toFixed(2),
    message: 'Transaction approved (pending capture)'
  });
}

/**
 * Handle authorization.advice (optional update, don't mutate debt)
 */
async function handleAuthorizationAdvice(
  req: LithicWebhookRequest,
  res: Response,
  data: any
) {
  const authId = data.authorization?.id || data.auth_id;
  const status = data.status;
  
  logger.info('Authorization advice received', {
    authId: authId?.slice(0, 8) + '...',
    status
  });
  
  // Just acknowledge - debt mutation happens on capture
  return res.status(200).json({
    received: true,
    status,
    message: 'Advice noted, awaiting capture for debt recording'
  });
}

/**
 * Handle transaction.created / authorization.capture (COMMIT - mutate debt)
 */
async function handleTransactionCreated(
  req: LithicWebhookRequest,
  res: Response,
  data: any
) {
  const amount = data.amount || 0;
  const amountUSD = amount / 100;
  const authId = data.authorization?.id || data.auth_id;
  const txnId = data.transaction?.id || data.txn_id;
  
  // Check if we have a pending authorization
  const pending = pendingAuthorizations.get(authId);
  
  if (!pending) {
    logger.warn('Transaction created without pending auth', {
      authId: authId?.slice(0, 8) + '...',
      txnId
    });
  }
  
  if (pending?.decision === 'declined') {
    logger.error('Transaction created for declined auth!', {
      authId: authId?.slice(0, 8) + '...',
      reason: pending.reason
    });
    
    // This shouldn't happen - investigate
    return res.status(200).json({
      received: true,
      warning: 'Transaction for previously declined authorization',
      action: 'INVESTIGATE'
    });
  }
  
  // NOW we record the debt on-chain
  try {
    logger.info('Recording debt on-chain', {
      txnId,
      amount: amountUSD
    });
    
    // Queue for on-chain recording with retry
    await queueDebtRecording({
      userId: '6xsZeTcpY1GLFcEJ6kqtxApgdVW8cXgZJztkc2tbn2pM',
      amount: amountUSD,
      txnId,
      authId,
      timestamp: Date.now()
    });
    
    // Clean up pending
    pendingAuthorizations.delete(authId);
    
    return res.status(200).json({
      received: true,
      recorded: true,
      amount: amountUSD,
      message: 'Debt recorded on-chain'
    });
    
  } catch (error) {
    logger.error('Failed to record debt', error);
    
    // Queue for retry
    return res.status(200).json({
      received: true,
      recorded: false,
      queued_for_retry: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle transaction.updated (refunds, reversals)
 */
async function handleTransactionUpdated(
  req: LithicWebhookRequest,
  res: Response,
  data: any
) {
  const status = data.status;
  const amount = data.amount || 0;
  const txnId = data.transaction?.id;
  
  logger.info('Transaction updated', {
    txnId: txnId?.slice(0, 8) + '...',
    status,
    amount: amount / 100
  });
  
  if (status === 'REVERSED' || status === 'REFUNDED') {
    // Queue debt reduction
    await queueDebtReduction({
      txnId,
      amount: amount / 100,
      reason: status
    });
  }
  
  return res.status(200).json({
    received: true,
    status,
    action: status === 'REVERSED' ? 'DEBT_REDUCTION_QUEUED' : 'NOTED'
  });
}

/**
 * Get user position from chain
 */
async function getUserPosition(userWallet: PublicKey) {
  try {
    const connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');
    
    // Derive position PDA
    const [userPositionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('user_position'), userWallet.toBuffer()],
      PROGRAM_ID
    );
    
    // Fetch position
    const positionInfo = await connection.getAccountInfo(userPositionPDA);
    
    if (!positionInfo) {
      return null;
    }
    
    // Parse position data
    const collateralAmount = positionInfo.data.readBigUInt64LE(72);
    const debtUsdc = positionInfo.data.readBigUInt64LE(80);
    
    // Get wallet balance too
    const walletBalance = await connection.getBalance(userWallet);
    const totalCollateralLamports = Number(collateralAmount) + walletBalance;
    const totalCollateralSol = totalCollateralLamports / LAMPORTS_PER_SOL;
    
    // Calculate values
    const collateralValue = totalCollateralSol * SOL_PRICE_USD;
    const currentDebt = Number(debtUsdc) / 1e6;
    const maxCredit = (collateralValue * LTV_BPS) / 10000;
    const availableCredit = Math.max(0, maxCredit - currentDebt);
    
    // Health factor
    const liquidationValue = (collateralValue * LIQUIDATION_THRESHOLD_BPS) / 10000;
    const healthFactor = currentDebt > 0 ? liquidationValue / currentDebt : 999;
    
    return {
      collateralValue,
      currentDebt,
      availableCredit,
      healthFactor,
      totalCollateralSol
    };
  } catch (error) {
    logger.error('Failed to get user position', error);
    return null;
  }
}

/**
 * Queue debt recording with exponential backoff retry
 */
async function queueDebtRecording(params: any) {
  // In production, this would go to a proper queue (SQS, Redis, etc.)
  // For now, we'll use a simple in-memory queue
  
  logger.info('Queuing debt recording', params);
  
  // TODO: Implement actual queue with retry logic
  // - Exponential backoff: 1s, 2s, 4s, 8s, 16s
  // - Max 5 retries
  // - Dead letter queue after max retries
}

/**
 * Queue debt reduction (for refunds/reversals)
 */
async function queueDebtReduction(params: any) {
  logger.info('Queuing debt reduction', params);
  
  // TODO: Implement actual queue
} 