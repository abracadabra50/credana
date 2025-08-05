# Changelog

All notable changes to the Credana project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - MVP Development

### Added
- Initial project structure setup with Anchor, backend, and frontend directories
- Comprehensive README with architecture overview and setup instructions
- Project .gitignore configuration for Solana/Anchor and Node.js development
- Week-by-week implementation plan documentation
- Points & Rewards system design document
- Database architecture document explaining technology choices

### Anchor Program (Completed)
- ✅ Complete Anchor program structure with all modules
- ✅ State management: Config and UserPosition accounts
- ✅ Core instructions implemented:
  - `initialize`: Protocol setup with configurable parameters
  - `init_position`: User credit position creation
  - `deposit_collateral`: jitoSOL deposits with LTV calculation
  - `withdraw_collateral`: Safe withdrawals with health factor checks
  - `record_debt`: Backend-triggered debt recording from card transactions
  - `repay_usdc`: USDC debt repayment with interest accrual
  - `liquidate`: Permissionless liquidation with bonus incentives
  - `admin_set_params`: Dynamic parameter updates
  - `admin_set_paused`: Emergency pause functionality
- ✅ Utility functions for:
  - Pyth oracle price validation
  - Interest rate calculations using borrow index
  - Health factor and LTV computations
  - Liquidation bonus calculations
- ✅ Error handling with comprehensive error types
- ✅ Event emissions for indexer integration

### Backend Services (In Progress)
- ✅ PostgreSQL database schema with:
  - User management and KYC tracking
  - Position caching for fast authorization
  - Card events with monthly partitioning
  - Points system tables
  - Audit logging for compliance
- ✅ Stripe webhook handler implementation:
  - Real-time authorization with <500ms response
  - Health factor checks for card approvals
  - Points awarding on spending
  - Refund handling
- ✅ Authorization service with:
  - Health factor calculations
  - Spending limit validation
  - Circuit breaker checks
  - Risk level assessment

### Documentation
- ✅ Anchor program guide with parameter customization instructions
- ✅ Points & rewards system design with gamification elements
- ✅ Database architecture rationale (PostgreSQL + Redis over Supabase)

### Architecture Components
- **Solana Program (Anchor)**: Core credit system smart contract with collateral management
- **Backend Services**: Auth webhook handler, blockchain indexer, API, and transaction relayer
- **Frontend**: Next.js application with wallet integration
- **Card Issuing**: Stripe Issuing integration for virtual card provisioning
- **Risk Engine**: Real-time health factor calculations and liquidation monitoring
- **Points System**: Rewards for spending, participation, and referrals
- **Database Stack**: PostgreSQL + Redis for <500ms auth responses

### Week 1 Focus
- [x] Anchor program skeleton with basic account structures
- [x] Complete smart contract implementation
- [x] Architecture documentation and design decisions
- [x] Database schema implementation
- [x] Stripe webhook handler for authorization/capture events
- [x] Authorization service with health factor checks
- [ ] KYC integration (Sumsub/Veriff) for user onboarding
- [ ] Blockchain indexer service
- [ ] Redis cache layer setup

### Technical Specifications
- Collateral: jitoSOL only (MVP)
- Max LTV: 50%
- Liquidation Threshold: 60%
- Liquidation Bonus: 6%
- APR: 12% (flat rate)
- Authorization Response Time: <500ms target
- Points System: 1 point per $1 spent (base rate)

### Architecture Decisions
- **Custom Anchor Program**: Built specifically for credit card use case vs. using existing lending protocols
- **PostgreSQL + Redis**: Direct database access for sub-500ms auth responses vs. Supabase
- **Points System**: Off-chain tracking with on-chain settlement for gas efficiency
- **Stripe Webhooks**: Real-time authorization with health factor checks

### Implementation Details
- **Database**: PostgreSQL with monthly partitioning for card events
- **Caching**: Redis for position data with <2ms access time
- **Authorization Flow**:
  1. Stripe webhook received
  2. Position fetched from Redis cache
  3. Health factor calculated
  4. Decision logged and returned <500ms
- **Points Multipliers**:
  - Crypto services: 5x points
  - Tech/SaaS: 3x points
  - Travel: 2x points
  - Base rate: 1x points

### Next Steps
1. Complete backend services:
   - [ ] Redis configuration and cache warming
   - [ ] Blockchain event indexer
   - [ ] Transaction relayer with Jito integration
   - [ ] API endpoints for user management
2. Frontend development:
   - [ ] Wallet connection
   - [ ] Deposit/withdraw UI
   - [ ] Card management interface
   - [ ] Position monitoring dashboard
3. Integration testing and deployment scripts
