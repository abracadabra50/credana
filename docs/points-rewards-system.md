# Credana Points & Rewards System

## Overview

A points-based incentive system to drive adoption, reward early users, and encourage healthy financial behaviour.

## Points Earning Mechanisms

### 1. Card Spending Points
- **Base Rate**: 1 point per $1 spent
- **Bonus Categories** (2x-5x multipliers):
  - Crypto services: 5x points
  - Tech/SaaS: 3x points
  - Travel: 2x points
  - Everything else: 1x points

### 2. Protocol Participation
- **First Deposit**: 1,000 bonus points
- **Collateral Milestones**:
  - 1 jitoSOL deposited: 500 points
  - 10 jitoSOL: 5,000 points
  - 50 jitoSOL: 30,000 points
- **Maintaining Health**: 100 points/day for HF > 1.5

### 3. Early Adopter Bonuses
- **Genesis Users** (First 100): 10,000 points + "OG" NFT
- **Beta Testers** (First 1,000): 5,000 points
- **Week 1 Users**: 2,500 points
- **Month 1 Users**: 1,000 points

### 4. Referral Programme
- **Successful Referral**: 2,500 points (both parties)
- **Referee Spends $1,000**: Additional 2,500 points
- **Tier Bonuses**: Extra points for 5, 10, 25 referrals

## Points Redemption Options

### 1. Fee Reductions
- 10,000 points = 1 month 0% interest
- 5,000 points = 50% interest discount for 1 month
- 2,500 points = Waive one liquidation penalty

### 2. Credit Line Boosts
- 25,000 points = +5% temporary LTV boost (30 days)
- 50,000 points = +10% temporary LTV boost (30 days)

### 3. Exclusive Perks
- 100,000 points = Metal physical card
- 50,000 points = Priority support access
- 25,000 points = Early access to new features

### 4. Partner Rewards
- Discounts on DeFi protocols
- Airdrop allocations
- Exclusive NFT mints

## Points System Architecture

### On-Chain Component
```solidity
struct UserPoints {
    uint64 total_earned;
    uint64 total_spent;
    uint64 current_balance;
    uint32 multiplier_tier;
    uint32 streak_days;
}
```

### Off-Chain Tracking
- Real-time points calculation on card swipes
- Daily batch jobs for participation rewards
- Fraud detection for points gaming

## Implementation Priorities

1. **Phase 1 (MVP)**: Basic spending points
2. **Phase 2**: Referrals and milestones  
3. **Phase 3**: Redemption marketplace
4. **Phase 4**: Partner integrations

## Points Economics

- **No expiry** for earned points
- **Non-transferable** (initially)
- **Retroactive rewards** for beta users
- **Seasonal campaigns** for engagement

## Gamification Elements

### Achievements
- "First Purchase" - Make your first card transaction
- "Healthy Habit" - Maintain HF > 2.0 for 30 days
- "Big Spender" - Spend $10,000 in a month
- "Diamond Hands" - Hold position for 6 months

### Leaderboards
- Monthly spending leaders
- Healthiest positions
- Referral champions

### Streaks
- Daily login streak
- Repayment streak
- Health factor streak

## Anti-Gaming Measures

1. **Velocity Limits**: Max points/day caps
2. **Merchant Verification**: Block manufactured spending
3. **Cooldown Periods**: Between major redemptions
4. **Manual Review**: For suspicious patterns

## Database Schema

```sql
-- Points transactions
points_transactions (
    id, user_id, type, amount, 
    multiplier, metadata, created_at
)

-- Points balance (cached)
points_balances (
    user_id, total_earned, total_spent,
    current_balance, tier, updated_at
)

-- Achievements
user_achievements (
    user_id, achievement_id, 
    earned_at, points_awarded
)
``` 