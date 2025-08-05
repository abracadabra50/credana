# Credana Anchor Program Guide

## Overview

The Credana credit-core program is a Solana smart contract that manages collateralised credit positions. Users deposit jitoSOL as collateral to obtain a credit line, which they can spend via virtual credit cards. The program handles debt tracking, interest accrual, and liquidations.

## Key Concepts

### 1. Collateral and Credit Lines

- **Collateral**: Users deposit jitoSOL tokens as backing for their credit
- **LTV (Loan-to-Value)**: Maximum borrowing capacity as a percentage of collateral value
- **Credit Limit**: Calculated as `collateral_value × LTV_percentage`

### 2. Health Factor

The health factor determines if a position can be liquidated:
- **Health Factor = (Collateral Value × Liquidation Threshold) ÷ Current Debt**
- Health Factor > 1.0 = Position is safe
- Health Factor < 1.0 = Position can be liquidated
- New borrows require Health Factor ≥ 1.10 (safety buffer)

### 3. Interest Accrual

Interest is calculated using a borrow index system:
- Global borrow index increases over time based on APR
- User debt grows proportionally to index changes
- Compound interest is applied automatically

## Program Instructions

### Initialize Protocol
```rust
initialize(params: InitializeParams)
```
**Purpose**: One-time setup of the protocol configuration
**Who can call**: Deployer only (first time)
**Parameters to customize**:
- `ltv_max_bps`: Maximum LTV in basis points (5000 = 50%)
- `liquidation_threshold_bps`: When positions become liquidatable (6000 = 60%)
- `liquidation_bonus_bps`: Incentive for liquidators (600 = 6%)
- `interest_rate_bps`: Annual interest rate (1200 = 12%)

### Create User Position
```rust
init_position()
```
**Purpose**: Creates a credit account for a user
**Who can call**: Any user (once per wallet)
**What happens**: Initializes empty position ready for deposits

### Deposit Collateral
```rust
deposit_collateral(amount: u64)
```
**Purpose**: Add jitoSOL collateral to increase credit limit
**Who can call**: Position owner
**Parameters**:
- `amount`: jitoSOL tokens to deposit (9 decimal places)

### Withdraw Collateral
```rust
withdraw_collateral(amount: u64)
```
**Purpose**: Remove excess collateral
**Who can call**: Position owner
**Requirements**: Must maintain healthy position after withdrawal

### Record Debt (Backend Only)
```rust
record_debt(usdc_amount: u64)
```
**Purpose**: Record credit card spending on-chain
**Who can call**: Backend authority only
**Parameters**:
- `usdc_amount`: Amount spent in USDC (6 decimal places)

### Repay Debt
```rust
repay_usdc(amount: u64)
```
**Purpose**: Pay down credit card debt
**Who can call**: Position owner
**Parameters**:
- `amount`: USDC to repay (6 decimal places)

### Liquidate Position
```rust
liquidate(repay_amount: u64)
```
**Purpose**: Liquidate unhealthy positions
**Who can call**: Anyone (permissionless)
**Requirements**: Position must have Health Factor < 1.0
**Reward**: Liquidator receives collateral worth repay_amount + bonus

## Configurable Parameters

### Risk Parameters (Basis Points)

| Parameter | Default | Range | Description |
|-----------|---------|--------|-------------|
| `ltv_max_bps` | 5000 (50%) | 0-10000 | Maximum borrowing capacity |
| `liquidation_threshold_bps` | 6000 (60%) | 0-10000 | When liquidation is allowed |
| `liquidation_bonus_bps` | 600 (6%) | 0-2000 | Liquidator incentive |
| `interest_rate_bps` | 1200 (12%) | 0-10000 | Annual interest rate |

### How to Change Parameters

1. **During Initialization**:
   ```typescript
   await program.methods.initialize({
     ltvMaxBps: 4000,           // 40% LTV
     liquidationThresholdBps: 5500,  // 55% liquidation
     liquidationBonusBps: 800,   // 8% bonus
     interestRateBps: 1500,      // 15% APR
     // ... other params
   }).rpc();
   ```

2. **After Deployment** (Admin only):
   ```typescript
   await program.methods.adminSetParams({
     ltvMaxBps: 4500,  // Update to 45%
     // Leave others unchanged by passing null
   }).rpc();
   ```

### Safety Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Minimum Deposit | 0.1 SOL | Prevents dust deposits |
| Minimum Repayment | 1 USDC | Prevents dust repayments |
| Max Oracle Staleness | 30 slots (~15 seconds) | Ensures fresh prices |
| Max Price Confidence | 2% | Rejects uncertain prices |
| Health Factor Buffer | 1.10 | Safety margin for new debt |

## Oracle Integration

The program uses Pyth Network oracles for pricing:
- **SOL/USD**: For general SOL price reference
- **jitoSOL/USD**: For accurate collateral valuation

Oracles are validated for:
- Freshness (not older than 30 slots)
- Confidence interval (within 2% deviation)
- Positive values only

## Events

The program emits events for off-chain indexing:

```rust
DebtRecorded {
    user: Pubkey,
    amount: u64,
    new_total_debt: u64,
    health_factor: u64,
    timestamp: i64,
}

DebtRepaid {
    user: Pubkey,
    amount: u64,
    remaining_debt: u64,
    timestamp: i64,
}

PositionLiquidated {
    user: Pubkey,
    liquidator: Pubkey,
    repay_amount: u64,
    collateral_seized: u64,
    remaining_debt: u64,
    remaining_collateral: u64,
    timestamp: i64,
}
```

## Emergency Procedures

### Pausing the Protocol
```typescript
await program.methods.adminSetPaused(true).rpc();
```
This prevents all user operations except liquidations.

### Updating Oracle Addresses
```typescript
await program.methods.adminSetParams({
    jitoSolUsdOracle: new_oracle_address,
}).rpc();
```

## Common Scenarios

### User Flow
1. Create position: `init_position()`
2. Deposit jitoSOL: `deposit_collateral(1_000_000_000)` // 1 jitoSOL
3. Spend with card (backend records): `record_debt(500_000_000)` // $500
4. Repay debt: `repay_usdc(550_000_000)` // $550 with interest
5. Withdraw excess: `withdraw_collateral(500_000_000)` // 0.5 jitoSOL

### Liquidator Flow
1. Monitor positions with Health Factor < 1.0
2. Calculate profitable liquidation amount
3. Call `liquidate(repay_amount)`
4. Receive jitoSOL worth repay_amount + 6% bonus

## Security Considerations

1. **Reentrancy Protection**: All state changes before external calls
2. **Overflow Protection**: Checked math on all operations
3. **Access Control**: Admin functions restricted to protocol owner
4. **Oracle Validation**: Multiple checks on price feeds
5. **Slippage Protection**: Validates expected vs actual amounts 