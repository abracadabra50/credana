# Credana - Solana On-Chain Credit Card System

A revolutionary credit card system built on Solana that allows users to deposit jitoSOL as collateral and receive instant virtual credit cards for real-world spending.

## 🚀 MVP Features

- **KYC & Virtual Card Issuance**: Streamlined onboarding with instant virtual card provisioning
- **Collateral Management**: Deposit jitoSOL to back your credit line
- **Real-time Authorization**: Sub-500ms card transaction approvals
- **On-chain Debt Tracking**: Transparent USDC-denominated debt management
- **Smart Liquidations**: Permissionless liquidation with incentives
- **Risk Management**: Dynamic health factor monitoring and circuit breakers

## 📁 Project Structure

```
credana/
├── anchor/          # Solana smart contracts (Anchor framework)
├── backend/         # Backend services (Auth, Indexer, API, Jobs)
├── frontend/        # Next.js web application
├── docs/           # Documentation
├── scripts/        # Deployment and utility scripts
└── tests/          # Integration and unit tests
```

## 🛠 Tech Stack

- **Blockchain**: Solana (Anchor framework)
- **Oracles**: Pyth Network (SOL/USD, jitoSOL/USD)
- **Card Issuing**: Stripe Issuing
- **Backend**: Node.js/TypeScript, Redis, PostgreSQL
- **Frontend**: Next.js, React, TailwindCSS
- **Wallet**: Phantom, Solana Wallet Adapter
- **KYC**: Sumsub/Veriff

## 🏗 Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│   Solana    │
│  (Next.js)  │     │   Services   │     │  (Anchor)   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐       ┌──────────┐
                    │Stripe Issuing│       │   Pyth   │
                    └──────────────┘       │  Oracle  │
                                          └──────────┘
```

## 🚦 Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Solana CLI tools
- Anchor framework (0.29.0+)
- PostgreSQL 14+
- Redis 7+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/credana
cd credana
```

2. Install dependencies:
```bash
# Install Anchor dependencies
cd anchor && anchor build && cd ..

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

3. Set up environment variables (see `.env.example` in each directory)

4. Run database migrations:
```bash
cd backend && npm run migrate && cd ..
```

5. Start development servers:
```bash
# Terminal 1: Start local Solana validator
solana-test-validator

# Terminal 2: Deploy Anchor program
cd anchor && anchor deploy && cd ..

# Terminal 3: Start backend services
cd backend && npm run dev && cd ..

# Terminal 4: Start frontend
cd frontend && npm run dev && cd ..
```

## 📊 Key Parameters (MVP)

- **Max LTV**: 50%
- **Liquidation Threshold**: 60%
- **Liquidation Bonus**: 6%
- **APR**: 12% (flat rate)
- **Health Factor Buffer**: 1.10 (for approvals)
- **Supported Collateral**: jitoSOL only

## 🔐 Security Considerations

- All price feeds validated for staleness and confidence
- Circuit breakers for volatile market conditions
- Rate limiting on all external endpoints
- Comprehensive audit trail for all transactions
- PCI compliance through Stripe's infrastructure

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

See CONTRIBUTING.md for development guidelines

## 📞 Support

- Documentation: [docs.credana.io](https://docs.credana.io)
- Discord: [discord.gg/credana](https://discord.gg/credana)
- Email: support@credana.io
