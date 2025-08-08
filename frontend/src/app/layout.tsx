import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletProvider } from "@/components/providers/wallet-provider";
import { SideNav } from '@/components/app/nav/side-nav';
import { BottomNav } from '@/components/app/nav/bottom-nav';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Credana - Solana Credit Cards",
  description: "Use your jitoSOL as collateral for instant virtual credit cards",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletProvider>
          <div className="flex">
            <SideNav />
            <div className="flex-1 min-h-screen pb-16 lg:pb-0">{children}</div>
          </div>
          <BottomNav />
        </WalletProvider>
      </body>
    </html>
  );
}
