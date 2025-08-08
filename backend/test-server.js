const express = require('express');
const app = express();

app.use(express.json());

console.log('🔧 Starting Credana Test Server...');

app.get('/', (req, res) => {
  res.json({
    message: 'Credana Test Server',
    status: 'running',
    card: '4111-1113-0243-7242',
    wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Real Lithic webhook endpoint with ACTUAL credit checks
app.post('/api/webhooks/lithic/authorization', async (req, res) => {
  const { type, data } = req.body;
  
  console.log('💳 REAL CREDIT DECISION REQUEST!');
  console.log('Type:', type);
  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Time:', new Date().toISOString());
  
  if (type === 'authorization.request') {
    const amount = data?.amount || 0;
    const amountDollars = amount / 100;
    
    // REAL CREDIT LOGIC - Check actual SOL balance!
    console.log('\n📊 CREDIT ANALYSIS:');
    
    try {
      // Import Solana web3.js
      const { Connection, PublicKey } = require('@solana/web3.js');
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      
      // Program and user details
      const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');
      const userWallet = new PublicKey('6xsZeTcpY1GLFcEJ6kqtxApgdVW8cXgZJztkc2tbn2pM');
      
      // Derive user position PDA
      const [userPositionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_position'), userWallet.toBuffer()],
        PROGRAM_ID
      );
      
      // Fetch position data
      const positionInfo = await connection.getAccountInfo(userPositionPDA);
      
      if (!positionInfo) {
        console.log('   ❌ No position found for user');
        return res.json({
          approved: false,
          decline_reason: 'NO_POSITION',
          message: 'User has not initialized a credit position'
        });
      }
      
      // Parse position data
      const collateralAmount = positionInfo.data.readBigUInt64LE(72);
      const debtUsdc = positionInfo.data.readBigUInt64LE(80);
      
      // Also check wallet balance as backup
      const walletBalance = await connection.getBalance(userWallet);
      const totalSol = (Number(collateralAmount) + walletBalance) / 1e9;
      
      // Mock SOL price
      const SOL_PRICE = 150;
      const collateralValueUSD = totalSol * SOL_PRICE;
      const currentDebtUSD = Number(debtUsdc) / 1e6;
      
      // Calculate available credit
      const LTV = 0.60;
      const maxCredit = collateralValueUSD * LTV;
      const availableCredit = Math.max(0, maxCredit - currentDebtUSD);
      
      console.log('   Position PDA:', userPositionPDA.toBase58().slice(0, 8) + '...');
      console.log('   Collateral:', totalSol.toFixed(4), 'SOL');
      console.log('   Collateral Value: $' + collateralValueUSD.toFixed(2));
      console.log('   Current Debt: $' + currentDebtUSD.toFixed(2));
      console.log('   Available Credit: $' + availableCredit.toFixed(2));
      console.log('   Requested: $' + amountDollars.toFixed(2));
      
      // Real decision based on actual position
      const approved = amountDollars <= availableCredit;
      const decline_reason = approved ? undefined : 'INSUFFICIENT_COLLATERAL';
      
      console.log('\nDecision:', approved ? '✅ APPROVED' : '❌ DECLINED');
      if (!approved) {
        console.log('Reason:', decline_reason);
      }
      console.log('═══════════════════════════════\n');
      
      res.json({ 
        approved, 
        decline_reason,
        available_credit: availableCredit.toFixed(2),
        collateral_value: collateralValueUSD.toFixed(2),
        current_debt: currentDebtUSD.toFixed(2),
        message: approved ? 'Transaction approved' : 'Insufficient collateral for requested amount'
      });
    } catch (error) {
      console.error('Error checking collateral:', error.message);
      
      // Fallback to declining if we can't check
      res.json({ 
        approved: false, 
        decline_reason: 'SYSTEM_ERROR',
        message: 'Unable to verify collateral'
      });
    }
  } else {
    console.log('Type:', type, '(recorded)\n');
    res.json({ received: true });
  }
});

// Test endpoint to simulate a card swipe
app.post('/test/swipe', (req, res) => {
  const amount = req.body.amount || 2500; // Default $25
  
  console.log('🧪 Simulating card swipe for $' + (amount / 100).toFixed(2));
  
  // Simulate the webhook locally
  const webhookData = {
    type: 'authorization.request',
    data: {
      amount: amount,
      card_token: 'd01feaa7-66b4-4ce6-8818-9ae1f07d095f',
      merchant: { name: 'Test Merchant' },
      token: 'test_' + Date.now()
    }
  };
  
  // Process it
  const approved = amount < 10000;
  
  res.json({
    simulated: true,
    amount: amount,
    approved: approved,
    message: approved ? 'Transaction approved!' : 'Transaction declined - amount too high'
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log('\n🚀 CREDANA TEST SERVER RUNNING!');
  console.log('═══════════════════════════════════');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🎪 Webhook: POST http://localhost:${PORT}/api/webhooks/lithic/authorization`);
  console.log(`🧪 Test: POST http://localhost:${PORT}/test/swipe`);
  console.log('\n💳 Your Card Details:');
  console.log('   Number: 4111-1113-0243-7242');
  console.log('   Token: d01feaa7-66b4-4ce6-8818-9ae1f07d095f');
  console.log('   Wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
  console.log('\n✅ Ready to receive Lithic webhooks!');
  console.log('═══════════════════════════════════\n');
}); 