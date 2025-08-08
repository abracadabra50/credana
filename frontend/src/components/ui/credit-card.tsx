'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CreditCardProps {
  variant?: 'purple' | 'dark' | 'cyan' | 'gradient';
  cardNumber?: string;
  cardHolder?: string;
  validThru?: string;
  balance?: number;
  limit?: number;
  className?: string;
  onClick?: () => void;
}

export function CreditCard({
  variant = 'purple',
  cardNumber = '•••• •••• •••• ••••',
  cardHolder = 'CARD HOLDER',
  validThru = '••/••',
  balance = 0,
  limit = 0,
  className,
  onClick
}: CreditCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  const cardStyles = {
    purple: 'card-gradient-purple border border-violet-500/20',
    dark: 'card-gradient-dark',
    cyan: 'card-gradient-cyan border border-cyan-500/20',
    gradient: 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 border border-white/10'
  };

  return (
    <div 
      className={cn(
        "relative w-full max-w-md aspect-[1.586/1] cursor-pointer perspective-1000",
        className
      )}
      onClick={onClick}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <div className={cn(
        "absolute inset-0 transition-transform duration-700 transform-style-preserve-3d",
        isFlipped && "rotate-y-180"
      )}>
        {/* Front of card */}
        <div className={cn(
          "absolute inset-0 p-6 text-white backface-hidden shadow-premium",
          cardStyles[variant]
        )}>
          {/* Top row with chip and contactless */}
          <div className="flex justify-between items-start mb-12">
            <div className="w-14 h-10 bg-gradient-to-br from-amber-400 to-amber-600" />
            <svg className="w-8 h-8 opacity-60" viewBox="0 0 24 24" fill="none">
              <path d="M2 12C2 17.523 6.477 22 12 22C17.523 22 22 17.523 22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              <path d="M2 12C2 9.879 2.842 7.968 4.222 6.585" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              <path d="M7.05 9.464C7.658 8.862 8.465 8.5 9.343 8.5C11.01 8.5 12.364 9.854 12.364 11.521" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              <path d="M12 12C12 14.761 14.239 17 17 17C19.761 17 22 14.761 22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
            </svg>
          </div>

          {/* Card number */}
          <div className="mb-8">
            <div className="font-mono text-2xl tracking-[0.2em] font-light">
              {cardNumber}
            </div>
          </div>

          {/* Card details */}
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[10px] opacity-60 mb-1 tracking-widest uppercase">Card Holder</div>
              <div className="text-sm font-light tracking-wider uppercase">{cardHolder}</div>
            </div>
            <div>
              <div className="text-[10px] opacity-60 mb-1 tracking-widest uppercase">Valid Thru</div>
              <div className="font-mono text-sm">{validThru}</div>
            </div>
            <div className="text-2xl font-bold tracking-wider">
              VISA
            </div>
          </div>

          {/* Subtle pattern overlay */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 -mr-32 -mt-32" 
                 style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 -ml-24 -mb-24"
                 style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
          </div>
        </div>

        {/* Back of card */}
        <div className={cn(
          "absolute inset-0 p-6 text-white rotate-y-180 backface-hidden shadow-premium",
          cardStyles[variant]
        )}>
          {/* Magnetic stripe */}
          <div className="absolute top-12 left-0 right-0 h-12 bg-black/80" />
          
          {/* Signature and CVC */}
          <div className="mt-24 space-y-4">
            <div className="bg-white/10 backdrop-blur p-3">
              <div className="text-[10px] opacity-60 mb-1 uppercase tracking-widest">Signature</div>
              <div className="h-8 bg-white/5" />
            </div>
            <div className="flex justify-end">
              <div className="bg-white/10 backdrop-blur px-3 py-2">
                <div className="text-[10px] opacity-60 uppercase tracking-widest">CVC</div>
                <div className="font-mono">•••</div>
              </div>
            </div>
          </div>

          {/* Available balance */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex justify-between items-end">
              <div>
                <div className="text-[10px] opacity-60 uppercase tracking-widest">Available</div>
                <div className="text-3xl font-light">
                  ${balance.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] opacity-60 uppercase tracking-widest">Credit Limit</div>
                <div className="text-sm font-light">
                  ${limit.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

 