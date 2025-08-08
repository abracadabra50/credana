#!/usr/bin/env npx tsx

/**
 * Deposit collateral (SOL) into user position
 * This transfers SOL from the user to the program vault
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
  createSyncNativeInstruction,
  NATIVE_MINT
} from '@solana/spl-token';
import { createHash } from 'crypto';
import fs from 'fs';
import BN from 'bn.js';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

// Amount of SOL to deposit
const DEPOSIT_AMOUNT_SOL = 5; // 5 SOL

async function depositCollateral() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load the user's keypair
  const keypairPath = '/Users/zishan/.config/solana/id.json';
  const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log('💰 Depositing Collateral');
  console.log('👤 User:', userKeypair.publicKey.toBase58());
  
  // Check balance
  const balance = await connection.getBalance(userKeypair.publicKey);
  console.log('💵 Balance:', (balance / 1e9).toFixed(4), 'SOL');
  console.log('📥 Depositing:', DEPOSIT_AMOUNT_SOL, 'SOL\n');
  
  if (balance < DEPOSIT_AMOUNT_SOL * LAMPORTS_PER_SOL) {
    throw new Error('Insufficient SOL balance');
  }
  
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
  
  // For SOL, we use wrapped SOL (WSOL)
  const userWsolAccount = await getAssociatedTokenAddress(
    NATIVE_MINT,
    userKeypair.publicKey
  );
  
  const vaultWsolAccount = await getAssociatedTokenAddress(
    NATIVE_MINT,
    vaultAuthorityPDA,
    true // allowOwnerOffCurve
  );
  
  console.log('📍 Position PDA:', userPositionPDA.toBase58());
  console.log('🏦 Vault Authority:', vaultAuthorityPDA.toBase58());
  console.log('💳 User WSOL Account:', userWsolAccount.toBase58());
  console.log('🏦 Vault WSOL Account:', vaultWsolAccount.toBase58());
  
  // Check if position exists
  const positionInfo = await connection.getAccountInfo(userPositionPDA);
  if (!positionInfo) {
    throw new Error('Position not initialized. Run init-position.ts first!');
  }
  
  // Create the instruction discriminator for 'deposit_collateral'
  const discriminator = createHash('sha256')
    .update('global:deposit_collateral')
    .digest()
    .slice(0, 8);
  
  console.log('\n🔢 Discriminator:', discriminator.toString('hex'));
  
  // Prepare amount as u64 (8 bytes, little-endian)
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(DEPOSIT_AMOUNT_SOL * LAMPORTS_PER_SOL));
  
  const instructionData = Buffer.concat([discriminator, amountBuffer]);
  
  // Build transaction
  const tx = new Transaction();
  
  // 1. Create user's WSOL account if it doesn't exist
  const userWsolInfo = await connection.getAccountInfo(userWsolAccount);
  if (!userWsolInfo) {
    console.log('Creating user WSOL account...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        userWsolAccount,
        userKeypair.publicKey,
        NATIVE_MINT
      )
    );
  }
  
  // 2. Transfer SOL to the WSOL account
  tx.add(
    SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: userWsolAccount,
      lamports: DEPOSIT_AMOUNT_SOL * LAMPORTS_PER_SOL
    })
  );
  
  // 3. Sync the native account to update its balance
  tx.add(createSyncNativeInstruction(userWsolAccount));
  
  // 4. Create vault's WSOL account if it doesn't exist
  const vaultWsolInfo = await connection.getAccountInfo(vaultWsolAccount);
  if (!vaultWsolInfo) {
    console.log('Creating vault WSOL account...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        userKeypair.publicKey,
        vaultWsolAccount,
        vaultAuthorityPDA,
        NATIVE_MINT
      )
    );
  }
  
  // 5. Deposit collateral instruction
  const depositIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: userPositionPDA, isSigner: false, isWritable: true },
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: userWsolAccount, isSigner: false, isWritable: true },
      { pubkey: vaultWsolAccount, isSigner: false, isWritable: true },
      { pubkey: vaultAuthorityPDA, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: instructionData
  });
  
  tx.add(depositIx);
  
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = userKeypair.publicKey;
  
  // Sign the transaction
  tx.sign(userKeypair);
  
  try {
    console.log('\n📤 Sending transaction...');
    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('📝 Signature:', sig);
    
    console.log('⏳ Confirming...');
    await connection.confirmTransaction(sig);
    
    console.log('\n✅ Collateral deposited successfully!');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    // Fetch updated position
    const updatedPositionData = await connection.getAccountInfo(userPositionPDA);
    if (updatedPositionData) {
      // Parse collateral amount (assuming it's at offset 40, 8 bytes)
      const collateralAmount = updatedPositionData.data.readBigUInt64LE(40);
      console.log('\n📊 Updated Position:');
      console.log('   Collateral:', Number(collateralAmount) / LAMPORTS_PER_SOL, 'SOL');
      
      // Calculate available credit (60% LTV)
      const solPrice = 150; // Mock price
      const collateralValue = (Number(collateralAmount) / LAMPORTS_PER_SOL) * solPrice;
      const availableCredit = collateralValue * 0.6;
      
      console.log('   Collateral Value: $' + collateralValue.toFixed(2));
      console.log('   Available Credit: $' + availableCredit.toFixed(2));
    }
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.log('\n📋 Transaction logs:');
      error.logs.forEach((log: string) => console.log('   ', log));
    }
    throw error;
  }
}

// Run the deposit
depositCollateral()
  .then(() => {
    console.log('\n🎉 Done! You can now use your credit card!');
  })
  .catch((err) => {
    console.error('\n💥 Failed to deposit collateral:', err);
    process.exit(1);
  }); 