'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  className
}: StatCardProps) {
  return (
    <div className={cn(
      "relative group glass p-6 transition-all duration-200",
      "hover:shadow-glow hover:translate-y-[-1px]",
      "border-l-2 border-l-primary/50",
      className
    )}>
      {/* Background gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-8 h-8 bg-primary/10 flex items-center justify-center border border-primary/20">
                {icon}
              </div>
            )}
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
          </div>
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1",
              trend.isPositive 
                ? "text-green-400 bg-green-400/10 border border-green-400/20" 
                : "text-red-400 bg-red-400/10 border border-red-400/20"
            )}>
              {trend.isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        
        {/* Value */}
        <div className="space-y-1">
          <div className="text-3xl font-light tracking-tight number-transition">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground opacity-60">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 