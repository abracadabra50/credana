# 🍎 REAL APPLE PAY + REAL SOL TESTING GUIDE

## 🎯 **THE PATH TO REAL-WORLD TESTING**

### Current State → Production Ready
```
✅ Smart Contract: Deployed on Devnet
✅ Backend: Production-grade with HMAC/Idempotency
✅ Credit Logic: LTV-based decisions working
❌ Lithic Card: Need sandbox → production account
❌ Apple Pay: Need provisioning
❌ Mainnet: Need migration from Devnet
```

## 📱 **STEP 1: LITHIC PRODUCTION SETUP**

### A. Upgrade to Lithic Production Account
1. **Go to**: https://dashboard.lithic.com
2. **Apply for production access** (takes 2-3 days)
3. **Requirements**:
   - Business entity (LLC/Corp)
   - EIN/Tax ID
   - Bank account for settlement
   - Compliance docs (Terms of Service, Privacy Policy)

### B. Get Production API Keys
```bash
LITHIC_API_KEY_PROD=prod_xxxxxx
LITHIC_WEBHOOK_SECRET_PROD=whsec_xxxxxx
```

### C. Create Real Virtual Card
```bash
curl -X POST https://api.lithic.com/v1/cards \
  -H "Authorization: api-key $LITHIC_API_KEY_PROD" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "VIRTUAL",
    "memo": "Credana Card",
    "spend_limit": 100000,
    "spend_limit_duration": "MONTHLY",
    "state": "OPEN"
  }'
```

## 🏪 **STEP 2: APPLE PAY PROVISIONING**

### A. Add Card to Apple Wallet
```javascript
// Using Lithic's tokenization SDK
import { Lithic } from '@lithic/lithic-node';

const lithic = new Lithic({ apiKey: process.env.LITHIC_API_KEY_PROD });

// Get provisioning data
const provisioningData = await lithic.cards.provisionApplePay(cardToken, {
  certificate: appleCertificate,
  nonce: appleNonce,
  nonceSignature: appleNonceSignature
});

// This returns a payload for Apple Wallet
```

### B. In-App Provisioning Flow
```swift
// iOS Swift code for your app
import PassKit

func addCardToAppleWallet() {
    let config = PKAddPaymentPassRequestConfiguration(
        encryptionScheme: .ECC_V2
    )
    
    config?.cardholderName = "User Name"
    config?.primaryAccountSuffix = "7242" // Last 4 of card
    config?.localizedDescription = "Credana Card"
    config?.paymentNetwork = .visa
    
    // Get provisioning data from your backend
    fetchProvisioningData { provisioningData in
        config?.encryptedPassData = provisioningData.encryptedData
        config?.activationData = provisioningData.activationData
        config?.ephemeralPublicKey = provisioningData.ephemeralPublicKey
        
        let addPassVC = PKAddPaymentPassViewController(
            requestConfiguration: config!,
            delegate: self
        )
        present(addPassVC, animated: true)
    }
}
```

## ⚡ **STEP 3: MAINNET MIGRATION**

### A. Deploy to Solana Mainnet
```bash
# 1. Update Anchor.toml
[programs.mainnet]
credit_core = "YOUR_MAINNET_PROGRAM_ID"

[provider]
cluster = "mainnet"
wallet = "~/.config/solana/mainnet-deployer.json"

# 2. Build for mainnet
anchor build

# 3. Deploy (costs ~3-5 SOL)
anchor deploy --provider.cluster mainnet

# 4. Initialize protocol on mainnet
npx tsx scripts/initialize-protocol.ts --network mainnet
```

### B. Update Backend for Mainnet
```typescript
// .env.production
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# Or better: Use Helius/Triton/QuickNode
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

PROGRAM_ID=YOUR_MAINNET_PROGRAM_ID
LITHIC_API_KEY=prod_xxxxx
LITHIC_WEBHOOK_SECRET=whsec_xxxxx
```

## 💰 **STEP 4: FUND WITH REAL SOL**

### A. Create Mainnet Position
```bash
# 1. Transfer real SOL to your wallet
solana transfer 10 YOUR_WALLET --url mainnet-beta

# 2. Initialize position on mainnet
npx tsx scripts/init-position.ts --network mainnet

# 3. Deposit collateral (real SOL)
npx tsx scripts/deposit-collateral.ts --amount 10 --network mainnet
```

