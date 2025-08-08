'use client';

import { cn } from '@/lib/utils';

type Kpi = {
  label: string;
  value: string;
  sublabel?: string;
  emphasis?: 'primary' | 'warning' | 'danger' | 'default';
};

export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-[1px] bg-white/10', className)}>
      {items.map((kpi, idx) => (
        <div key={idx} className="glass p-4 bg-black">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {kpi.label}
          </div>
          <div
            className={cn(
              'text-2xl lg:text-3xl font-light number-transition',
              kpi.emphasis === 'primary' && 'text-primary',
              kpi.emphasis === 'warning' && 'text-yellow-400',
              kpi.emphasis === 'danger' && 'text-red-400'
            )}
          >
            {kpi.value}
          </div>
          {kpi.sublabel && (
            <div className="text-[10px] text-muted-foreground mt-1">{kpi.sublabel}</div>
          )}
        </div>
      ))}
    </div>
  );
}
