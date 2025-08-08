'use client';

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';

export function WalletButton({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show a placeholder button during SSR
  if (!mounted) {
    return (
      <button className={className || "!bg-primary hover:!bg-primary/90 !text-sm !py-2 !px-4 !rounded-xl !font-medium"}>
        Connect Wallet
      </button>
    );
  }

  return (
    <WalletMultiButton className={className || "!bg-primary hover:!bg-primary/90 !text-sm !py-2 !px-4 !rounded-xl !font-medium"} />
  );
} 