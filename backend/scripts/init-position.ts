#!/usr/bin/env npx tsx

/**
 * Initialize a user position on-chain
 * This creates the PDA account to track collateral and debt
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY 
} from '@solana/web3.js';
import { createHash } from 'crypto';
import fs from 'fs';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

async function initializePosition() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load the user's keypair
  const keypairPath = '/Users/zishan/.config/solana/id.json';
  const userKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')))
  );
  
  console.log('🔐 Initializing Position for Wallet:', userKeypair.publicKey.toBase58());
  
  // Check balance
  const balance = await connection.getBalance(userKeypair.publicKey);
  console.log('💰 Balance:', (balance / 1e9).toFixed(4), 'SOL\n');
  
  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  const [userPositionPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), userKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  // Check if position already exists
  const positionInfo = await connection.getAccountInfo(userPositionPDA);
  if (positionInfo) {
    console.log('✅ Position already exists!');
    console.log('📍 Position PDA:', userPositionPDA.toBase58());
    console.log('📊 Data length:', positionInfo.data.length, 'bytes');
    
    // Try to parse some basic info
    if (positionInfo.data.length >= 40) {
      const owner = new PublicKey(positionInfo.data.slice(8, 40));
      console.log('👤 Owner:', owner.toBase58());
    }
    
    return userPositionPDA;
  }
  
  console.log('📝 Creating new position...');
  console.log('📍 Position PDA:', userPositionPDA.toBase58());
  console.log('⚙️  Config PDA:', configPDA.toBase58());
  
  // Create the instruction discriminator for 'init_position'
  // Anchor uses the first 8 bytes of SHA256 hash of "global:init_position"
  const discriminator = createHash('sha256')
    .update('global:init_position')
    .digest()
    .slice(0, 8);
  
  console.log('🔢 Discriminator:', discriminator.toString('hex'));
  
  // Build the instruction - position, config, owner, system program (no clock needed)
  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: userPositionPDA, isSigner: false, isWritable: true },
      { pubkey: configPDA, isSigner: false, isWritable: false },
      { pubkey: userKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator
  });
  
  // Create and send transaction
  const tx = new Transaction().add(initIx);
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
    
    console.log('\n✅ Position initialized successfully!');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    return userPositionPDA;
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.log('\n📋 Transaction logs:');
      error.logs.forEach((log: string) => console.log('   ', log));
    }
    throw error;
  }
}

// Run the initialization
initializePosition()
  .then((pda) => {
    console.log('\n🎉 Done! Your position PDA:', pda.toBase58());
    console.log('\n💡 Next steps:');
    console.log('   1. Deposit collateral (SOL, JitoSOL, etc.)');
    console.log('   2. Start using your credit card!');
  })
  .catch((err) => {
    console.error('\n💥 Failed to initialize position:', err);
    process.exit(1);
  }); 