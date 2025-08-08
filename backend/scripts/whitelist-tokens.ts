#!/usr/bin/env npx tsx

/**
 * Whitelist tokens for use as collateral
 * Admin function to enable different SPL tokens
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

// Token configurations
const TOKENS_TO_WHITELIST = [
  {
    name: 'Wrapped SOL',
    symbol: 'WSOL',
    mint: 'So11111111111111111111111111111111111111112',
    ltv: 60, // 60% LTV
    liquidationThreshold: 75,
    liquidationBonus: 5,
    category: 'Native'
  },
  {
    name: 'JitoSOL',
    symbol: 'JitoSOL',
    mint: '7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn',
    ltv: 65, // 65% LTV (liquid staking)
    liquidationThreshold: 80,
    liquidationBonus: 5,
    category: 'Liquid Staking'
  },
  {
    name: 'USDC',
    symbol: 'USDC',
    mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    ltv: 90, // 90% LTV (stablecoin)
    liquidationThreshold: 95,
    liquidationBonus: 2,
    category: 'Stablecoin'
  },
  {
    name: 'BONK',
    symbol: 'BONK',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // Devnet BONK
    ltv: 40, // 40% LTV (memecoin)
    liquidationThreshold: 50,
    liquidationBonus: 10,
    category: 'Memecoin'
  },
  {
    name: 'WIF',
    symbol: 'WIF',
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', // Devnet WIF
    ltv: 40, // 40% LTV (memecoin)
    liquidationThreshold: 50,
    liquidationBonus: 10,
    category: 'Memecoin'
  },
  {
    name: 'FWOG',
    symbol: 'FWOG',
    mint: 'A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump', // Example FWOG
    ltv: 35, // 35% LTV (high-risk memecoin)
    liquidationThreshold: 45,
    liquidationBonus: 12,
    category: 'Memecoin'
  }
];

async function whitelistTokens() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Load admin keypair
  const adminKeypairPath = '/Users/zishan/.config/solana/id.json';
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8')))
  );
  
  console.log('🎯 Token Whitelisting');
  console.log('👤 Admin:', adminKeypair.publicKey.toBase58());
  console.log('');
  
  // Derive config PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
  );
  
  console.log('📊 Tokens to Whitelist:');
  console.log('═══════════════════════════════════════════════════════════════');
  
  for (const token of TOKENS_TO_WHITELIST) {
    console.log(`\n📌 ${token.name} (${token.symbol})`);
    console.log(`   Category: ${token.category}`);
    console.log(`   Mint: ${token.mint.slice(0, 8)}...`);
    console.log(`   LTV: ${token.ltv}%`);
    console.log(`   Liquidation: ${token.liquidationThreshold}% (${token.liquidationBonus}% bonus)`);
    
    // Derive whitelist PDA for this token
    const mintPubkey = new PublicKey(token.mint);
    const [whitelistPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('whitelist'), mintPubkey.toBuffer()],
      PROGRAM_ID
    );
    
    // Check if already whitelisted
    const whitelistInfo = await connection.getAccountInfo(whitelistPDA);
    if (whitelistInfo) {
      console.log(`   ✅ Already whitelisted`);
      continue;
    }
    
    // Create whitelist instruction
    const discriminator = createHash('sha256')
      .update('global:whitelist_token')
      .digest()
      .slice(0, 8);
    
    // Pack parameters
    const params = Buffer.concat([
      // ltv_bps (u16)
      Buffer.from(new Uint16Array([token.ltv * 100]).buffer),
      // liquidation_threshold_bps (u16)
      Buffer.from(new Uint16Array([token.liquidationThreshold * 100]).buffer),
      // liquidation_bonus_bps (u16)
      Buffer.from(new Uint16Array([token.liquidationBonus * 100]).buffer),
      // max_deposit (u64) - no limit for now
      Buffer.from(new BigUint64Array([BigInt(1000000000000000)]).buffer),
      // enabled (bool)
      Buffer.from([1]),
    ]);
    
    const instructionData = Buffer.concat([discriminator, params]);
    
    const whitelistIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: whitelistPDA, isSigner: false, isWritable: true },
        { pubkey: configPDA, isSigner: false, isWritable: false },
        { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
      ],
      data: instructionData
    });
    
    const tx = new Transaction().add(whitelistIx);
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = adminKeypair.publicKey;
    tx.sign(adminKeypair);
    
    try {
      console.log(`   📤 Whitelisting...`);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig);
      console.log(`   ✅ Whitelisted! Tx: ${sig.slice(0, 8)}...`);
    } catch (error: any) {
      console.log(`   ⚠️  Failed:`, error.message);
      // Continue with next token
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ Whitelisting complete!\n');
  
  // Display summary
  console.log('📊 Collateral Risk Tiers:');
  console.log('   🟢 Stablecoins (USDC): 90% LTV');
  console.log('   🔵 Liquid Staking (JitoSOL): 65% LTV');
  console.log('   🟡 Native (SOL): 60% LTV');
  console.log('   🔴 Memecoins (BONK, WIF, FWOG): 35-40% LTV');
  
  console.log('\n💡 Users can now:');
  console.log('   1. Deposit any whitelisted token as collateral');
  console.log('   2. Get risk-adjusted credit based on token type');
  console.log('   3. Mix multiple collateral types in one position');
}

// Run the whitelisting
whitelistTokens()
  .then(() => {
    console.log('\n🎉 Token whitelisting complete!');
    console.log('🚀 The protocol now supports multiple collateral types');
  })
  .catch((err) => {
    console.error('\n💥 Error:', err);
    process.exit(1);
  }); 