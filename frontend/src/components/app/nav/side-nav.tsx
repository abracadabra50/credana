'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Activity, Layers, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Dashboard', icon: CreditCard },
  { href: '/cards', label: 'Cards', icon: CreditCard },
  { href: '/spend', label: 'Spend', icon: Activity },
  { href: '/collateral', label: 'Collateral', icon: Layers },
  { href: '/statements', label: 'Statements', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:block border-r border-white/10 min-h-screen">
      <nav className="sticky top-0 p-4 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className="block">
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  active
                    ? 'text-primary bg-primary/10 border-l-2 border-l-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.02]'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="uppercase tracking-wider">{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
