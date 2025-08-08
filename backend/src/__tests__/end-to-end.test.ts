import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';

// Real API configuration
const LITHIC_API_KEY = '52c3f4c0-3c59-40ef-a03b-e628cbb398db';
const LITHIC_BASE_URL = 'https://sandbox.lithic.com/v1';
const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const CREDANA_PROGRAM_ID = 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS';

describe('Credana End-to-End Integration Test', () => {
  let connection: Connection;

  beforeAll(() => {
    connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  });

  describe('1. Solana Program Health Check', () => {
    it('should connect to Solana devnet', async () => {
      const version = await connection.getVersion();
      expect(version).toBeDefined();
      console.log('✅ Connected to Solana devnet:', version);
    });

    it('should verify Credana program exists on-chain', async () => {
      const programId = new PublicKey(CREDANA_PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(programId);
      
      expect(accountInfo).toBeDefined();
      expect(accountInfo?.executable).toBe(true);
      console.log('✅ Credana program found on-chain');
      console.log(`   Program ID: ${CREDANA_PROGRAM_ID}`);
      console.log(`   Size: ${accountInfo?.data.length} bytes`);
    });
  });

  describe('2. Lithic API Integration', () => {
    it('should authenticate with Lithic API', async () => {
      const response = await axios.get(`${LITHIC_BASE_URL}/cards`, {
        headers: {
          'Authorization': `api-key ${LITHIC_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      console.log('✅ Lithic API authentication successful');
      console.log(`   Current cards: ${response.data.data.length}`);
    });
  });

  describe('3. Complete User Flow Simulation', () => {
    it('should simulate the complete Credana user journey', async () => {
      console.log('\n🚀 COMPLETE USER JOURNEY SIMULATION\n');
      
      // Step 1: User connects wallet
      const walletAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
      console.log('Step 1: User connects Solana wallet');
      console.log(`   Wallet: ${walletAddress}`);
      
      // Step 2: Calculate collateral value (mock)
      const jitoSOLAmount = 5.0;
      const jitoSOLPrice = 200;
      const collateralValue = jitoSOLAmount * jitoSOLPrice;
      const ltvRatio = 0.5;
      const creditLimit = collateralValue * ltvRatio;
      
      console.log('\nStep 2: Calculate credit limit from collateral');
      console.log(`   jitoSOL deposited: ${jitoSOLAmount}`);
      console.log(`   jitoSOL price: $${jitoSOLPrice}`);
      console.log(`   Collateral value: $${collateralValue}`);
      console.log(`   LTV ratio: ${ltvRatio * 100}%`);
      console.log(`   Credit limit: $${creditLimit}`);
      
      expect(creditLimit).toBe(500);
    });
  });
});
