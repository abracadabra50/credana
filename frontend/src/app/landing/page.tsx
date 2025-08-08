'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement waitlist API
    console.log('Waitlist signup:', email);
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 text-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold">CREDANA</div>
        <Button variant="outline" className="text-white border-white hover:bg-white hover:text-black">
          Get Early Access
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="px-8 py-20 max-w-7xl mx-auto text-center">
        <h1 className="text-6xl md:text-7xl font-bold mb-6">
          Never sell your winners.
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
          Your crypto portfolio is now your credit line. Keep earning, keep holding, keep spending.
        </p>
        
        {!isSubmitted ? (
          <form onSubmit={handleWaitlist} className="flex gap-4 max-w-md mx-auto mb-4">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/10 border-white/20 text-white placeholder:text-gray-400"
            />
            <Button type="submit" className="bg-white text-black hover:bg-gray-200 px-8">
              Get Early Access
            </Button>
          </form>
        ) : (
          <div className="text-green-400 text-lg mb-4">
            ✓ You're on the waitlist! We'll be in touch soon.
          </div>
        )}
        
        <p className="text-gray-400">Join 500+ on the waitlist</p>

        {/* Trust Badges */}
        <div className="flex gap-8 justify-center mt-12 text-sm text-gray-400">
          <span>✓ Over-collateralised</span>
          <span>✓ Keep earning yield</span>
          <span>✓ No credit check</span>
        </div>
        
        <p className="text-xs text-gray-500 mt-4">
          *Major SPL assets today, expanding fast. Supported assets vary by region. 
          Borrowing involves risk. LTVs and limits can change with market conditions.
        </p>
      </section>

      {/* How It Works */}
      <section className="px-8 py-20 bg-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white/10 border-white/20 p-8 text-center">
              <div className="text-3xl font-bold mb-4 text-blue-400">1</div>
              <h3 className="text-xl font-semibold mb-2">Deposit Collateral</h3>
              <p className="text-gray-400">SOL, jitoSOL, mSOL, or USDC</p>
            </Card>
            <Card className="bg-white/10 border-white/20 p-8 text-center">
              <div className="text-3xl font-bold mb-4 text-blue-400">2</div>
              <h3 className="text-xl font-semibold mb-2">Get Instant Credit</h3>
              <p className="text-gray-400">Up to 60% of your collateral value</p>
            </Card>
            <Card className="bg-white/10 border-white/20 p-8 text-center">
              <div className="text-3xl font-bold mb-4 text-blue-400">3</div>
              <h3 className="text-xl font-semibold mb-2">Spend Anywhere</h3>
              <p className="text-gray-400">Virtual card works globally</p>
            </Card>
          </div>
        </div>
      </section>

      {/* The Math Section */}
      <section className="px-8 py-20">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">The Math</h2>
          <div className="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            <Card className="bg-red-900/20 border-red-500/20 p-8">
              <h3 className="text-xl font-semibold mb-4 text-red-400">Without Credana ❌</h3>
              <ul className="space-y-2 text-gray-300">
                <li>→ Sell SOL to pay bills</li>
                <li>→ Pay capital gains tax (20-40%)</li>
                <li>→ Miss future pumps</li>
                <li>→ Lose staking rewards</li>
              </ul>
            </Card>
            <Card className="bg-green-900/20 border-green-500/20 p-8">
              <h3 className="text-xl font-semibold mb-4 text-green-400">With Credana ✓</h3>
              <ul className="space-y-2 text-gray-300">
                <li>→ Borrow against SOL</li>
                <li>→ No taxable event</li>
                <li>→ Keep 100% upside</li>
                <li>→ Yield pays interest</li>
              </ul>
            </Card>
          </div>
          <div className="text-center mt-12 text-gray-400">
            Example: $10k jitoSOL = $6k credit line at ~0.2% net cost after yield
          </div>
        </div>
      </section>

      {/* Supported Assets */}
      <section className="px-8 py-20 bg-white/5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Launch Collateral</h2>
          <div className="overflow-x-auto">
            <table className="w-full max-w-4xl mx-auto">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-4">Asset</th>
                  <th className="text-center py-4">LTV</th>
                  <th className="text-center py-4">APY</th>
                  <th className="text-right py-4">Net Cost</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr className="border-b border-white/10">
                  <td className="py-4">USDC</td>
                  <td className="text-center">80%</td>
                  <td className="text-center">0%</td>
                  <td className="text-right">12% APR</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-4">jitoSOL</td>
                  <td className="text-center">60%</td>
                  <td className="text-center text-green-400">~7%</td>
                  <td className="text-right text-green-400">~5% APR*</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-4">mSOL</td>
                  <td className="text-center">60%</td>
                  <td className="text-center text-green-400">~6.5%</td>
                  <td className="text-right text-green-400">~5.5% APR*</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-4">SOL</td>
                  <td className="text-center">55%</td>
                  <td className="text-center">0%</td>
                  <td className="text-right">12% APR</td>
                </tr>
              </tbody>
            </table>
            <p className="text-center text-gray-400 mt-4 text-sm">
              More assets coming soon: WIF, BONK, Kamino LPs
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-8 py-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">FAQ</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-semibold mb-2">Is this a taxable event?</h3>
              <p className="text-gray-400">
                Borrowing against collateral can defer taxable events where applicable*. 
                Interest may be tax-deductible for investment purposes. 
                *Tax treatment varies by jurisdiction. Consult your tax advisor.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">What happens if my collateral drops?</h3>
              <p className="text-gray-400">
                Conservative LTVs provide a buffer. You'll receive alerts before liquidation. 
                Can add collateral or repay to maintain health factor.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">How is this different from selling?</h3>
              <p className="text-gray-400">
                You keep 100% ownership. No taxes. Keep earning yield. Capture all upside. 
                Only pay interest on what you borrow.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">What are the fees?</h3>
              <p className="text-gray-400">
                12-18% APR on borrowed amount. No hidden fees. Yield from LSTs offsets cost. 
                Example: jitoSOL nets ~5% after yield.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-8 py-20 text-center">
        <h2 className="text-4xl font-bold mb-6">Ready to never sell again?</h2>
        <p className="text-xl text-gray-300 mb-8">
          Join the waitlist for early access to Credana.
        </p>
        <Button className="bg-white text-black hover:bg-gray-200 px-12 py-6 text-lg">
          Get Early Access →
        </Button>
      </section>

      {/* Footer */}
      <footer className="px-8 py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-gray-400">
            © 2025 Credana. Built on Solana.
          </div>
          <div className="flex gap-6 text-gray-400">
            <a href="#" className="hover:text-white">Twitter</a>
            <a href="#" className="hover:text-white">Discord</a>
            <a href="#" className="hover:text-white">Docs</a>
          </div>
        </div>
        <div className="text-center text-xs text-gray-500 mt-8">
          * Supported assets vary by region. Borrowing involves risk. Not financial advice.
        </div>
      </footer>
    </div>
  );
} 