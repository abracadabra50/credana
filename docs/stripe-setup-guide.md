# Stripe Setup Guide for Credana

## Overview

For Credana's on-chain credit card system, you'll need **two** Stripe products:

1. **[Stripe Issuing](https://stripe.com/issuing)** - For creating and managing virtual/physical credit cards
2. **[Stripe Treasury](https://stripe.com/treasury)** - For managing the fiat balances that back card transactions

## Why You Need Both

- **Stripe Issuing**: Creates the actual Visa cards that users spend with
- **Stripe Treasury**: Manages the USD bank accounts and balances that settle card transactions

Your architecture perfectly aligns with this: USDC treasury → automatic off-ramp → Stripe Treasury account → card settlements.

## Step-by-Step Setup Process

### 1. Initial Stripe Account Setup

1. **Create a Stripe Account** (if you don't have one)
   - Go to [dashboard.stripe.com](https://dashboard.stripe.com)
   - Complete business verification (required for financial products)
   - You'll need: Business documents, tax ID, bank account details

2. **Enable Developer Mode**
   - Switch to "Test mode" in the dashboard
   - Get your test API keys from API Keys section

### 2. Enable Stripe Issuing

1. **Request Access to Issuing**
   ```bash
   # In your Stripe Dashboard:
   # Go to Products → Issuing → Request access
   ```

2. **Required Information**:
   - Business type and use case ("crypto-backed credit cards")
   - Expected volume (start conservative, can increase later)
   - Geographic markets (where your users will be)
   - KYC/compliance processes you'll implement

3. **Integration Steps**:
   ```javascript
   // Create a cardholder
   const cardholder = await stripe.issuing.cardholders.create({
     name: 'John Doe',
     email: 'john@example.com',
     type: 'individual',
     billing: {
       address: {
         line1: '123 Main St',
         city: 'San Francisco',
         state: 'CA',
         postal_code: '94105',
         country: 'US'
       }
     }
   });

   // Create a virtual card
   const card = await stripe.issuing.cards.create({
     cardholder: cardholder.id,
     currency: 'usd',
     type: 'virtual'
   });
   ```

### 3. Enable Stripe Treasury

1. **Request Access to Treasury**
   ```bash
   # In your Stripe Dashboard:
   # Go to Products → Treasury → Request access
   ```

2. **Bank Partner Selection**:
   - Stripe partners with **Fifth Third Bank** and **Evolve Bank & Trust**
   - FDIC-insured up to $250,000 per account
   - Choose based on your business needs

3. **Create Financial Accounts**:
   ```javascript
   // Create a Treasury financial account
   const account = await stripe.accounts.create({
     country: 'US',
     capabilities: {
       treasury: { requested: true },
       issuing: { requested: true }
     }
   });

   const treasuryAccount = await stripe.treasury.accounts.create({
     account: account.id,
     currency: 'usd'
   });
   ```

### 4. Configure Webhooks for Real-Time Authorization

This is **critical** for your <500ms authorization target:

```javascript
// Webhook endpoint configuration
const webhookEndpoints = [
  'issuing_authorization.request',    // Real-time auth decisions
  'issuing_authorization.updated',    // Auth status changes  
  'issuing_transaction.created',      // Transaction settlements
  'treasury.received_credit',         // Incoming funds
  'treasury.outbound_payment'         // Outgoing funds
];

// In your backend webhook handler:
app.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  
  if (event.type === 'issuing_authorization.request') {
    // THIS IS WHERE YOUR <500MS AUTHORIZATION LOGIC GOES
    const authorization = event.data.object;
    const approved = await checkAuthorizationCached(
      authorization.cardholder.id,
      authorization.amount
    );
    
    // Respond within 2 seconds
    res.json({ approved });
  }
});
```

### 5. Treasury Fund Management

Set up automated USDC → USD conversion:

```javascript
// Fund your Treasury account from USDC reserves
const transfer = await stripe.treasury.outbound_transfers.create({
  amount: 100000, // $1000.00
  currency: 'usd',
  destination_payment_method: 'bank_account',
  description: 'USDC off-ramp to fund card operations'
});

// Monitor Treasury balance
const balance = await stripe.treasury.accounts.retrieve(treasuryAccount.id);
console.log('Available balance:', balance.balance.cash);
```

## Environment Variables Setup

Add these to your `.env`:

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Product IDs (you'll get these after setup)
STRIPE_ISSUING_ACCOUNT_ID=acct_...
STRIPE_TREASURY_ACCOUNT_ID=fa_...

# For production
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

## Testing Your Setup

### 1. Test Card Creation
```javascript
// Test creating a virtual card
const testCard = await stripe.issuing.cards.create({
  cardholder: 'ich_test_cardholder',
  currency: 'usd',
  type: 'virtual'
});

console.log('Test card created:', testCard.id);
```

### 2. Test Authorization Flow
```javascript
// Simulate an authorization request
const testAuth = await stripe.testHelpers.issuing.authorizations.create({
  card: testCard.id,
  amount: 1000, // $10.00
  currency: 'usd',
  merchant_data: {
    category: 'gas_stations',
    name: 'Test Merchant'
  }
});
```

### 3. Test Treasury Operations
```javascript
// Test receiving funds
const receivedCredit = await stripe.testHelpers.treasury.received_credits.create({
  financial_account: treasuryAccount.id,
  amount: 10000,
  currency: 'usd',
  description: 'Test USDC conversion'
});
```

## Production Checklist

### Before Going Live:

- [ ] **Complete business verification** with Stripe
- [ ] **Set up monitoring** for failed transactions
- [ ] **Configure rate limiting** on webhook endpoints  
- [ ] **Test authorization latency** (must be <500ms)
- [ ] **Verify KYC compliance** integration
- [ ] **Set up proper logging** and alerting
- [ ] **Configure backup webhook endpoints**
- [ ] **Test liquidation scenarios** with Treasury balance

### Compliance Requirements:

- [ ] **KYC provider integration** (Sumsub/Veriff)
- [ ] **AML monitoring** setup
- [ ] **PCI compliance** (use Stripe's tokenization)
- [ ] **Data residency** compliance (GDPR, etc.)

## Cost Estimation

### Stripe Issuing Fees:
- **Card creation**: $2.00 per virtual card, $4.00 per physical card
- **Authorization**: $0.01 per authorization
- **International**: 1% on international transactions

### Stripe Treasury Fees:
- **Account maintenance**: Free
- **ACH transfers**: $0.30 per transfer
- **Wire transfers**: $15.00 per transfer
- **Card funding**: 0.5% per transaction

## Integration with Your Backend

Update your existing webhook handler:

```typescript
// backend/src/services/stripe/webhook-handler.ts
import { checkAuthorizationCached } from '../auth/authorization-service';

export class StripeWebhookHandler {
  async handleAuthorizationRequest(event: Stripe.Event, res: Response) {
    const authorization = event.data.object as Stripe.Issuing.Authorization;
    
    // Use your existing cache-based authorization
    const decision = await checkAuthorizationCached(
      authorization.cardholder.id,
      authorization.amount
    );
    
    // Update Treasury balance tracking
    if (decision.approved) {
      await this.updateTreasuryReserves(authorization.amount);
    }
    
    res.json({ approved: decision.approved });
  }
}
```

## Next Steps

1. **Apply for Issuing + Treasury access** (can take 1-2 weeks)
2. **Complete test integration** with your existing backend
3. **Set up automated USDC off-ramping** to Treasury accounts
4. **Test end-to-end flow**: Deposit jitoSOL → Get card → Make purchase → Settlement
5. **Deploy webhook endpoints** to production infrastructure

## Support Resources

- **[Stripe Issuing Docs](https://stripe.com/docs/issuing)**
- **[Stripe Treasury Docs](https://stripe.com/docs/treasury)**  
- **[Authorization Optimization Guide](https://stripe.com/guides/optimizing-authorization-rates)**
- **Stripe Support**: Available 24/7 for financial products

---

**Note**: Your architecture is perfectly aligned with Stripe's capabilities. The combination of Issuing + Treasury gives you everything needed for a production-grade crypto credit card system. 