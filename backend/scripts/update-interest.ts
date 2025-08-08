#!/usr/bin/env npx tsx

/**
 * Update interest rates and check accrued debt
 * This demonstrates how interest accumulates over time
 */

import { 
  Connection, 
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { createHash } from 'crypto';
import fs from 'fs';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

// RAY precision for interest calculations (10^27)
const RAY = BigInt('1000000000000000000000000000');

async function checkInterest() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair
  const keypairPath = '/Users/zishan/.config/solana/id.json';
  const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log('💰 Interest Accrual Check');
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
  
  // Fetch config data
  const configInfo = await connection.getAccountInfo(configPDA);
  if (!configInfo) {
    throw new Error('Config not initialized');
  }
  
  // Parse config data (simplified structure)
  // Offset 8: discriminator
  // Offset 8-40: admin
  // Offset 40: paused (bool)
  // Offset 41-43: ltv_max_bps (u16)
  // Offset 43-45: liquidation_threshold_bps (u16)
  // Offset 45-47: liquidation_bonus_bps (u16)
  // Offset 47-49: interest_rate_bps (u16)
  // ... oracles and mints ...
  // Offset 177-209: global_borrow_index (u128)
  // Offset 209-217: last_update_timestamp (i64)
  
  const interestRateBps = configInfo.data.readUInt16LE(47);
  // Read u128 as two u64s (little-endian)
  const indexLow = configInfo.data.readBigUInt64LE(177);
  const indexHigh = configInfo.data.readBigUInt64LE(185);
  const globalBorrowIndex = indexLow + (indexHigh << 64n);
  const lastUpdateTimestamp = configInfo.data.readBigInt64LE(209);
  
  console.log('📊 Protocol Status:');
  console.log('   Interest Rate:', (interestRateBps / 100).toFixed(2) + '% APR');
  console.log('   Global Borrow Index:', globalBorrowIndex.toString());
  console.log('   Last Update:', new Date(Number(lastUpdateTimestamp) * 1000).toLocaleString());
  
  // Fetch user position
  const positionInfo = await connection.getAccountInfo(userPositionPDA);
  if (!positionInfo) {
    console.log('\n❌ No position found');
    return;
  }
  
  // Parse position data
  // Offset 72-80: collateral_amount (u64)
  // Offset 80-88: debt_usdc (u64)
  // Offset 88-120: borrow_index_snapshot (u128)
  // Offset 120-128: last_update (i64)
  
  const debtUsdc = positionInfo.data.readBigUInt64LE(80);
  // Read u128 as two u64s
  const snapLow = positionInfo.data.readBigUInt64LE(88);
  const snapHigh = positionInfo.data.readBigUInt64LE(96);
  const borrowIndexSnapshot = snapLow + (snapHigh << 64n);
  const lastUserUpdate = positionInfo.data.readBigInt64LE(120);
  
  console.log('\n📈 User Position:');
  console.log('   Base Debt:', Number(debtUsdc) / 1e6, 'USDC');
  console.log('   Borrow Index Snapshot:', borrowIndexSnapshot.toString());
  console.log('   Last Update:', new Date(Number(lastUserUpdate) * 1000).toLocaleString());
  
  // Calculate accrued interest
  if (debtUsdc > 0n && globalBorrowIndex > borrowIndexSnapshot) {
    const indexRatio = (globalBorrowIndex * RAY) / borrowIndexSnapshot;
    const accruedDebt = (debtUsdc * indexRatio) / RAY;
    const interestAccrued = accruedDebt - debtUsdc;
    
    console.log('\n💸 Interest Accrued:');
    console.log('   Original Debt:', Number(debtUsdc) / 1e6, 'USDC');
    console.log('   Interest Accrued:', Number(interestAccrued) / 1e6, 'USDC');
    console.log('   Total Debt Now:', Number(accruedDebt) / 1e6, 'USDC');
    console.log('   Effective Rate:', ((Number(interestAccrued) / Number(debtUsdc)) * 100).toFixed(4) + '%');
  } else if (debtUsdc === 0n) {
    console.log('\n✅ No debt - no interest!');
  } else {
    console.log('\n⏰ Interest up to date');
  }
  
  // Simulate time passing to show how interest would accrue
  const currentTime = Math.floor(Date.now() / 1000);
  const timeSinceUpdate = currentTime - Number(lastUpdateTimestamp);
  
  if (timeSinceUpdate > 0 && debtUsdc > 0n) {
    // Calculate what the new index would be
    const secondsPerYear = 365 * 24 * 60 * 60;
    const ratePerSecond = (BigInt(interestRateBps) * RAY) / (BigInt(10000) * BigInt(secondsPerYear));
    const timeElapsed = BigInt(timeSinceUpdate);
    const newIndex = globalBorrowIndex + (globalBorrowIndex * ratePerSecond * timeElapsed) / RAY;
    
    const futureIndexRatio = (newIndex * RAY) / borrowIndexSnapshot;
    const futureDebt = (debtUsdc * futureIndexRatio) / RAY;
    const futureInterest = futureDebt - debtUsdc;
    
    console.log('\n🔮 Projected Interest (if updated now):');
    console.log('   Time Since Update:', Math.floor(timeSinceUpdate / 60), 'minutes');
    console.log('   Projected New Index:', newIndex.toString());
    console.log('   Projected Interest:', Number(futureInterest) / 1e6, 'USDC');
    console.log('   Projected Total Debt:', Number(futureDebt) / 1e6, 'USDC');
  }
}

// Function to trigger an interest update (admin only)
async function triggerInterestUpdate() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // This would need admin keypair
  const adminKeypairPath = '/Users/zishan/.config/solana/id.json';
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8')))
  );
  
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  // Create update interest instruction
  const discriminator = createHash('sha256')
    .update('global:update_interest')
    .digest()
    .slice(0, 8);
  
  const updateIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data: discriminator
  });
  
  const tx = new Transaction().add(updateIx);
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = adminKeypair.publicKey;
  tx.sign(adminKeypair);
  
  try {
    console.log('\n🔄 Triggering interest update...');
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig);
    console.log('✅ Interest updated!');
    console.log('🔗 Transaction:', sig);
  } catch (error: any) {
    console.log('⚠️  Update failed (may not be needed or not admin):', error.message);
  }
}

// Run the check
checkInterest()
  .then(async () => {
    console.log('\n💡 Interest accrues automatically when:');
    console.log('   - Users borrow (record debt)');
    console.log('   - Users repay');
    console.log('   - Liquidations occur');
    console.log('   - Admin triggers update');
    
    // Optionally trigger an update
    // await triggerInterestUpdate();
  })
  .catch((err) => {
    console.error('\n💥 Error:', err);
    process.exit(1);
  }); 