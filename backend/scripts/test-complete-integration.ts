#!/usr/bin/env npx tsx

/**
 * Complete Integration Test
 * Tests the full flow from wallet connection to card transaction
 */

import axios from 'axios';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import chalk from 'chalk';

const API_URL = 'http://localhost:3002';
const SOLANA_RPC = 'https://api.devnet.solana.com';

// Test wallet (you should have some devnet SOL here)
const TEST_WALLET = '6xsZeTcpY1GLFcEJ6kqtxApgdVW8cXgZJztkc2tbn2pM';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testIntegration() {
  console.log(chalk.cyan.bold('\n🚀 CREDANA COMPLETE INTEGRATION TEST\n'));
  console.log(chalk.gray('═'.repeat(50)));

  try {
    // 1. Check services
    console.log(chalk.yellow('\n1️⃣  Checking Services...'));
    
    const health = await axios.get(`${API_URL}/health`);
    console.log(chalk.green('   ✅ Backend API: ' + health.data.status));
    
    try {
      await axios.get('http://localhost:3000');
      console.log(chalk.green('   ✅ Frontend: Running'));
    } catch {
      console.log(chalk.yellow('   ⚠️  Frontend: Not responding (may be loading)'));
    }

    // 2. Check wallet balance
    console.log(chalk.yellow('\n2️⃣  Checking Wallet Balance...'));
    
    const connection = new Connection(SOLANA_RPC);
    const walletPubkey = new PublicKey(TEST_WALLET);
    const balance = await connection.getBalance(walletPubkey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    console.log(chalk.green(`   💰 Wallet: ${TEST_WALLET}`));
    console.log(chalk.green(`   💰 Balance: ${solBalance.toFixed(4)} SOL`));
    
    if (solBalance < 0.1) {
      console.log(chalk.red('   ❌ Insufficient SOL. Please airdrop some devnet SOL.'));
      console.log(chalk.gray(`      Run: solana airdrop 1 ${TEST_WALLET} --url devnet`));
      return;
    }

    // 3. Get current position
    console.log(chalk.yellow('\n3️⃣  Fetching Current Position...'));
    
    const position = await axios.get(`${API_URL}/api/position/${TEST_WALLET}`);
    const { collateral, credit, metrics } = position.data;
    
    console.log(chalk.green(`   📊 Collateral: ${collateral.sol.toFixed(4)} SOL ($${collateral.valueUSD.toFixed(2)})`));
    console.log(chalk.green(`   💳 Credit Limit: $${credit.limit.toFixed(2)}`));
    console.log(chalk.green(`   💵 Available: $${credit.available.toFixed(2)}`));
    console.log(chalk.green(`   💸 Current Debt: $${credit.used.toFixed(2)}`));
    console.log(chalk.green(`   🏥 Health Factor: ${metrics.healthFactor.toFixed(2)}`));

    // 4. Onboard user (if not already)
    console.log(chalk.yellow('\n4️⃣  Onboarding User...'));
    
    const onboardResponse = await axios.post(`${API_URL}/api/users/onboard`, {
      walletAddress: TEST_WALLET,
      email: 'test@credana.io',
      firstName: 'Test',
      lastName: 'User'
    });
    
    const { accountToken } = onboardResponse.data;
    console.log(chalk.green(`   ✅ User onboarded`));
    console.log(chalk.gray(`   📝 Account Token: ${accountToken}`));

    // 5. Create virtual card
    console.log(chalk.yellow('\n5️⃣  Creating Virtual Card...'));
    
    const cardResponse = await axios.post(`${API_URL}/api/cards/create`, {
      accountToken,
      spendLimit: Math.floor(credit.available * 100) // Convert to cents
    });
    
    const { cardToken, card } = cardResponse.data;
    console.log(chalk.green(`   ✅ Card created`));
    console.log(chalk.gray(`   💳 Card Token: ${cardToken}`));
    console.log(chalk.gray(`   💳 Last 4: ${card.last4}`));
    console.log(chalk.gray(`   💰 Spend Limit: $${card.spendLimit / 100}`));

    // 6. Simulate a purchase
    console.log(chalk.yellow('\n6️⃣  Simulating Purchase...'));
    
    const purchaseAmount = 5000; // $50 in cents
    const purchaseResponse = await axios.post(`${API_URL}/api/test/simulate-purchase`, {
      cardToken,
      amount: purchaseAmount,
      merchant: 'Test Coffee Shop'
    });
    
    if (purchaseResponse.data.approved) {
      console.log(chalk.green(`   ✅ Transaction approved!`));
      console.log(chalk.gray(`   🛍️  Merchant: ${purchaseResponse.data.transaction.merchant}`));
      console.log(chalk.gray(`   💵 Amount: $${purchaseResponse.data.transaction.amount}`));
      console.log(chalk.gray(`   🆔 Transaction ID: ${purchaseResponse.data.transaction.id}`));
    } else {
      console.log(chalk.red(`   ❌ Transaction declined`));
    }

    // 7. Check updated position
    console.log(chalk.yellow('\n7️⃣  Checking Updated Position...'));
    
    const updatedPosition = await axios.get(`${API_URL}/api/position/${TEST_WALLET}`);
    const updatedCredit = updatedPosition.data.credit;
    
    console.log(chalk.green(`   💸 New Debt: $${updatedCredit.used.toFixed(2)}`));
    console.log(chalk.green(`   💵 Remaining Credit: $${updatedCredit.available.toFixed(2)}`));

    // 8. Get transaction history
    console.log(chalk.yellow('\n8️⃣  Fetching Transaction History...'));
    
    const transactions = await axios.get(`${API_URL}/api/transactions/${TEST_WALLET}`);
    console.log(chalk.green(`   📜 Found ${transactions.data.transactions.length} transactions:`));
    
    transactions.data.transactions.slice(0, 3).forEach((tx: any) => {
      console.log(chalk.gray(`      • $${tx.amount} at ${tx.merchant} (${tx.status})`));
    });

    // 9. Test repayment
    console.log(chalk.yellow('\n9️⃣  Testing Debt Repayment...'));
    
    const repayResponse = await axios.post(`${API_URL}/api/debt/repay`, {
      wallet: TEST_WALLET,
      amount: 25 // Repay $25
    });
    
    console.log(chalk.green(`   ✅ Repayment successful`));
    console.log(chalk.gray(`   💵 Amount repaid: $25`));
    console.log(chalk.gray(`   💸 New debt: $${repayResponse.data.newDebt.toFixed(2)}`));

    // 10. Check treasury status
    console.log(chalk.yellow('\n🔟 Checking Treasury Status...'));
    
    const treasury = await axios.get(`${API_URL}/api/treasury/status`);
    console.log(chalk.green(`   💰 Operating Balance: $${treasury.data.operatingBalance.toLocaleString()}`));
    console.log(chalk.green(`   💰 Issuing Balance: $${treasury.data.issuingBalance.toLocaleString()}`));
    console.log(chalk.green(`   📅 Runway: ${treasury.data.runwayDays} days`));
    console.log(chalk.green(`   ✅ Status: ${treasury.data.status}`));

    // Summary
    console.log(chalk.gray('\n' + '═'.repeat(50)));
    console.log(chalk.cyan.bold('\n✅ INTEGRATION TEST COMPLETE!\n'));
    console.log(chalk.white('Next Steps:'));
    console.log(chalk.gray('1. Open http://localhost:3000 in your browser'));
    console.log(chalk.gray('2. Connect your wallet (Phantom/Solflare)'));
    console.log(chalk.gray('3. Deposit collateral to increase credit limit'));
    console.log(chalk.gray('4. Request a virtual card'));
    console.log(chalk.gray('5. Add to Apple Pay (sandbox mode)'));
    console.log(chalk.gray('6. Make test transactions'));
    
    console.log(chalk.yellow('\n📊 Live Monitoring:'));
    console.log(chalk.gray('• Health: http://localhost:3002/health'));
    console.log(chalk.gray('• Treasury: http://localhost:3002/api/treasury/status'));
    console.log(chalk.gray('• Position: http://localhost:3002/api/position/' + TEST_WALLET));

  } catch (error: any) {
    console.error(chalk.red('\n❌ Test failed:'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    
    if (error.code === 'ECONNREFUSED') {
      console.log(chalk.yellow('\n⚠️  Make sure the backend is running:'));
      console.log(chalk.gray('   cd credana/backend/src && npx tsx api-server.ts'));
    }
  }
}

// Run the test
testIntegration().catch(console.error); 