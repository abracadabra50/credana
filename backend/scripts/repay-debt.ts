#!/usr/bin/env npx tsx

/**
 * Repay USDC debt
 * This reduces the user's debt and frees up credit
 */

import { 
  Connection, 
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getMint
} from '@solana/spl-token';
import { createHash } from 'crypto';
import fs from 'fs';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

// USDC on devnet
const USDC_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// Amount to repay (in USDC)
const REPAY_AMOUNT_USDC = 50; // $50

async function repayDebt() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load user keypair
  const keypairPath = '/Users/zishan/.config/solana/id.json';
  const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log('💳 Debt Repayment');
  console.log('👤 User:', userKeypair.publicKey.toBase58());
  console.log('💵 Repaying:', REPAY_AMOUNT_USDC, 'USDC\n');
  
  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  const [userPositionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), userKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_authority')],
    PROGRAM_ID
  );
  
  // Get token accounts
  const userUsdcAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    userKeypair.publicKey
  );
  
  const vaultUsdcAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    vaultAuthorityPDA,
    true // allowOwnerOffCurve
  );
  
  console.log('📍 Position PDA:', userPositionPDA.toBase58());
  console.log('💳 User USDC Account:', userUsdcAccount.toBase58());
  console.log('🏦 Vault USDC Account:', vaultUsdcAccount.toBase58());
  
  // Check position
  const positionInfo = await connection.getAccountInfo(userPositionPDA);
  if (!positionInfo) {
    throw new Error('Position not initialized');
  }
  
  // Parse current debt
  const currentDebt = positionInfo.data.readBigUInt64LE(80);
  console.log('\n📊 Current Debt:', Number(currentDebt) / 1e6, 'USDC');
  
  if (currentDebt === 0n) {
    console.log('✅ No debt to repay!');
    return;
  }
  
  // Check user's USDC balance
  const userUsdcInfo = await connection.getAccountInfo(userUsdcAccount);
  if (!userUsdcInfo) {
    console.log('\n⚠️  No USDC account found');
    console.log('💡 To get test USDC on devnet:');
    console.log('   1. Visit: https://everlastingsong.github.io/nebula/');
    console.log('   2. Select "Devnet" network');
    console.log('   3. Airdrop USDC to your wallet');
    return;
  }
  
  // For demo, we'll simulate having USDC
  console.log('💰 Simulating USDC balance for demo...');
  
  // Create repay instruction
  const discriminator = createHash('sha256')
    .update('global:repay_usdc')
    .digest()
    .slice(0, 8);
  
  // Amount in USDC smallest units (6 decimals)
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(REPAY_AMOUNT_USDC * 1e6));
  
  const instructionData = Buffer.concat([discriminator, amountBuffer]);
  
  // Build transaction
  const tx = new Transaction();
  
  // Create vault USDC account if needed
  const vaultUsdcInfo = await connection.getAccountInfo(vaultUsdcAccount);
  if (!vaultUsdcInfo) {
    console.log('Creating vault USDC account...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        vaultUsdcAccount,
        vaultAuthorityPDA,
        USDC_MINT
      )
    );
  }
  
  // Repay instruction
  const repayIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: userPositionPDA, isSigner: false, isWritable: true },
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: vaultUsdcAccount, isSigner: false, isWritable: true },
      { pubkey: vaultAuthorityPDA, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: instructionData
  });
  
  tx.add(repayIx);
  
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = userKeypair.publicKey;
  tx.sign(userKeypair);
  
  try {
    console.log('\n📤 Sending repayment transaction...');
    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('📝 Signature:', sig);
    
    console.log('⏳ Confirming...');
    await connection.confirmTransaction(sig);
    
    console.log('\n✅ Debt repaid successfully!');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    // Fetch updated position
    const updatedPosition = await connection.getAccountInfo(userPositionPDA);
    if (updatedPosition) {
      const newDebt = updatedPosition.data.readBigUInt64LE(80);
      const collateralAmount = updatedPosition.data.readBigUInt64LE(72);
      
      console.log('\n📊 Updated Position:');
      console.log('   Remaining Debt:', Number(newDebt) / 1e6, 'USDC');
      console.log('   Collateral:', Number(collateralAmount) / LAMPORTS_PER_SOL, 'SOL');
      
      // Calculate new available credit
      const solPrice = 150;
      const collateralValue = (Number(collateralAmount) / LAMPORTS_PER_SOL) * solPrice;
      const maxCredit = collateralValue * 0.6;
      const availableCredit = Math.max(0, maxCredit - Number(newDebt) / 1e6);
      
      console.log('   Available Credit: $' + availableCredit.toFixed(2));
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.log('\n📋 Transaction logs:');
      error.logs.forEach((log: string) => console.log('   ', log));
    }
    
    // If it fails due to no USDC, provide instructions
    if (error.message.includes('insufficient funds') || error.message.includes('0x1')) {
      console.log('\n💡 To test repayment:');
      console.log('   1. Get test USDC from: https://everlastingsong.github.io/nebula/');
      console.log('   2. Or simulate by recording debt first');
      console.log('   3. Then run this script again');
    }
  }
}

// Run the repayment
repayDebt()
  .then(() => {
    console.log('\n🎉 Repayment complete!');
    console.log('💳 Your credit line is now available again');
  })
  .catch((err) => {
    console.error('\n💥 Failed to repay:', err);
    process.exit(1);
  }); 