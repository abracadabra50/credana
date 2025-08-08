#!/usr/bin/env npx tsx

/**
 * Initialize the Credana protocol configuration
 * This must be run once before any positions can be created
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { createHash } from 'crypto';
import fs from 'fs';
import BN from 'bn.js';

const PROGRAM_ID = new PublicKey('BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4');

// Token addresses on devnet
const TOKENS = {
  JITO_SOL: new PublicKey('7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn'),
  USDC: new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
  WSOL: new PublicKey('So11111111111111111111111111111111111111112'),
};

async function initializeProtocol() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load admin keypair
  const adminKeypairPath = '/Users/zishan/.config/solana/id.json';
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8')))
  );
  
  console.log('🔐 Initializing Protocol');
  console.log('👤 Admin:', adminKeypair.publicKey.toBase58());
  
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log('💰 Balance:', (balance / 1e9).toFixed(4), 'SOL\n');
  
  // Derive PDAs
  const [configPDA, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_authority')],
    PROGRAM_ID
  );
  
  const [treasuryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    PROGRAM_ID
  );
  
  const [insuranceFundPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('insurance_fund')],
    PROGRAM_ID
  );
  
  // Check if config already exists and is initialized
  const configInfo = await connection.getAccountInfo(configPDA);
  if (configInfo && configInfo.data.length > 0) {
    console.log('⚠️  Config account already exists');
    console.log('📍 Config PDA:', configPDA.toBase58());
    console.log('📊 Data length:', configInfo.data.length, 'bytes');
    
    // Check if it's properly initialized by looking for the discriminator
    const discriminator = configInfo.data.slice(0, 8);
    console.log('🔢 Discriminator:', discriminator.toString('hex'));
    
    // If it has data, it might be initialized
    if (configInfo.data.length >= 100) {
      console.log('✅ Config appears to be initialized already!');
      return configPDA;
    }
  }
  
  console.log('📝 Creating new config...');
  console.log('📍 Config PDA:', configPDA.toBase58());
  console.log('🏦 Vault Authority:', vaultAuthorityPDA.toBase58());
  console.log('💎 Treasury:', treasuryPDA.toBase58());
  console.log('🛡️ Insurance Fund:', insuranceFundPDA.toBase58());
  
  // Create vaults for USDC and JitoSOL
  const usdcVault = await getAssociatedTokenAddress(
    TOKENS.USDC,
    vaultAuthorityPDA,
    true // allowOwnerOffCurve
  );
  
  const jitoSolVault = await getAssociatedTokenAddress(
    TOKENS.JITO_SOL,
    vaultAuthorityPDA,
    true
  );
  
  console.log('\n🏦 Vault Addresses:');
  console.log('   USDC Vault:', usdcVault.toBase58());
  console.log('   JitoSOL Vault:', jitoSolVault.toBase58());
  
  // Create the instruction discriminator for 'initialize'
  const discriminator = createHash('sha256')
    .update('global:initialize')
    .digest()
    .slice(0, 8);
  
  console.log('\n🔢 Instruction Discriminator:', discriminator.toString('hex'));
  
  // Create mock oracle addresses (in production, use real Pyth oracles)
  const solOracle = Keypair.generate().publicKey;
  const jitoSolOracle = Keypair.generate().publicKey;
  
  // Prepare initialization parameters
  const params = Buffer.concat([
    // ltv_max_bps (u16) - 6000 = 60% LTV
    Buffer.from(new Uint16Array([6000]).buffer),
    // liquidation_threshold_bps (u16) - 7500 = 75%
    Buffer.from(new Uint16Array([7500]).buffer),
    // liquidation_bonus_bps (u16) - 500 = 5% bonus
    Buffer.from(new Uint16Array([500]).buffer),
    // interest_rate_bps (u16) - 500 = 5% APR
    Buffer.from(new Uint16Array([500]).buffer),
    // sol_usd_oracle (32 bytes)
    solOracle.toBuffer(),
    // jito_sol_usd_oracle (32 bytes)
    jitoSolOracle.toBuffer(),
    // usdc_mint (32 bytes)
    TOKENS.USDC.toBuffer(),
    // jito_sol_mint (32 bytes)
    TOKENS.JITO_SOL.toBuffer(),
  ]);
  
  const instructionData = Buffer.concat([discriminator, params]);
  
  // Build the instruction - config must come first, then admin, then system program
  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData
  });
  
  // Create transaction with just the initialize instruction
  const tx = new Transaction().add(initIx);
  
  const latestBlockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.feePayer = adminKeypair.publicKey;
  
  // Sign the transaction
  tx.sign(adminKeypair);
  
  try {
    console.log('\n📤 Sending transaction...');
    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('📝 Signature:', sig);
    
    console.log('⏳ Confirming...');
    await connection.confirmTransaction(sig);
    
    console.log('\n✅ Protocol initialized successfully!');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    
    console.log('\n📊 Protocol Configuration:');
    console.log('   Interest Rate: 5% APR');
    console.log('   Max LTV: 60%');
    console.log('   Liquidation Threshold: 75%');
    console.log('   Liquidation Bonus: 5%');
    console.log('   Protocol Fee: 0.5%');
    
    return configPDA;
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
initializeProtocol()
  .then((pda) => {
    console.log('\n🎉 Done! Config PDA:', pda.toBase58());
    console.log('\n💡 Next steps:');
    console.log('   1. Users can now initialize positions');
    console.log('   2. Whitelist tokens for collateral');
    console.log('   3. Start processing transactions!');
  })
  .catch((err) => {
    console.error('\n💥 Failed to initialize protocol:', err);
    process.exit(1);
  }); 