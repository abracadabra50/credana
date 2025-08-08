'use client';

import { cn } from '@/lib/utils';

export type SpendMode = 'OPTIMISE' | 'DEBIT_FIRST' | 'CREDIT_FIRST';

const MODE_COPY: Record<SpendMode, { title: string; desc: string }> = {
  OPTIMISE: {
    title: 'Optimise',
    desc: 'Automatically minimises costs by routing small purchases to debit and managing utilisation.'
  },
  DEBIT_FIRST: {
    title: 'Debit First',
    desc: 'Spend USDC balance first to avoid interest. Falls back to credit when balance is insufficient.'
  },
  CREDIT_FIRST: {
    title: 'Credit First',
    desc: 'Maximise rewards and float while keeping utilisation under your threshold.'
  },
};

export function ModeSelector({
  value,
  onChange,
  className,
}: {
  value: SpendMode;
  onChange: (m: SpendMode) => void;
  className?: string;
}) {
  const modes: SpendMode[] = ['OPTIMISE', 'DEBIT_FIRST', 'CREDIT_FIRST'];

  return (
    <div className={cn('glass p-4', className)}>
      <div className="flex">
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={cn(
              'flex-1 px-4 py-3 text-xs uppercase tracking-wider transition-colors border-b-2',
              value === m
                ? 'text-primary border-b-primary bg-primary/10'
                : 'text-muted-foreground border-b-transparent hover:bg-white/[0.02]'
            )}
          >
            {MODE_COPY[m].title}
          </button>
        ))}
      </div>
      <div className="pt-3 text-[11px] text-muted-foreground leading-relaxed">
        {MODE_COPY[value].desc}
      </div>
    </div>
  );
}
