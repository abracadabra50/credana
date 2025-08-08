# 💡 CREDANA'S ACTUAL LITHIC ARCHITECTURE

## The Key Insight
You're absolutely right - we DON'T want to hold user balances at Lithic. Users hold SOL on-chain, not USD at Lithic!

---

## 🎯 **THE CORRECT ARCHITECTURE**

```mermaid
graph TB
    subgraph "Lithic Program Accounts (CREDANA's)"
        PA[Program OPERATING Account - $10k+]
        RA[Program RESERVE Account]
        IA[Program ISSUING Account]
    end
    
    subgraph "User Setup"
        U1[User 1 - Lithic Account (NO BALANCE)]
        U2[User 2 - Lithic Account (NO BALANCE)]
        VC1[Virtual Card 1 - Linked to Program]
        VC2[Virtual Card 2 - Linked to Program]
    end
    
    subgraph "On-Chain (Where Real Value Lives)"
        SOL1[User 1: 10 SOL Collateral]
        SOL2[User 2: 5 SOL Collateral]
        DEBT1[User 1: $50 Debt]
        DEBT2[User 2: $0 Debt]
    end
    
    subgraph "Settlement Flow"
        BANK[Credana Bank Account]
        OFFR[Off-Ramp Service]
    end
    
    U1 -->|Spends| VC1
    U2 -->|Spends| VC2
    VC1 -->|Draws from| PA
    VC2 -->|Draws from| PA
    SOL1 -->|Backs| VC1
    SOL2 -->|Backs| VC2
    VC1 -->|Records| DEBT1
    SOL1 -->|Converts via| OFFR
    OFFR -->|Replenishes| BANK
    BANK -->|ACH| PA
```

---

## ✅ **WHAT WE ACTUALLY NEED:**

### 1. **One Program Account (Credana's Treasury)**
```typescript
// This is CREDANA's money, not users'
const programAccount = {
  type: 'OPERATING',
  balance: 10000, // $10k float for settlements
  owner: 'Credana Inc',
  purpose: 'Cover all user transactions'
};
```

### 2. **User Accounts (Just for Cards, NO Balance)**
```typescript
// Users have accounts but NO money at Lithic
const userAccount = {
  account_token: 'acct_xxx',
  financial_account: null, // ← KEY: No financial account!
  metadata: {
    solana_wallet: '6xsZeT...', // Their SOL collateral
    on_chain_debt: 0 // Tracked on Solana
  }
};
```

### 3. **Cards Linked to Program Funding**
```typescript
// Cards spend from CREDANA's account, not user's
const userCard = {
  card_token: 'card_xxx',
  account_token: 'acct_xxx', // For identity
  funding_source: 'PROGRAM', // ← Spends Credana's money!
  spend_limit: calculateFromOnChainCollateral()
};
```

---

## 🔄 **THE ACTUAL FLOW:**

### When User Makes Purchase:

```typescript
async function handlePurchase(authRequest) {
  // 1. Card tries to spend $50 at coffee shop
  const amount = authRequest.amount;
  const userAccount = authRequest.account_token;
  
  // 2. Check on-chain collateral (NOT Lithic balance)
  const solanaWallet = getUserWallet(userAccount);
  const position = await getOnChainPosition(solanaWallet);
  
  // 3. Calculate available credit
  const collateralValue = position.sol * SOL_PRICE; // 10 SOL = $1500
  const currentDebt = position.debt; // $0
  const availableCredit = (collateralValue * 0.6) - currentDebt; // $900
  
  // 4. Approve/Decline
  if (amount <= availableCredit) {
    // CREDANA pays from its program account
    // User owes CREDANA (recorded on-chain)
    await recordDebtOnChain(solanaWallet, amount);
    return { approved: true };
  } else {
    return { approved: false, reason: 'EXCEEDS_COLLATERAL' };
  }
}
```

---

## 💰 **SETTLEMENT & TREASURY MANAGEMENT:**

### Daily Settlement Process:
```typescript
async function dailySettlement() {
  // 1. Check program account balance
  const balance = await getLithicProgramBalance(); // $8,500 left
  
  // 2. If low, convert SOL from treasury
  if (balance < MIN_OPERATING_BALANCE) {
    const needed = TARGET_BALANCE - balance; // Need $1,500
    
    // 3. Sell treasury SOL via off-ramp
    await convertSOLtoUSD(needed / SOL_PRICE); // Sell 10 SOL
    
    // 4. ACH funds to Lithic (T+2)
    await fundLithicProgram(needed);
  }
  
  // 5. Users still owe on-chain debt
  // They repay in SOL/USDC to reduce debt
}
```

---

## 🎯 **WHY THIS IS BETTER:**

### Traditional Lithic Approach (NOT for us):
```
User deposits $1000 → Lithic account → Spends their money
❌ Users need USD upfront
❌ No leverage on SOL
❌ Just a prepaid card
```

### Credana's Approach (Revolutionary):
```
User deposits SOL on-chain → No Lithic balance → Credana fronts the money
✅ Users keep earning on SOL
✅ Credana provides credit line
✅ True on-chain collateralized credit
```

---

## 📊 **ACCOUNT STRUCTURE COMPARISON:**

| Component | Traditional | Credana |
|-----------|------------|---------|
| **Program Account** | Holds user deposits | Credana's operating capital |
| **User Accounts** | Individual balances | No balance (identity only) |
| **Cards** | Spend user's money | Spend Credana's money |
| **Collateral** | None | On-chain SOL |
| **Credit Decision** | Balance check | On-chain collateral check |
| **Settlement** | Deduct from user | Record debt on-chain |

---

## 🚀 **IMPLEMENTATION:**

### Step 1: Create User Account (No Financial Account)
```typescript
// Create account WITHOUT financial account
const account = await lithic.createAccount({
  type: 'INDIVIDUAL',
  individual: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com'
  },
  // NO financial_account creation!
  metadata: {
    solana_wallet: userWallet,
    skip_financial_account: true
  }
});
```

### Step 2: Create Card Linked to Program
```typescript
// Card that spends from program, not user
const card = await lithic.createCard({
  account_token: account.token,
  type: 'VIRTUAL',
  funding: {
    source: 'PROGRAM_ACCOUNT', // ← Key difference
    account_token: PROGRAM_OPERATING_ACCOUNT
  },
  spend_limit: 0, // Dynamic based on collateral
  authorization_method: 'WEBHOOK' // We control every transaction
});
```

### Step 3: Authorization with On-Chain Check
```typescript
// Every transaction checks Solana, not Lithic balance
async function authorize(request) {
  const onChainCredit = await checkSolanaCollateral(request.account);
  
  if (request.amount <= onChainCredit) {
    // Credana pays, user owes
    await recordOnChainDebt(request.account, request.amount);
    return { approved: true, funded_by: 'CREDANA' };
  }
  
  return { approved: false };
}
```

---

## ✅ **THE BOTTOM LINE:**

**Users DON'T have money at Lithic. They have SOL on-chain.**

**Credana has money at Lithic to settle transactions.**

**Every purchase = Credana pays, user owes (on-chain debt).**

This is what makes it revolutionary - true on-chain collateralized credit, not just a prepaid card! 