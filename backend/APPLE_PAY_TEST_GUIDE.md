# 🍎 WHERE TO TEST APPLE PAY TOKENS

## 📍 **TESTING ENVIRONMENTS**

### 1️⃣ **Lithic Sandbox (Available Now)**
```
URL: https://sandbox.lithic.com
API: https://sandbox.lithic.com/v1
```

**What You Can Test:**
- ✅ Virtual card creation
- ✅ Webhook flows
- ✅ Authorization/decline logic
- ✅ Transaction simulations
- ❌ Real Apple Pay (simulated only)

**Test Cards:**
```
4242 4242 4242 4242 - Always approves
4000 0000 0000 0001 - Always declines  
4000 0000 0000 9995 - Insufficient funds
```

---

### 2️⃣ **Xcode iPhone Simulator**
**Setup:**
1. Download Xcode from Mac App Store
2. Open Xcode → Open Developer Tool → Simulator
3. In Simulator: Open Wallet app
4. Add test cards manually

**What You Can Test:**
- ✅ Apple Pay UI/UX
- ✅ Card provisioning flow
- ✅ Touch ID/Face ID simulation
- ❌ Real NFC payments

**How to Add Test Cards:**
```swift
// In your iOS app
import PassKit

let request = PKAddPaymentPassRequest()
request.cardholderName = "Test User"
request.primaryAccountSuffix = "4242"
request.paymentNetwork = .visa
```

---

### 3️⃣ **TestFlight (Beta Testing)**
**Setup:**
1. Build your iOS app with sandbox config
2. Upload to App Store Connect
3. Distribute via TestFlight
4. Test on real devices

**What You Can Test:**
- ✅ Real device Apple Pay
- ✅ Biometric authentication
- ✅ Sandbox transactions
- ❌ Real store payments (sandbox only)

---

### 4️⃣ **Stripe Test Mode (Alternative)**
If you want to test Apple Pay TODAY without Lithic setup:

```javascript
// Using Stripe's test environment
const stripe = Stripe('pk_test_...');

const paymentRequest = stripe.paymentRequest({
  country: 'US',
  currency: 'usd',
  total: {
    label: 'Test Purchase',
    amount: 1099, // $10.99
  },
  requestPayerName: true,
  requestPayerEmail: true,
});

// This works in Safari on Mac/iPhone
const elements = stripe.elements();
const prButton = elements.create('paymentRequestButton', {
  paymentRequest,
});
```

**Test Cards for Stripe:**
```
4242 4242 4242 4242 - Success
4000 0000 0000 0002 - Decline
```

---

## 🧪 **QUICK TEST SETUP**

### Option A: Browser Testing (5 minutes)
1. **Use Stripe's Test Page**: https://stripe.com/docs/testing#apple-pay
2. **Requirements**: 
   - Safari on Mac with Touch ID
   - Or iPhone with test mode enabled

### Option B: Local Testing (30 minutes)
```bash
# 1. Clone Apple Pay demo
git clone https://github.com/stripe/stripe-ios
cd stripe-ios/Example

# 2. Open in Xcode
open "Stripe iOS Example.xcworkspace"

# 3. Run on Simulator
# Select iPhone 14 Pro → Run
```

### Option C: Lithic Sandbox (What we built)
```bash
# 1. Start your server
cd /Users/zishan/credana/credana/backend
npx tsx src/production-server.ts

# 2. Run Apple Pay tests
npx tsx scripts/test-apple-pay-sandbox.ts
```

---

## 🎯 **TESTING CHECKLIST**

### Sandbox Testing (Do Now):
- [ ] Create virtual card via Lithic API
- [ ] Simulate Apple Pay provisioning
- [ ] Test authorization webhooks
- [ ] Test decline scenarios
- [ ] Test idempotency

### Simulator Testing (Do Today):
- [ ] Install Xcode
- [ ] Add test card to Wallet
- [ ] Test provisioning flow
- [ ] Test payment sheet UI

### Real Device Testing (This Week):
- [ ] Deploy to TestFlight
- [ ] Test on real iPhone
- [ ] Test Face ID/Touch ID
- [ ] Test in-app provisioning

### Production Testing (After Lithic Approval):
- [ ] Real card provisioning
- [ ] Real Apple Pay activation  
- [ ] Test at real merchant
- [ ] Monitor webhooks

---

## 💻 **TEST NOW IN BROWSER**

### Quick Apple Pay Test (Works on Mac Safari):
1. **Go to**: https://applepaydemo.apple.com
2. **Click**: "Pay with Apple Pay"
3. **Use Touch ID** to authorize
4. **See the token** in console

### See Token Structure:
```javascript
// Open Safari Console (Cmd+Option+C)
// The Apple Pay token looks like:
{
  "version": "EC_v1",
  "data": "...", // Encrypted card data
  "signature": "...",
  "header": {
    "ephemeralPublicKey": "...",
    "publicKeyHash": "...",
    "transactionId": "..."
  }
}
```

---

## 🚀 **IMMEDIATE ACTION**

### Test Apple Pay Right Now (No Setup):
1. **Open Safari** on your Mac
2. **Go to**: https://rsolomakhin.github.io/pr/apps/
3. **Click**: "Buy with Apple Pay"
4. **Authorize** with Touch ID
5. **See**: The payment token in results

### This Shows You:
- How Apple Pay looks/feels
- The authorization flow
- What data is passed
- How quick it is

---

## 📱 **MOBILE TESTING**

### On Your iPhone (Real Device):
1. **Settings** → **Wallet & Apple Pay**
2. **Add Card** → **Continue**
3. **Enter** test card: 4242 4242 4242 4242
4. **Won't work** for real stores
5. **But** can test in sandbox apps

### TestFlight Setup:
```bash
# 1. Build your app
xcodebuild -scheme Credana -configuration Debug

# 2. Archive for TestFlight
xcodebuild archive -scheme Credana 

# 3. Upload to App Store Connect
xcrun altool --upload-app -f Credana.ipa
```

---

## ✅ **WHAT WORKS TODAY**

With your current setup, you can:
1. **Test webhooks** with simulated Apple Pay tokens
2. **Test authorization logic** with your backend
3. **Test on-chain integration** with devnet
4. **Simulate full flow** without real Apple Pay

What you need for real Apple Pay:
1. **Lithic production account** (2-3 days)
2. **Apple Developer account** ($99)
3. **Deploy to mainnet** (~5 SOL)
4. **Real iPhone** for testing

**Start with sandbox testing today, apply for production access, then test with real Apple Pay next week!** 