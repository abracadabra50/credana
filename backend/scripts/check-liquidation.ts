#!/usr/bin/env npx tsx

/**
 * Check liquidation status and simulate liquidation scenarios
 * This demonstrates how the protocol handles underwater positions
 */

import { 
  Connection, 
  PublicKey,
  Keypair
} from '@solana/web3.js';
import fs from 'fs';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

// Mock price oracle
const MOCK_PRICES: Record<string, number> = {
  'SOL': 150,
  'JitoSOL': 155,
  'USDC': 1,
  'BONK': 0.00002,
  'WIF': 2.5,
  'FWOG': 0.15
};

async function checkLiquidation() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair
  const keypairPath = '/Users/zishan/.config/solana/id.json';
  const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log('🔍 Liquidation Check');
  console.log('👤 User:', userKeypair.publicKey.toBase58());
  console.log('');
  
  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  const [userPositionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), userKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  // Fetch config
  const configInfo = await connection.getAccountInfo(configPDA);
  if (!configInfo) {
    throw new Error('Config not initialized');
  }
  
  const liquidationThresholdBps = configInfo.data.readUInt16LE(43);
  const liquidationBonusBps = configInfo.data.readUInt16LE(45);
  
  console.log('📊 Protocol Settings:');
  console.log('   Liquidation Threshold:', (liquidationThresholdBps / 100) + '%');
  console.log('   Liquidation Bonus:', (liquidationBonusBps / 100) + '%\n');
  
  // Fetch position
  const positionInfo = await connection.getAccountInfo(userPositionPDA);
  if (!positionInfo) {
    console.log('❌ No position found');
    return;
  }
  
  // Parse position
  const collateralAmount = positionInfo.data.readBigUInt64LE(72);
  const debtUsdc = positionInfo.data.readBigUInt64LE(80);
  
  // Get wallet balance as additional collateral
  const walletBalance = await connection.getBalance(userKeypair.publicKey);
  const totalCollateralLamports = Number(collateralAmount) + walletBalance;
  const totalCollateralSol = totalCollateralLamports / 1e9;
  
  const collateralValue = totalCollateralSol * MOCK_PRICES['SOL'];
  const debtValue = Number(debtUsdc) / 1e6;
  
  console.log('💰 Position Status:');
  console.log('   Collateral:', totalCollateralSol.toFixed(4), 'SOL');
  console.log('   Collateral Value: $' + collateralValue.toFixed(2));
  console.log('   Debt: $' + debtValue.toFixed(2));
  
  // Calculate health factor
  let healthFactor = 999;
  if (debtValue > 0) {
    const liquidationValue = collateralValue * (liquidationThresholdBps / 10000);
    healthFactor = liquidationValue / debtValue;
  }
  
  console.log('\n🏥 Health Factor:', healthFactor.toFixed(2));
  
  if (healthFactor >= 1) {
    console.log('   ✅ Position is healthy');
    console.log('   Safe margin: $' + ((healthFactor - 1) * debtValue).toFixed(2));
  } else {
    console.log('   ⚠️  POSITION AT RISK OF LIQUIDATION!');
    console.log('   Underwater by: $' + ((1 - healthFactor) * debtValue).toFixed(2));
  }
  
  // Simulate different scenarios
  console.log('\n📉 Liquidation Scenarios:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Scenario 1: Price drops
  const priceDrops = [10, 20, 30, 40, 50];
  for (const drop of priceDrops) {
    const newPrice = MOCK_PRICES['SOL'] * (1 - drop / 100);
    const newCollateralValue = totalCollateralSol * newPrice;
    const newLiquidationValue = newCollateralValue * (liquidationThresholdBps / 10000);
    const newHealthFactor = debtValue > 0 ? newLiquidationValue / debtValue : 999;
    
    console.log(`\n📊 If SOL drops ${drop}% to $${newPrice.toFixed(2)}:`);
    console.log(`   Collateral Value: $${newCollateralValue.toFixed(2)}`);
    console.log(`   Health Factor: ${newHealthFactor.toFixed(2)}`);
    
    if (newHealthFactor < 1) {
      console.log(`   🚨 LIQUIDATION TRIGGERED!`);
      
      // Calculate liquidation details
      const maxRepay = debtValue * 0.5; // Can liquidate up to 50%
      const collateralToSeize = (maxRepay * (1 + liquidationBonusBps / 10000)) / newPrice;
      
      console.log(`   💸 Liquidator repays: $${maxRepay.toFixed(2)} USDC`);
      console.log(`   🏦 Liquidator receives: ${collateralToSeize.toFixed(4)} SOL`);
      console.log(`   💰 Liquidator profit: $${(collateralToSeize * newPrice - maxRepay).toFixed(2)}`);
    } else {
      console.log(`   ✅ Still healthy`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  
  // Jupiter integration info
  console.log('\n🚀 Jupiter-Based Liquidation (No Liquidators Needed!):');
  console.log('   When a position becomes unhealthy:');
  console.log('   1. Protocol automatically swaps collateral via Jupiter');
  console.log('   2. Gets best price across all Solana DEXs');
  console.log('   3. Repays debt directly');
  console.log('   4. Returns excess to user');
  console.log('\n   Execution strategies based on size:');
  console.log('   • < $10k: Instant swap');
  console.log('   • $10k-$100k: DCA over 1 hour');
  console.log('   • > $100k: TWAP over 4-24 hours');
  console.log('\n   Profit distribution:');
  console.log('   • 50% → Insurance Fund');
  console.log('   • 30% → Treasury');
  console.log('   • 20% → CRED buyback');
}

// Run the check
checkLiquidation()
  .then(() => {
    console.log('\n💡 Tips to avoid liquidation:');
    console.log('   1. Keep Health Factor above 1.5');
    console.log('   2. Add more collateral when prices drop');
    console.log('   3. Repay debt to improve health');
    console.log('   4. Use stablecoins for higher LTV');
  })
  .catch((err) => {
    console.error('\n💥 Error:', err);
    process.exit(1);
  }); 