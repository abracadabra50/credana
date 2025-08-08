import express from 'express';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import * as fs from 'fs';

const app = express();
app.use(express.json());

// Configuration
const PROGRAM_ID = new PublicKey('5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN');
const CONFIG_PDA = new PublicKey('DxfTMDhNkmNh4pryChfvQffKAGYXcSFcQ9G15puSQzGw');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Price assumptions (in production, use oracles)
const JITOSOL_PRICE = 220; // $220 per jitoSOL
const SOL_PRICE = 200; // $200 per SOL
const USDC_PRICE = 1; // $1 per USDC

// Credit parameters
const MAX_LTV = 0.85; // 85% maximum loan-to-value ratio
const SAFE_LTV = 0.65; // 65% safe LTV for new transactions
const MIN_HEALTH_FACTOR = 1.15; // Minimum 115% health factor

// Position cache (in production, use Redis)
const positionCache = new Map();

interface Position {
  owner: PublicKey;
  collateralAmount: number; // in lamports
  debtAmount: number; // in USDC (6 decimals)
  lastUpdate: number;
  isInitialized: boolean;
}

// Helper to get user's position from blockchain
async function getUserPosition(userPubkey: PublicKey): Promise<Position | null> {
  try {
    // Check cache first
    const cached = positionCache.get(userPubkey.toBase58());
    if (cached && Date.now() - cached.timestamp < 5000) { // 5 second cache
      return cached.position;
    }

    // Derive position PDA
    const [positionPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("position"), userPubkey.toBuffer()],
      PROGRAM_ID
    );

    // Fetch account
    const accountInfo = await connection.getAccountInfo(positionPDA);
    
    if (!accountInfo) {
      console.log(`❌ No position found for ${userPubkey.toBase58()}`);
      return null;
    }

    // Parse position data (simplified - in production use proper deserialization)
    const data = accountInfo.data;
    const position: Position = {
      owner: new PublicKey(data.slice(8, 40)),
      collateralAmount: Number(data.readBigUInt64LE(40)),
      debtAmount: Number(data.readBigUInt64LE(48)),
      lastUpdate: Number(data.readBigUInt64LE(56)),
      isInitialized: true
    };

    // Cache it
    positionCache.set(userPubkey.toBase58(), {
      position,
      timestamp: Date.now()
    });

    return position;
  } catch (error) {
    console.error('Error fetching position:', error);
    return null;
  }
}

// Calculate health factor
function calculateHealthFactor(position: Position): number {
  if (position.debtAmount === 0) return Infinity;
  
  const collateralValue = (position.collateralAmount / 1e9) * SOL_PRICE;
  const debtValue = position.debtAmount / 1e6;
  
  return collateralValue / debtValue;
}

// Calculate available credit
function calculateAvailableCredit(position: Position): number {
  const collateralValue = (position.collateralAmount / 1e9) * SOL_PRICE;
  const maxDebt = collateralValue * SAFE_LTV;
  const currentDebt = position.debtAmount / 1e6;
  
  return Math.max(0, maxDebt - currentDebt);
}

