'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Activity, Layers, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Home', icon: CreditCard },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/spend', label: 'Spend', icon: Activity },
  { href: '/collateral', label: 'Collateral', icon: Layers },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/10 safe-bottom">
      <div className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 py-2">
              <Icon className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-[10px] uppercase tracking-widest', active ? 'text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
