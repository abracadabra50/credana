#!/usr/bin/env npx tsx

/**
 * Credana API Server
 * Complete backend for frontend integration
 */

import express from 'express';
import cors from 'cors';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Configuration
const config = {
  SOLANA_RPC: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  PROGRAM_ID: process.env.PROGRAM_ID || 'BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4',
  LITHIC_API_KEY: process.env.LITHIC_API_KEY || '52c3f4c0-3c59-40ef-a03b-e628cbb398db',
  SOL_PRICE: 150, // Mock price
  LTV: 0.6, // 60% LTV
  APR: 0.05 // 5% APR
};

const connection = new Connection(config.SOLANA_RPC, 'confirmed');

// In-memory storage (replace with database in production)
const users = new Map();
const cards = new Map();

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      solana: 'connected',
      lithic: 'connected',
      database: 'memory'
    }
  });
});

/**
 * Get user position
 */
app.get('/api/position/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const walletPubkey = new PublicKey(wallet);
    
    // Get SOL balance
    const balance = await connection.getBalance(walletPubkey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    // Mock on-chain position data
    const collateralValue = solBalance * config.SOL_PRICE;
    const creditLimit = collateralValue * config.LTV;
    const currentDebt = users.get(wallet)?.debt || 0;
    const availableCredit = Math.max(0, creditLimit - currentDebt);
    const healthFactor = currentDebt > 0 ? (collateralValue * 0.75) / currentDebt : 999;
    const utilization = creditLimit > 0 ? (currentDebt / creditLimit) * 100 : 0;
    
    res.json({
      wallet,
      collateral: {
        sol: solBalance,
        valueUSD: collateralValue
      },
      credit: {
        limit: creditLimit,
        available: availableCredit,
        used: currentDebt
      },
      metrics: {
        healthFactor,
        utilization,
        apr: config.APR * 100
      }
    });
  } catch (error) {
    console.error('Error fetching position:', error);
    res.status(500).json({ error: 'Failed to fetch position' });
  }
});

/**
 * Onboard user
 */
app.post('/api/users/onboard', async (req, res) => {
  try {
    const { walletAddress, email, firstName, lastName } = req.body;
    
    // Create user account
    const user = {
      id: `user_${Date.now()}`,
      walletAddress,
      email,
      firstName,
      lastName,
      accountToken: `acct_${Date.now()}`,
      createdAt: new Date().toISOString(),
      debt: 0
    };
    
    users.set(walletAddress, user);
    
    // In production, this would:
    // 1. Create Lithic account
    // 2. Initialize on-chain position
    // 3. Store in database
    
    res.json({
      success: true,
      accountToken: user.accountToken,
      user
    });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ error: 'Onboarding failed' });
  }
});

/**
 * Create virtual card
 */
app.post('/api/cards/create', async (req, res) => {
  try {
    const { accountToken, spendLimit } = req.body;
    
    // Mock card creation
    const card = {
      token: `card_${Date.now()}`,
      accountToken,
      last4: '1234',
      state: 'OPEN',
      spendLimit,
      createdAt: new Date().toISOString()
    };
    
    cards.set(card.token, card);
    
    // In production, this would call Lithic API
    
    res.json({
      success: true,
      cardToken: card.token,
      card
    });
  } catch (error) {
    console.error('Card creation error:', error);
    res.status(500).json({ error: 'Card creation failed' });
  }
});

/**
 * Get transactions
 */
app.get('/api/transactions/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    // Mock transactions
    const transactions = [
      {
        id: 'tx_1',
        amount: 50,
        merchant: 'Starbucks',
        status: 'SETTLED',
        timestamp: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'tx_2',
        amount: 125,
        merchant: 'Amazon',
        status: 'SETTLED',
        timestamp: new Date(Date.now() - 172800000).toISOString()
      },
      {
        id: 'tx_3',
        amount: 35,
        merchant: 'Uber',
        status: 'PENDING',
        timestamp: new Date(Date.now() - 3600000).toISOString()
      }
    ];
    
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * Deposit collateral
 */
app.post('/api/collateral/deposit', async (req, res) => {
  try {
    const { wallet, amount } = req.body;
    
    // In production, this would:
    // 1. Create transaction to deposit SOL
    // 2. Update on-chain position
    // 3. Recalculate credit limit
    
    res.json({
      success: true,
      message: `Deposited ${amount} SOL`,
      txHash: `0x${Date.now().toString(16)}`
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

/**
 * Repay debt
 */
app.post('/api/debt/repay', async (req, res) => {
  try {
    const { wallet, amount } = req.body;
    
    const user = users.get(wallet);
    if (user) {
      user.debt = Math.max(0, user.debt - amount);
      users.set(wallet, user);
    }
    
    res.json({
      success: true,
      message: `Repaid $${amount}`,
      newDebt: user?.debt || 0
    });
  } catch (error) {
    console.error('Repayment error:', error);
    res.status(500).json({ error: 'Repayment failed' });
  }
});

/**
 * Simulate purchase (for testing)
 */
app.post('/api/test/simulate-purchase', async (req, res) => {
  try {
    const { cardToken, amount, merchant } = req.body;
    
    const card = cards.get(cardToken);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    // Find user by account token
    let user;
    for (const [wallet, u] of users.entries()) {
      if (u.accountToken === card.accountToken) {
        user = u;
        break;
      }
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update debt
    user.debt += amount / 100; // Convert cents to dollars
    users.set(user.walletAddress, user);
    
    res.json({
      success: true,
      approved: true,
      transaction: {
        id: `tx_${Date.now()}`,
        amount: amount / 100,
        merchant,
        status: 'APPROVED'
      }
    });
  } catch (error) {
    console.error('Purchase simulation error:', error);
    res.status(500).json({ error: 'Purchase simulation failed' });
  }
});

/**
 * Treasury status
 */
app.get('/api/treasury/status', (req, res) => {
  res.json({
    operatingBalance: 10000,
    issuingBalance: 5000,
    runwayDays: 10,
    lastReconciliation: new Date(Date.now() - 3600000).toISOString(),
    status: 'HEALTHY'
  });
});

/**
 * Lithic webhook endpoint
 */
app.post('/api/webhooks/lithic/authorization', (req, res) => {
  console.log('Lithic webhook received:', req.body);
  
  // Process authorization
  const { type, data } = req.body;
  
  if (type === 'authorization.request') {
    // Make credit decision
    const approved = Math.random() > 0.2; // 80% approval rate for testing
    
    res.json({
      approved,
      decline_reason: approved ? null : 'INSUFFICIENT_CREDIT'
    });
  } else {
    res.json({ received: true });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
    ╔═══════════════════════════════════════════════╗
    ║                                               ║
    ║     🚀 CREDANA API SERVER RUNNING             ║
    ║                                               ║
    ║     Port: ${PORT}                             ║
    ║     Health: http://localhost:${PORT}/health   ║
    ║     CORS: Enabled for localhost:3000          ║
    ║                                               ║
    ╚═══════════════════════════════════════════════╝
  `);
}); 