// Main authorization logic
async function authorizeTransaction(
  userPubkey: PublicKey,
  amountCents: number,
  merchant: string
): Promise<{ approved: boolean; reason?: string; details?: any }> {
  const amountDollars = amountCents / 100;
  
  console.log(`\n💳 AUTHORIZATION REQUEST`);
  console.log(`   User: ${userPubkey.toBase58()}`);
  console.log(`   Amount: $${amountDollars.toFixed(2)}`);
  console.log(`   Merchant: ${merchant}`);
  
  // Step 1: Get user's position
  const position = await getUserPosition(userPubkey);
  
  if (!position || !position.isInitialized) {
    console.log(`   ❌ DECLINED: No credit position`);
    return {
      approved: false,
      reason: 'NO_CREDIT_POSITION',
      details: { message: 'User has not initialized their credit position' }
    };
  }
  
  // Step 2: Calculate current metrics
  const healthFactor = calculateHealthFactor(position);
  const availableCredit = calculateAvailableCredit(position);
  const currentDebt = position.debtAmount / 1e6;
  const collateralValue = (position.collateralAmount / 1e9) * SOL_PRICE;
  const currentLTV = currentDebt / collateralValue;
  
  console.log(`\n   📊 POSITION ANALYSIS:`);
  console.log(`   Collateral: ${(position.collateralAmount / 1e9).toFixed(4)} SOL ($${collateralValue.toFixed(2)})`);
  console.log(`   Current Debt: $${currentDebt.toFixed(2)}`);
  console.log(`   Health Factor: ${healthFactor.toFixed(2)}`);
  console.log(`   Current LTV: ${(currentLTV * 100).toFixed(2)}%`);
  console.log(`   Available Credit: $${availableCredit.toFixed(2)}`);
  
  // Step 3: Check if transaction would exceed limits
  const newDebt = currentDebt + amountDollars;
  const newLTV = newDebt / collateralValue;
  const newHealthFactor = collateralValue / newDebt;
  
  console.log(`\n   📈 AFTER TRANSACTION:`);
  console.log(`   New Debt: $${newDebt.toFixed(2)}`);
  console.log(`   New LTV: ${(newLTV * 100).toFixed(2)}%`);
  console.log(`   New Health Factor: ${newHealthFactor.toFixed(2)}`);
  
  // Step 4: Make authorization decision
  
  // Check 1: Sufficient collateral
  if (collateralValue < 10) {
    console.log(`   ❌ DECLINED: Insufficient collateral`);
    return {
      approved: false,
      reason: 'INSUFFICIENT_COLLATERAL',
      details: {
        collateralValue,
        minimumRequired: 10
      }
    };
  }
  
  // Check 2: Available credit
  if (amountDollars > availableCredit) {
    console.log(`   ❌ DECLINED: Exceeds available credit`);
    return {
      approved: false,
      reason: 'EXCEEDS_CREDIT_LIMIT',
      details: {
        requested: amountDollars,
        available: availableCredit,
        shortfall: amountDollars - availableCredit
      }
    };
  }
  
  // Check 3: Health factor after transaction
  if (newHealthFactor < MIN_HEALTH_FACTOR) {
    console.log(`   ❌ DECLINED: Would breach minimum health factor`);
    return {
      approved: false,
      reason: 'HEALTH_FACTOR_TOO_LOW',
      details: {
        currentHealthFactor: healthFactor,
        newHealthFactor,
        minimum: MIN_HEALTH_FACTOR
      }
    };
  }
  
  // Check 4: LTV after transaction
  if (newLTV > MAX_LTV) {
    console.log(`   ❌ DECLINED: Would exceed maximum LTV`);
    return {
      approved: false,
      reason: 'LTV_TOO_HIGH',
      details: {
        currentLTV: currentLTV * 100,
        newLTV: newLTV * 100,
        maximum: MAX_LTV * 100
      }
    };
  }
  
  // Check 5: Risk-based limits
  if (amountDollars > 500 && currentLTV > 0.5) {
    console.log(`   ❌ DECLINED: Large transaction with high existing LTV`);
    return {
      approved: false,
      reason: 'RISK_LIMIT_EXCEEDED',
      details: {
        message: 'Large transactions require LTV below 50%',
        currentLTV: currentLTV * 100
      }
    };
  }
  
  // All checks passed!
  console.log(`   ✅ APPROVED!`);
  return {
    approved: true,
    details: {
      amountApproved: amountDollars,
      newDebt,
      newLTV: newLTV * 100,
      newHealthFactor,
      remainingCredit: availableCredit - amountDollars
    }
  };
}

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Credana Real Credit Engine',
    status: 'running',
    features: [
      'Real-time position checking',
      'Collateral-based credit limits',
      'Health factor monitoring',
      'LTV enforcement',
      'Risk-based authorization'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'REAL_CREDIT_DECISIONS',
    parameters: {
      MAX_LTV: `${MAX_LTV * 100}%`,
      SAFE_LTV: `${SAFE_LTV * 100}%`,
      MIN_HEALTH_FACTOR
    }
  });
});

