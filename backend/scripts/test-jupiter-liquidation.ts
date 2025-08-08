#!/usr/bin/env npx tsx

/**
 * TEST JUPITER-BASED LIQUIDATION SYSTEM
 * No liquidators needed - protocol handles everything!
 * 
 * Run: npx tsx scripts/test-jupiter-liquidation.ts
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import chalk from 'chalk';
import axios from 'axios';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

// Token addresses (mainnet)
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  FWOG: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', // Example FWOG
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
};

interface LiquidationScenario {
  name: string;
  token: string;
  tokenSymbol: string;
  amount: number; // in tokens
  debtUsdc: number; // debt to repay
  healthFactor: number;
}

const scenarios: LiquidationScenario[] = [
  {
    name: "Small FWOG Position",
    token: TOKENS.FWOG,
    tokenSymbol: 'FWOG',
    amount: 10000, // 10k FWOG
    debtUsdc: 2500,
    healthFactor: 0.85,
  },
  {
    name: "Medium SOL Position",
    token: TOKENS.SOL,
    tokenSymbol: 'SOL',
    amount: 500, // 500 SOL
    debtUsdc: 35000,
    healthFactor: 0.92,
  },
  {
    name: "Large BONK Position",
    token: TOKENS.BONK,
    tokenSymbol: 'BONK',
    amount: 5000000000, // 5B BONK
    debtUsdc: 120000,
    healthFactor: 0.78,
  },
];

async function getTokenPrice(tokenAddress: string): Promise<number> {
  try {
    const response = await axios.get(JUPITER_PRICE_API, {
      params: { ids: tokenAddress }
    });
    return response.data.data[tokenAddress]?.price || 0;
  } catch (error) {
    console.error('Error fetching price:', error);
    return 0;
  }
}

async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number = 100
) {
  try {
    const response = await axios.get(JUPITER_QUOTE_API, {
      params: {
        inputMint,
        outputMint,
        amount,
        slippageBps,
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error getting Jupiter quote:', error);
    return null;
  }
}

function determineLiquidationStrategy(valueUsd: number, tokenSymbol: string) {
  const isMemecion = ['FWOG', 'BONK', 'WIF'].includes(tokenSymbol);
  
  if (isMemecion) {
    if (valueUsd < 5000) return { method: 'instant', duration: 0, slippage: 300 };
    if (valueUsd < 50000) return { method: 'dca', duration: 3600, slippage: 200 };
    return { method: 'twap', duration: 21600, slippage: 150 }; // 6 hours
  }
  
  if (valueUsd < 10000) return { method: 'instant', duration: 0, slippage: 100 };
  if (valueUsd < 100000) return { method: 'dca', duration: 3600, slippage: 75 };
  return { method: 'twap', duration: 14400, slippage: 50 }; // 4 hours
}

async function simulateLiquidation(scenario: LiquidationScenario) {
  console.log(chalk.yellow(`\n${'═'.repeat(60)}`));
  console.log(chalk.yellow.bold(`  ${scenario.name}`));
  console.log(chalk.yellow(`${'═'.repeat(60)}\n`));
  
  // Step 1: Get current price
  console.log('📊 Fetching current market data...');
  const price = await getTokenPrice(scenario.token);
  const positionValue = scenario.amount * price;
  
  console.log(`  Token: ${chalk.cyan(scenario.tokenSymbol)}`);
  console.log(`  Amount: ${chalk.white(scenario.amount.toLocaleString())} tokens`);
  console.log(`  Price: $${chalk.green(price.toFixed(6))}`);
  console.log(`  Position Value: $${chalk.yellow(positionValue.toFixed(2))}`);
  console.log(`  Debt: $${chalk.red(scenario.debtUsdc.toFixed(2))}`);
  console.log(`  Health Factor: ${chalk.red(scenario.healthFactor)} ⚠️ LIQUIDATABLE!\n`);
  
  // Step 2: Determine strategy
  const strategy = determineLiquidationStrategy(positionValue, scenario.tokenSymbol);
  console.log('🎯 Liquidation Strategy:');
  console.log(`  Method: ${chalk.magenta.bold(strategy.method.toUpperCase())}`);
  if (strategy.duration > 0) {
    console.log(`  Duration: ${chalk.white(strategy.duration / 3600)} hours`);
  }
  console.log(`  Max Slippage: ${chalk.white(strategy.slippage / 100)}%\n`);
  
  // Step 3: Get Jupiter quote
  console.log('🔄 Getting Jupiter quote...');
  const amountInSmallestUnit = Math.floor(scenario.amount * Math.pow(10, 9)); // Assuming 9 decimals
  const quote = await getJupiterQuote(
    scenario.token,
    TOKENS.USDC,
    amountInSmallestUnit.toString(),
    strategy.slippage
  );
  
  if (quote) {
    const outputUsdc = parseInt(quote.outAmount) / 1e6; // USDC has 6 decimals
    const priceImpact = parseFloat(quote.priceImpactPct) * 100;
    
    console.log(`  Expected Output: $${chalk.green(outputUsdc.toFixed(2))} USDC`);
    console.log(`  Price Impact: ${chalk.yellow(priceImpact.toFixed(2))}%`);
    console.log(`  Route: ${quote.routePlan?.length || 0} hops through DEXs\n`);
    
    // Step 4: Calculate profit
    const profit = outputUsdc - scenario.debtUsdc;
    const profitPercent = (profit / scenario.debtUsdc) * 100;
    
    console.log('💰 Liquidation Results:');
    console.log(`  Debt Repaid: $${chalk.white(scenario.debtUsdc.toFixed(2))}`);
    console.log(`  USDC Received: $${chalk.green(outputUsdc.toFixed(2))}`);
    console.log(`  Protocol Profit: $${profit > 0 ? chalk.green(profit.toFixed(2)) : chalk.red(profit.toFixed(2))}`);
    console.log(`  Profit Margin: ${profit > 0 ? chalk.green(profitPercent.toFixed(1)) : chalk.red(profitPercent.toFixed(1))}%\n`);
    
    if (profit > 0) {
      console.log('📈 Profit Distribution:');
      console.log(`  Insurance Fund (50%): $${chalk.cyan((profit * 0.5).toFixed(2))}`);
      console.log(`  Treasury (30%): $${chalk.magenta((profit * 0.3).toFixed(2))}`);
      console.log(`  CRED Buyback (20%): $${chalk.yellow((profit * 0.2).toFixed(2))}`);
    }
    
    // Show execution plan for TWAP/DCA
    if (strategy.method !== 'instant') {
      console.log(`\n⏱️ Execution Plan:`);
      const intervals = strategy.method === 'dca' ? 6 : Math.min(strategy.duration / 60, 100);
      const amountPerInterval = scenario.amount / intervals;
      console.log(`  Total Intervals: ${chalk.white(intervals)}`);
      console.log(`  Amount per Interval: ${chalk.white(amountPerInterval.toFixed(2))} ${scenario.tokenSymbol}`);
      console.log(`  Interval Duration: ${chalk.white((strategy.duration / intervals / 60).toFixed(1))} minutes`);
    }
  } else {
    console.log(chalk.red('  ❌ Failed to get Jupiter quote'));
  }
}

async function main() {
  console.log(chalk.magenta.bold('\n' + '═'.repeat(60)));
  console.log(chalk.magenta.bold('   CREDANA JUPITER LIQUIDATION TEST'));
  console.log(chalk.magenta.bold('   No Liquidators Needed! 🚀'));
  console.log(chalk.magenta.bold('═'.repeat(60)));
  
  console.log(chalk.gray('\n📌 Key Features:'));
  console.log(chalk.gray('  • Direct protocol liquidation via Jupiter'));
  console.log(chalk.gray('  • Smart execution (Instant/DCA/TWAP)'));
  console.log(chalk.gray('  • Best prices across all DEXs'));
  console.log(chalk.gray('  • Protocol captures 100% of value'));
  console.log(chalk.gray('  • No liquidation bonuses needed!'));
  
  // Run scenarios
  for (const scenario of scenarios) {
    await simulateLiquidation(scenario);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log(chalk.green.bold('\n' + '═'.repeat(60)));
  console.log(chalk.green.bold('   ✅ LIQUIDATION TEST COMPLETE'));
  console.log(chalk.green.bold('═'.repeat(60)));
  
  console.log(chalk.white('\n🎯 Key Advantages:'));
  console.log('  1. No dependency on external liquidators');
  console.log('  2. Better execution prices via Jupiter');
  console.log('  3. Protocol keeps all profits');
  console.log('  4. Protects token communities from dumps');
  console.log('  5. Always online and automated');
  
  console.log(chalk.cyan('\n💡 Next Steps:'));
  console.log('  • Deploy liquidation bot on AWS/GCP');
  console.log('  • Set up monitoring dashboard');
  console.log('  • Configure alerts for unhealthy positions');
  console.log('  • Test on devnet with real positions');
}

main().catch(console.error); 