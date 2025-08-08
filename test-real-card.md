# 🚀 Testing Credana with Real Card & Real JitoSOL

## Current Status ✅
- **Program Deployed**: `5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN`
- **Config Initialized**: `DxfTMDhNkmNh4pryChfvQffKAGYXcSFcQ9G15puSQzGw`
- **Your Card**: `4111-1113-0243-7242` (Virtual VISA)
- **Your Wallet**: `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`

## 🎯 Complete Testing Flow

### Step 1: Get Real JitoSOL (Devnet)

Since we're on devnet, you don't need real money. Here's how to get test jitoSOL:

```bash
# 1. First, get some devnet SOL
solana airdrop 2 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --url devnet

# 2. Check your balance
solana balance 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU --url devnet
```

For jitoSOL on devnet, you can:
- Use the Jito test faucet (if available)
- Or swap SOL for jitoSOL on a devnet DEX
- Or we can modify the program to accept regular SOL for testing

### Step 2: Initialize Your Position

Since you need to sign the transaction with your wallet, you have two options:

#### Option A: Use Phantom/Solflare Wallet
1. Import your wallet (`7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`) into Phantom
2. Connect to our frontend (when ready)
3. Click "Initialize Position"

#### Option B: Use CLI with Your Private Key
If you have the private key for `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`:

```bash
# Set your private key
export USER_PRIVATE_KEY=[your_private_key_array]

# Run initialization
cd /Users/zishan/credana/credana/backend
npx tsx scripts/init-user-position-self.ts
```

### Step 3: Start the Backend Server

```bash
# From the backend directory
cd /Users/zishan/credana/credana/backend

# Start the server
npm run dev
```

The server will run on `http://localhost:3001` with these endpoints:
- Health: `GET http://localhost:3001/health`
- Webhook: `POST http://localhost:3001/api/webhooks/lithic/authorization`

### Step 4: Test Your Real Card

#### A. Small Test Transaction ($25)
Your card `4111-1113-0243-7242` is already active. Try a small purchase:

1. **Online Purchase**: Use your card number on any test merchant
2. **Apple Pay**: Add to Apple Wallet using the virtual card details

When you swipe:
1. Lithic sends authorization request to our webhook
2. Backend checks if amount < $100 (auto-approves)
3. Transaction approved ✅
4. Debt recorded on-chain

#### B. Monitor the Transaction

```bash
# Watch for your transaction
solana logs 5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN --url devnet

# Check your position
solana account BMtArYvaL9XicqHBwj5f8UpLEVRFb84Mr7eSKF7TEi6m --url devnet
```

### Step 5: View Transaction Details

Check Lithic Dashboard:
```bash
# Get recent transactions
curl -X GET https://sandbox.lithic.com/v1/transactions \
  -H "Authorization: api-key 52c3f4c0-3c59-40ef-a03b-e628cbb398db"

# Get specific card transactions
curl -X GET https://sandbox.lithic.com/v1/cards/d01feaa7-66b4-4ce6-8818-9ae1f07d095f/transactions \
  -H "Authorization: api-key 52c3f4c0-3c59-40ef-a03b-e628cbb398db"
```

## 🔧 Quick Backend Server (If main server won't start)

Create a simple test server:

```javascript
// test-server.js
const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/webhooks/lithic/authorization', (req, res) => {
  console.log('💳 Card swiped!', {
    amount: req.body?.data?.amount,
    merchant: req.body?.data?.merchant,
    card: req.body?.data?.card_token
  });
  
  const amount = req.body?.data?.amount || 0;
  const approved = amount < 10000; // Under $100
  
  res.json({ 
    approved, 
    decline_reason: approved ? undefined : 'AMOUNT_TOO_HIGH' 
  });
});

app.listen(3001, () => {
  console.log('🚀 Server running on http://localhost:3001');
});
```

Run it:
```bash
cd /Users/zishan/credana/credana/backend
node test-server.js
```

## 📊 What Happens When You Swipe

1. **Card Authorization** (< 100ms)
   - Lithic receives your card swipe
   - Sends webhook to our backend
   - We check amount and approve/decline

2. **On-Chain Recording** (async)
   - After approval, debt is recorded on Solana
   - Your position PDA is updated
   - Interest starts accruing

3. **You Can See**:
   - Transaction in Lithic dashboard
   - Debt recorded on-chain
   - Position updated in our system

## 🎯 Test Scenarios

### Scenario 1: Coffee Purchase ($5)
- Amount: 500 cents
- Expected: APPROVED ✅
- Debt recorded: $5 USDC

### Scenario 2: Dinner ($75)
- Amount: 7500 cents
- Expected: APPROVED ✅
- Debt recorded: $75 USDC

### Scenario 3: Large Purchase ($150)
- Amount: 15000 cents
- Expected: DECLINED ❌
- Reason: AMOUNT_TOO_HIGH

## 🚨 Troubleshooting

### Backend Won't Start?
```bash
# Kill any stuck processes
pkill -f tsx
pkill -f node

# Try the simple server above
```

### Can't Initialize Position?
- You need YOUR wallet's private key (not the admin key)
- Or use a wallet UI (Phantom/Solflare)

### Card Not Working?
- Check Lithic dashboard: https://sandbox.lithic.com
- Verify webhook URL is accessible
- Check server logs for authorization requests

## 📱 Next Steps

1. **Add Collateral**: Deposit jitoSOL to increase credit limit
2. **Monitor Health Factor**: Keep LTV below 85%
3. **Repay Debt**: Send USDC to burn debt
4. **Earn Rewards**: Get points for transactions

---

## Quick Commands Reference

```bash
# Check your card
curl -X GET https://sandbox.lithic.com/v1/cards/d01feaa7-66b4-4ce6-8818-9ae1f07d095f \
  -H "Authorization: api-key 52c3f4c0-3c59-40ef-a03b-e628cbb398db"

# Simulate a transaction
curl -X POST http://localhost:3001/api/webhooks/lithic/authorization \
  -H "Content-Type: application/json" \
  -d '{
    "type": "authorization.request",
    "data": {
      "amount": 2500,
      "card_token": "d01feaa7-66b4-4ce6-8818-9ae1f07d095f",
      "merchant": "Test Coffee Shop"
    }
  }'

# Check on-chain position
solana account BMtArYvaL9XicqHBwj5f8UpLEVRFb84Mr7eSKF7TEi6m --url devnet
``` 