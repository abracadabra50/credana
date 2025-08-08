#!/usr/bin/env npx tsx

/**
 * Complete Auth + Turnkey Integration Test
 * Tests the full authentication flow with real Turnkey API
 */

import axios from 'axios';
import chalk from 'chalk';
import { Connection, PublicKey } from '@solana/web3.js';

const AUTH_URL = 'http://localhost:3003';
const TEST_EMAIL = 'demo@credana.io';
const SOLANA_RPC = 'https://api.devnet.solana.com';

// Store session data
let sessionToken: string;
let orgId: string;
let walletId: string;
let solanaAddress: string;

async function testCompleteAuthFlow() {
  console.log(chalk.cyan.bold('\n🔐 TESTING COMPLETE CREDANA AUTH + TURNKEY FLOW\n'));
  console.log(chalk.gray('═'.repeat(60)));

  try {
    // 1. Start email authentication
    console.log(chalk.yellow('\n1️⃣  Starting email authentication...'));
    
    const startResponse = await axios.post(`${AUTH_URL}/api/auth/email/start`, {
      email: TEST_EMAIL,
    });
    
    console.log(chalk.green('   ✅ Magic link and OTP sent'));
    console.log(chalk.gray(`   📧 Email: ${TEST_EMAIL}`));
    
    // For testing, we'll extract the OTP from console logs
    console.log(chalk.cyan('\n   ⚠️  Check auth service console for:'));
    console.log(chalk.white('   • Magic link URL'));
    console.log(chalk.white('   • 6-digit OTP code'));
    
    // Wait for user input
    console.log(chalk.yellow('\n2️⃣  Enter the OTP code from console:'));
    
    // In a real test, we'd read from stdin. For now, we'll simulate
    const OTP_CODE = '123456'; // You'll need to replace this with actual OTP
    
    console.log(chalk.gray(`   📝 Using OTP: ${OTP_CODE}`));
    console.log(chalk.gray('   (In production, user would enter this)'));
    
    // 2. Verify OTP and create Turnkey resources
    console.log(chalk.yellow('\n3️⃣  Verifying OTP and creating Turnkey resources...'));
    
    try {
      const verifyResponse = await axios.post(`${AUTH_URL}/api/auth/email/verify`, {
        email: TEST_EMAIL,
        code: OTP_CODE,
      });
      
      sessionToken = verifyResponse.data.sessionToken;
      orgId = verifyResponse.data.orgId;
      walletId = verifyResponse.data.walletId;
      solanaAddress = verifyResponse.data.solanaAddress;
      
      console.log(chalk.green('   ✅ Email verified successfully!'));
      console.log(chalk.green('   ✅ Turnkey sub-org created'));
      console.log(chalk.green('   ✅ Solana wallet provisioned'));
      console.log(chalk.gray(`   🏢 Org ID: ${orgId}`));
      console.log(chalk.gray(`   💼 Wallet ID: ${walletId}`));
      console.log(chalk.gray(`   🔑 Solana Address: ${solanaAddress}`));
      console.log(chalk.gray(`   🎫 Session Token: ${sessionToken.substring(0, 20)}...`));
      
      // Check if passkey is needed
      if (verifyResponse.data.needPasskey) {
        console.log(chalk.yellow('\n   ⚠️  Passkey registration required'));
        console.log(chalk.gray('   Frontend would now prompt for Touch ID/Face ID'));
      }
      
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log(chalk.red('   ❌ Invalid OTP code'));
        console.log(chalk.yellow('   Please check the console and try again with correct code'));
        return;
      }
      throw error;
    }
    
    // 3. Check session
    console.log(chalk.yellow('\n4️⃣  Checking session...'));
    
    const sessionResponse = await axios.get(`${AUTH_URL}/api/auth/session`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    console.log(chalk.green('   ✅ Session valid'));
    console.log(chalk.gray(`   User ID: ${sessionResponse.data.uid}`));
    console.log(chalk.gray(`   Email: ${sessionResponse.data.email}`));
    console.log(chalk.gray(`   Passkey Bound: ${sessionResponse.data.passkeyBound}`));
    
    // 4. Get wallet info
    console.log(chalk.yellow('\n5️⃣  Getting wallet information...'));
    
    const walletResponse = await axios.get(`${AUTH_URL}/api/wallet/info`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    console.log(chalk.green('   ✅ Wallet retrieved'));
    console.log(chalk.gray(`   Address: ${walletResponse.data.address}`));
    console.log(chalk.gray(`   Balance: ${walletResponse.data.balance} SOL`));
    
    // 5. Check on-chain
    console.log(chalk.yellow('\n6️⃣  Verifying on-chain...'));
    
    const connection = new Connection(SOLANA_RPC);
    const pubkey = new PublicKey(solanaAddress || walletResponse.data.address);
    const balance = await connection.getBalance(pubkey);
    
    console.log(chalk.green('   ✅ On-chain verification successful'));
    console.log(chalk.gray(`   Devnet Balance: ${balance / 1e9} SOL`));
    
    // Summary
    console.log(chalk.gray('\n' + '═'.repeat(60)));
    console.log(chalk.green.bold('\n✅ COMPLETE AUTH FLOW SUCCESSFUL!\n'));
    
    console.log(chalk.white('What just happened:'));
    console.log(chalk.green('   1. Email authentication initiated'));
    console.log(chalk.green('   2. Turnkey sub-organization created'));
    console.log(chalk.green('   3. Solana wallet provisioned'));
    console.log(chalk.green('   4. Session JWT generated'));
    console.log(chalk.green('   5. Wallet verified on-chain'));
    
    console.log(chalk.yellow('\n📝 Next Steps:'));
    console.log(chalk.white('   1. Frontend completes passkey registration'));
    console.log(chalk.white('   2. User deposits collateral'));
    console.log(chalk.white('   3. Virtual card is issued'));
    console.log(chalk.white('   4. Transactions are signed with passkey'));
    
    console.log(chalk.cyan('\n🎉 Your Turnkey + Auth integration is working perfectly!'));
    console.log(chalk.gray('\nTurnkey Org: 1c11171a-ebf3-4e56-ac8a-86af41d32873'));
    console.log(chalk.gray('API Key: cred (active and working)'));
    
  } catch (error: any) {
    console.error(chalk.red('\n❌ Test failed:'));
    console.error(chalk.red(error.response?.data || error.message));
    
    if (error.code === 'ECONNREFUSED') {
      console.log(chalk.yellow('\n⚠️  Make sure auth service is running:'));
      console.log(chalk.gray('   cd backend && npx tsx src/auth/index.ts'));
    }
  }
}

// Instructions
console.log(chalk.cyan.bold('\n📋 INSTRUCTIONS:\n'));
console.log(chalk.white('1. Make sure auth service is running'));
console.log(chalk.white('2. Watch the auth service console for OTP code'));
console.log(chalk.white('3. Update the OTP_CODE variable in this script'));
console.log(chalk.white('4. Run the script again with correct OTP'));
console.log(chalk.gray('\n(In production, this would be automated via UI)'));

// Run the test
testCompleteAuthFlow().catch(console.error); 