### B. Calculate Real Credit Line
```
10 SOL × $150 = $1,500 collateral value
$1,500 × 60% LTV = $900 credit line
```

## 🛍️ **STEP 5: TEST IN REAL STORE**

### Testing Checklist:
```
1. ✅ Apple Pay shows "Credana Card"
2. ✅ Try small purchase ($5 coffee)
3. ✅ Check webhook received
4. ✅ Verify on-chain debt recorded
5. ✅ Try larger purchase ($100)
6. ✅ Test decline above credit limit
```

### Monitor in Real-Time:
```bash
# Terminal 1: Watch webhooks
tail -f logs/webhooks.log | grep authorization

# Terminal 2: Monitor on-chain
watch -n 2 'solana account YOUR_POSITION_PDA --url mainnet-beta'

# Terminal 3: Backend metrics
curl http://localhost:3001/metrics -H "x-api-key: $METRICS_KEY"
```

## 🔐 **SECURITY BEFORE GOING LIVE**

### Critical Checklist:
- [ ] Multi-sig on program upgrade authority
- [ ] Webhooks using production secret
- [ ] Rate limiting enabled
- [ ] HMAC verification active
- [ ] SSL/TLS on all endpoints
- [ ] Secrets in AWS KMS/Vault
- [ ] Monitoring alerts configured
- [ ] Incident response plan ready

## 💳 **STEP 6: SETTLEMENT & TREASURY**

### A. USDC Pool for Settlement
```javascript
// You need USDC to pay Lithic for card transactions
const SETTLEMENT_POOL_SIZE = 10000; // $10k USDC

// Daily settlement flow:
// 1. Lithic debits your account for yesterday's transactions
// 2. You need USDC ready in your bank or stablecoin account
// 3. Users repay their debt in USDC on-chain
```

### B. Off-Ramp Setup (Circle/Banxa)
```javascript
// Circle API for USDC → USD
const circle = new Circle({ apiKey: CIRCLE_API_KEY });

// Create payout
const payout = await circle.payouts.create({
  amount: { amount: "1000.00", currency: "USD" },
  destination: {
    type: "bank_account",
    id: BANK_ACCOUNT_ID
  },
  source: {
    type: "wallet",
    id: USDC_WALLET_ID
  }
});
```

## 📊 **COST BREAKDOWN**

### One-Time Costs:
- Mainnet deployment: ~5 SOL ($750)
- Lithic setup fee: $0-500
- Apple Developer: $99/year
- Business entity: $200-800

### Ongoing Costs:
- Lithic: $0.50/card/month + interchange
- RPC: $50-200/month (Helius/Triton)
- Settlement float: $10,000 USDC
- Gas fees: ~$50/month

## 🚀 **QUICK START COMMANDS**

```bash
# 1. Clone production config
cp .env.example .env.production

# 2. Update with real values
vim .env.production

# 3. Deploy to mainnet
anchor deploy --provider.cluster mainnet

# 4. Start production server
NODE_ENV=production npx tsx src/production-server.ts

# 5. Test Apple Pay webhook
curl -X POST https://your-domain.com/api/webhooks/lithic/authorization \
  -H "webhook-signature: ..." \
  -H "webhook-timestamp: ..." \
  -d '{"type":"authorization.request","data":{...}}'
```

## ⚠️ **IMPORTANT WARNINGS**

1. **Start Small**: Test with $100 max until stable
2. **Monitor 24/7**: Set up PagerDuty/Opsgenie
3. **Have Backup RPC**: Multiple providers ready
4. **Liquidity Buffer**: Keep 2x daily volume in USDC
5. **Legal Compliance**: MSB license may be required

## 📱 **SUPPORT CONTACTS**

- **Lithic Support**: support@lithic.com
- **Apple Pay Issues**: developer.apple.com/contact
- **Solana RPC**: Your provider's Discord
- **Circle/USDC**: support.circle.com

---

## 🎯 **NEXT IMMEDIATE STEPS**

1. **Today**: Apply for Lithic production account
2. **This Week**: Deploy to mainnet with 1 SOL test
3. **Next Week**: Test with real Apple Pay + $10
4. **Two Weeks**: Full production with $1000 limit

**Ready to go live? Start with Step 1: Lithic Production Setup** 🚀 