// Real Lithic webhook endpoint
app.post('/api/webhooks/lithic/authorization', async (req, res) => {
  const { type, data } = req.body;
  
  console.log('\n════════════════════════════════════════════');
  console.log('🎯 LITHIC WEBHOOK RECEIVED');
  console.log('   Type:', type);
  console.log('   Time:', new Date().toISOString());
  
  if (type === 'authorization.request') {
    const amount = data?.amount || 0;
    const merchant = data?.merchant?.name || 'Unknown';
    const cardToken = data?.card_token;
    
    // Map card to user (in production, look up from database)
    // For testing, we'll use a hardcoded mapping
    const userWallet = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
    
    // Make real credit decision
    const decision = await authorizeTransaction(userWallet, amount, merchant);
    
    console.log('\n   DECISION:', decision.approved ? '✅ APPROVED' : '❌ DECLINED');
    if (decision.reason) {
      console.log('   REASON:', decision.reason);
    }
    console.log('════════════════════════════════════════════\n');
    
    // Return Lithic-compatible response
    res.json({
      approved: decision.approved,
      decline_reason: decision.reason,
      authorization_amount: decision.approved ? amount : 0,
      metadata: decision.details
    });
  } else {
    res.json({ received: true });
  }
});

// Test endpoint to check a user's credit
app.get('/api/credit/:wallet', async (req, res) => {
  try {
    const userPubkey = new PublicKey(req.params.wallet);
    const position = await getUserPosition(userPubkey);
    
    if (!position) {
      return res.status(404).json({
        error: 'No position found',
        wallet: req.params.wallet
      });
    }
    
    const healthFactor = calculateHealthFactor(position);
    const availableCredit = calculateAvailableCredit(position);
    const collateralValue = (position.collateralAmount / 1e9) * SOL_PRICE;
    const currentDebt = position.debtAmount / 1e6;
    const currentLTV = currentDebt / collateralValue;
    
    res.json({
      wallet: req.params.wallet,
      position: {
        collateral: {
          amount: position.collateralAmount / 1e9,
          value: collateralValue,
          currency: 'SOL'
        },
        debt: {
          amount: currentDebt,
          currency: 'USDC'
        },
        metrics: {
          healthFactor: healthFactor === Infinity ? 'Infinite' : healthFactor.toFixed(2),
          ltv: (currentLTV * 100).toFixed(2) + '%',
          availableCredit: availableCredit.toFixed(2)
        },
        limits: {
          maxLTV: `${MAX_LTV * 100}%`,
          safeLTV: `${SAFE_LTV * 100}%`,
          minHealthFactor: MIN_HEALTH_FACTOR
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid wallet address',
      message: error.message
    });
  }
});

// Test transaction endpoint
app.post('/api/test/transaction', async (req, res) => {
  const { wallet, amount, merchant } = req.body;
  
  if (!wallet || !amount) {
    return res.status(400).json({
      error: 'Missing required fields: wallet, amount'
    });
  }
  
  try {
    const userPubkey = new PublicKey(wallet);
    const decision = await authorizeTransaction(
      userPubkey,
      amount,
      merchant || 'Test Merchant'
    );
    
    res.json(decision);
  } catch (error) {
    res.status(400).json({
      error: 'Invalid request',
      message: error.message
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║     🚀 CREDANA REAL CREDIT ENGINE                     ║
║                                                        ║
║     Making REAL credit decisions based on:            ║
║     • On-chain collateral                             ║
║     • Current debt levels                             ║
║     • Health factors                                  ║
║     • LTV ratios                                      ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

📍 Server: http://localhost:${PORT}
📊 Health: http://localhost:${PORT}/health
💳 Webhook: POST http://localhost:${PORT}/api/webhooks/lithic/authorization
🔍 Check Credit: GET http://localhost:${PORT}/api/credit/:wallet
🧪 Test Transaction: POST http://localhost:${PORT}/api/test/transaction

Credit Parameters:
• Maximum LTV: ${MAX_LTV * 100}%
• Safe LTV: ${SAFE_LTV * 100}%
• Min Health Factor: ${MIN_HEALTH_FACTOR}
• SOL Price: $${SOL_PRICE}

This server makes REAL credit decisions!
Transactions will be DECLINED if:
- Insufficient collateral
- Exceeds credit limit
- Health factor too low
- LTV too high
- Risk limits exceeded
`);
}); 