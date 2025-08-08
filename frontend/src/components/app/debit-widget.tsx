'use client';

import { cn } from '@/lib/utils';

export function DebitWidget({
  balance,
  pending,
  onDepositClick,
  className,
}: {
  balance: number; // in USD
  pending?: { amount: number; etaMinutes?: number }[];
  onDepositClick?: () => void;
  className?: string;
}) {
  const totalPending = (pending || []).reduce((a, p) => a + (p?.amount || 0), 0);

  return (
    <div className={cn('glass p-6 border-l-2 border-l-primary/50', className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Debit Balance</div>
        {onDepositClick && (
          <button onClick={onDepositClick} className="text-xs text-primary hover:underline">
            Deposit USDC
          </button>
        )}
      </div>
      <div className="text-3xl font-light">${balance.toLocaleString()}</div>
      {totalPending > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Pending settlements: ${totalPending.toLocaleString()} {pending?.[0]?.etaMinutes ? `• ~${pending?.[0]?.etaMinutes}m` : ''}
        </div>
      )}
    </div>
  );
}
