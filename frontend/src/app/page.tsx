'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard } from '@/components/ui/credit-card';
import { StatCard } from '@/components/ui/stat-card';
import { WalletButton } from '@/components/ui/wallet-button';
import { KpiStrip, ModeSelector, DebitWidget } from '@/components/app';
import { 
  Wallet, 
  Shield, 
  CreditCard as CreditCardIcon,
  ArrowUpRight,
  Plus,
  Minus,
  ChevronRight,
  Activity,
  Zap,
  DollarSign,
  Coins
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock data - replace with real API calls
const mockPosition = {
  userId: 'user_123',
  walletAddress: '7BgBvyjrZX8YKqjM9kJkCmYjVqwg5fKprF1G2xYj8ZZy',
  collateralAmount: 5000000000, // 5 jitoSOL (9 decimals)
  debtUsdc: 800000000, // $800 (6 decimals)
  borrowIndexSnapshot: 1000000000,
  lastUpdateSlot: 12345678,
  creditLimit: 2500000000, // $2500
  healthFactor: 15625, // 156.25% in BPS
  availableCredit: 1700000000, // $1700
  lastCacheUpdate: Date.now(),
  isHealthy: true,
};

const mockDebit = {
  balance: 820.45,
  pending: [
    { amount: 250.0, etaMinutes: 35 },
  ],
};

const mockTransactions = [
  { id: '1', merchant: 'Starbucks', amount: 5.5, currency: 'USD', status: 'completed', date: '2024-01-15 10:30 AM', icon: '☕' },
  { id: '2', merchant: 'Amazon', amount: 89.99, currency: 'USD', status: 'completed', date: '2024-01-14 2:45 PM', icon: '📦' },
  { id: '3', merchant: 'Netflix', amount: 15.99, currency: 'USD', status: 'completed', date: '2024-01-13 8:00 PM', icon: '🎬' },
  { id: '4', merchant: 'Uber', amount: 23.45, currency: 'USD', status: 'pending', date: '2024-01-13 6:30 PM', icon: '🚗' },
];

const mockCollateral = [
  { token: 'jitoSOL', amount: 5, value: 1000, apy: 7.2, icon: '⚡' },
  { token: 'SOL', amount: 10, value: 2000, apy: 0, icon: '◉' },
  { token: 'USDC', amount: 500, value: 500, apy: 0, icon: '💵' },
];

export default function Dashboard() {
  const [position] = useState(mockPosition);
  const [selectedCard, setSelectedCard] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'collateral'>('overview');
  const [mode, setMode] = useState<'OPTIMISE' | 'DEBIT_FIRST' | 'CREDIT_FIRST'>('OPTIMISE');

  // Convert to display values
  const collateralValue = (position.collateralAmount / 1_000_000_000) * 200; // $200 per jitoSOL
  const debtValue = position.debtUsdc / 1_000_000; // Convert to dollars
  const creditLimit = position.creditLimit / 1_000_000;
  const availableCredit = position.availableCredit / 1_000_000;
  const healthFactorPercent = position.healthFactor / 100;
  const utilizationPercent = (debtValue / creditLimit) * 100;

  const cardVariants: Array<'purple' | 'dark' | 'cyan' | 'gradient'> = ['purple', 'dark', 'cyan', 'gradient'];

  const kpis = [
    { label: 'Available to Spend', value: `$${(availableCredit + mockDebit.balance).toLocaleString()}` , sublabel: 'Debit + unused credit', emphasis: 'primary' as const },
    { label: 'Credit Utilisation', value: `${utilizationPercent.toFixed(1)}%`, sublabel: `Using $${debtValue.toLocaleString()} of $${creditLimit.toLocaleString()}` },
    { label: 'Outstanding', value: `$${debtValue.toLocaleString()}`, sublabel: 'Next statement: 28 Feb' },
    { label: 'Health Factor', value: `${healthFactorPercent.toFixed(0)}%`, sublabel: position.isHealthy ? 'Healthy' : 'At Risk', emphasis: position.isHealthy ? 'default' : 'danger' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="sticky top-0 z-50 glass border-b border-white/[0.05] safe-top">
          <div className="flex items-center justify-between px-6 py-4 lg:px-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-violet-700 flex items-center justify-center">
                <CreditCardIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-light tracking-tight">CREDANA</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Smart Credit Protocol</p>
              </div>
            </div>
            <WalletButton />
          </div>
        </header>

        {/* Main Content */}
        <main className="px-6 py-6 lg:px-8 space-y-6">
          {/* KPI Strip */}
          <KpiStrip items={kpis} />

          {/* Mode + Debit */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ModeSelector value={mode} onChange={setMode} className="lg:col-span-2" />
            <DebitWidget balance={mockDebit.balance} pending={mockDebit.pending} />
          </div>

          {/* Credit Card Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light tracking-tight">Your Card</h2>
              <button className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 uppercase tracking-wider">
                Manage
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Card Carousel */}
            <div className="relative">
              <CreditCard
                variant={cardVariants[selectedCard]}
                cardNumber="•••• •••• •••• 1234"
                cardHolder="JOHN DOE"
                validThru="12/27"
                balance={availableCredit}
                limit={creditLimit}
                className="mx-auto"
              />

              {/* Card variant selector */}
              <div className="flex justify-center gap-2 mt-6">
                {cardVariants.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedCard(index)}
                    className={cn(
                      'h-[2px] transition-all duration-300',
                      selectedCard === index ? 'w-12 bg-primary shadow-glow' : 'w-6 bg-white/20 hover:bg-white/30'
                    )}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* Stats Grid */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Available Credit"
              value={`$${availableCredit.toLocaleString()}`}
              subtitle={`of $${creditLimit.toLocaleString()} limit`}
              icon={<Wallet className="w-4 h-4 text-primary" />}
            />
            <StatCard
              title="Current Debt"
              value={`$${debtValue.toLocaleString()}`}
              subtitle={`${utilizationPercent.toFixed(1)}% utilised`}
              icon={<DollarSign className="w-4 h-4 text-primary" />}
            />
            <StatCard
              title="Collateral Value"
              value={`$${collateralValue.toLocaleString()}`}
              subtitle="5 jitoSOL"
              icon={<Coins className="w-4 h-4 text-primary" />}
            />
            <StatCard
              title="Health Factor"
              value={`${healthFactorPercent.toFixed(0)}%`}
              subtitle={position.isHealthy ? 'Healthy' : 'At Risk'}
              icon={<Shield className={cn('w-4 h-4', position.isHealthy ? 'text-green-500' : 'text-red-500')} />}
            />
          </section>

          {/* Tabs Navigation */}
          <div className="flex gap-0 glass">
            {(['overview', 'transactions', 'collateral'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 px-6 py-3 text-xs font-medium uppercase tracking-wider transition-all duration-200',
                  'border-b-2',
                  activeTab === tab ? 'bg-primary/10 text-primary border-b-primary' : 'text-muted-foreground hover:text-foreground border-b-transparent hover:bg-white/[0.02]'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === 'transactions' && (
            <section className="glass p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-light uppercase tracking-widest">Recent Activity</h3>
                <button className="text-xs text-primary hover:text-primary/80 font-medium uppercase tracking-wider">
                  View All
                </button>
        </div>
              <div className="space-y-3">
                {mockTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 bg-card/50 hover:bg-card transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 flex items-center justify-center text-lg">
                        {tx.icon}
                      </div>
                      <div>
                        <div className="font-medium">{tx.merchant}</div>
                        <div className="text-[11px] text-muted-foreground">{tx.date}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold flex items-center gap-1">
                        <ArrowUpRight className="w-4 h-4 text-red-500" />
                        ${tx.amount.toFixed(2)}
                      </div>
                      <div className={cn('text-[11px]', tx.status === 'completed' ? 'text-green-500' : 'text-yellow-500')}>
                        {tx.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section className="glass p-6 space-y-4 border-l-2 border-l-primary/50">
                <h3 className="text-sm font-light uppercase tracking-widest flex items-center gap-3">
                  <Zap className="w-4 h-4 text-primary" />
                  Quick Actions
                </h3>
                <div className="grid grid-cols-2 gap-0">
                  <button className="btn-primary flex flex-col items-center gap-2 py-4 border-r border-primary/20">
                    <Plus className="w-5 h-5" />
                    <span className="text-xs uppercase tracking-wider">Add Collateral</span>
                  </button>
                  <button className="btn-secondary flex flex-col items-center gap-2 py-4">
                    <Minus className="w-5 h-5" />
                    <span className="text-xs uppercase tracking-wider">Repay Debt</span>
                  </button>
                </div>
              </section>

              <section className="glass p-6 space-y-4 border-l-2 border-l-accent/50">
                <h3 className="text-sm font-light uppercase tracking-widest">Position Health</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs uppercase tracking-wider">
                    <span className="text-muted-foreground">Utilisation</span>
                    <span className="font-mono font-light">{utilizationPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-1 bg-black border border-white/10 overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500',
                        utilizationPercent < 50 ? 'bg-green-400' : utilizationPercent < 80 ? 'bg-yellow-400' : 'bg-red-400'
                      )}
                      style={{ width: `${utilizationPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground opacity-60">MAINTAIN BELOW 80% FOR OPTIMAL HEALTH</p>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
