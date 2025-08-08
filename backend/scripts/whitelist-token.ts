#!/usr/bin/env npx tsx
/**
 * Admin script to whitelist tokens for use as collateral
 * 
 * Usage:
 *   npx tsx scripts/whitelist-token.ts <token_mint> <type> [options]
 * 
 * Examples:
 *   # Whitelist FWOG as memecoin
 *   npx tsx scripts/whitelist-token.ts A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump memecoin
 *   
 *   # Whitelist Meteora LP token
 *   npx tsx scripts/whitelist-token.ts <lp_mint> lp_volatile --pool <pool_address>
 *   
 *   # Whitelist JitoSOL with custom LTV
 *   npx tsx scripts/whitelist-token.ts J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn liquid_staking --ltv 70
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import * as fs from 'fs';
import { Command } from 'commander';

// Program constants
const PROGRAM_ID = new PublicKey('5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN');
const WHITELIST_SEED = Buffer.from('whitelist');

// Collateral types
const COLLATERAL_TYPES = {
  'native_sol': 0,
  'liquid_staking': 1,
  'stablecoin': 2,
  'blue_chip': 3,
  'memecoin': 4,
  'lp_stable': 5,
  'lp_volatile': 6,
  'lp_memecoin': 7,
  'kamino_vault': 8,
  'other': 9,
};

// Oracle types
const ORACLE_TYPES = {
  'pyth': 0,
  'switchboard': 1,
  'birdeye': 2,
};

// Known oracles
const KNOWN_ORACLES: Record<string, { type: number; address: string }> = {
  // SOL
  'So11111111111111111111111111111111111111112': {
    type: 0, // Pyth
    address: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  },
  // USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    type: 0, // Pyth
    address: 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
  },
  // JitoSOL
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': {
    type: 0, // Pyth
    address: '7yyaeuJ1GGtVBLT2z2xub5ZWYKaNhF28mj1RdV4VDFVk',
  },
  // mSOL
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    type: 0, // Pyth
    address: 'E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9',
  },
};

interface WhitelistParams {
  mint: PublicKey;
  collateralType: number;
  oracleType: number;
  oracle: PublicKey;
  decimals: number;
  maxDeposit: bigint;
  minDepositUsd: bigint;
  maxLtvOverride: number;
  lpPool?: PublicKey;
  lpTokenA?: PublicKey;
  lpTokenB?: PublicKey;
  lpProtocol?: number;
}

async function whitelistToken(params: WhitelistParams) {
  // Load admin keypair
  const adminKeypairPath = '/Users/zishan/.config/solana/id.json';
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8')))
  );

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  console.log('🔑 Admin:', adminKeypair.publicKey.toString());
  console.log('💎 Token Mint:', params.mint.toString());
  console.log('📊 Collateral Type:', Object.keys(COLLATERAL_TYPES)[params.collateralType]);

  // Derive whitelist PDA
  const [whitelistPDA] = PublicKey.findProgramAddressSync(
    [WHITELIST_SEED, params.mint.toBuffer()],
    PROGRAM_ID
  );

  console.log('📍 Whitelist PDA:', whitelistPDA.toString());

  // Check if already exists
  const existing = await connection.getAccountInfo(whitelistPDA);
  if (existing) {
    console.log('⚠️  Token already whitelisted. Update functionality not implemented yet.');
    return;
  }

  // Create whitelist instruction
  const instruction = await createWhitelistInstruction(
    adminKeypair.publicKey,
    whitelistPDA,
    params
  );

  // Create and send transaction
  const transaction = new Transaction().add(instruction);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminKeypair]
    );
    
    console.log('✅ Token whitelisted successfully!');
    console.log('📝 Transaction:', signature);
    console.log(`🔍 View: https://solscan.io/tx/${signature}?cluster=devnet`);
    
    // Display configuration
    console.log('\n📋 Whitelist Configuration:');
    console.log('  • Max LTV:', params.maxLtvOverride || 'Default for type');
    console.log('  • Min Deposit:', `$${Number(params.minDepositUsd) / 1e6}`);
    console.log('  • Max Deposit:', params.maxDeposit === 0n ? 'Unlimited' : params.maxDeposit.toString());
    
    if (params.lpPool) {
      console.log('\n🏊 LP Token Details:');
      console.log('  • Pool:', params.lpPool.toString());
      console.log('  • Token A:', params.lpTokenA?.toString() || 'N/A');
      console.log('  • Token B:', params.lpTokenB?.toString() || 'N/A');
      console.log('  • Protocol:', ['Raydium', 'Orca', 'Meteora', 'Kamino'][params.lpProtocol || 0]);
    }
  } catch (error) {
    console.error('❌ Failed to whitelist token:', error);
  }
}

async function createWhitelistInstruction(
  admin: PublicKey,
  whitelistPDA: PublicKey,
  params: WhitelistParams
): Promise<TransactionInstruction> {
  // Instruction discriminator for 'whitelist_token'
  const discriminator = Buffer.from([/* Add actual discriminator */]);
  
  // Serialize instruction data
  const data = Buffer.concat([
    discriminator,
    params.mint.toBuffer(),
    Buffer.from([params.collateralType]),
    Buffer.from([params.oracleType]),
    params.oracle.toBuffer(),
    Buffer.from([params.decimals]),
    Buffer.from([1]), // is_active = true
    Buffer.from(params.maxDeposit.toString(16).padStart(16, '0'), 'hex'),
    Buffer.from(params.minDepositUsd.toString(16).padStart(16, '0'), 'hex'),
    Buffer.from([params.maxLtvOverride & 0xff, (params.maxLtvOverride >> 8) & 0xff]),
    // LP-specific fields
    params.lpPool ? Buffer.concat([Buffer.from([1]), params.lpPool.toBuffer()]) : Buffer.from([0]),
    params.lpTokenA ? Buffer.concat([Buffer.from([1]), params.lpTokenA.toBuffer()]) : Buffer.from([0]),
    params.lpTokenB ? Buffer.concat([Buffer.from([1]), params.lpTokenB.toBuffer()]) : Buffer.from([0]),
    Buffer.from([params.lpProtocol || 0]),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: whitelistPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });
}

// CLI setup
const program = new Command();

program
  .name('whitelist-token')
  .description('Whitelist a token for use as collateral in Credana')
  .argument('<mint>', 'Token mint address')
  .argument('<type>', `Collateral type: ${Object.keys(COLLATERAL_TYPES).join(', ')}`)
  .option('--oracle <address>', 'Oracle address (auto-detected for known tokens)')
  .option('--oracle-type <type>', 'Oracle type: pyth, switchboard, birdeye', 'pyth')
  .option('--decimals <number>', 'Token decimals', '9')
  .option('--ltv <percent>', 'Custom max LTV percentage (0-100)')
  .option('--min-deposit <usd>', 'Minimum deposit in USD', '10')
  .option('--max-deposit <amount>', 'Maximum deposit amount (0 = unlimited)', '0')
  .option('--pool <address>', 'LP pool address (for LP tokens)')
  .option('--token-a <address>', 'Token A mint (for LP tokens)')
  .option('--token-b <address>', 'Token B mint (for LP tokens)')
  .option('--protocol <name>', 'LP protocol: raydium, orca, meteora, kamino')
  .action(async (mintStr: string, typeStr: string, options) => {
    try {
      const mint = new PublicKey(mintStr);
      const collateralType = COLLATERAL_TYPES[typeStr as keyof typeof COLLATERAL_TYPES];
      
      if (collateralType === undefined) {
        throw new Error(`Invalid collateral type: ${typeStr}`);
      }

      // Auto-detect oracle for known tokens
      let oracle = options.oracle ? new PublicKey(options.oracle) : null;
      let oracleType = ORACLE_TYPES[options.oracleType as keyof typeof ORACLE_TYPES] || 0;
      
      if (!oracle && KNOWN_ORACLES[mintStr]) {
        oracle = new PublicKey(KNOWN_ORACLES[mintStr].address);
        oracleType = KNOWN_ORACLES[mintStr].type;
        console.log('🔮 Auto-detected oracle:', KNOWN_ORACLES[mintStr].address);
      }
      
      if (!oracle) {
        // For unknown tokens, use a placeholder (Birdeye API will be used off-chain)
        oracle = PublicKey.default;
        oracleType = 2; // Birdeye
        console.log('⚠️  No oracle found. Will use Birdeye API for pricing.');
      }

      const params: WhitelistParams = {
        mint,
        collateralType,
        oracleType,
        oracle,
        decimals: parseInt(options.decimals),
        maxDeposit: BigInt(options.maxDeposit),
        minDepositUsd: BigInt(Math.floor(parseFloat(options.minDeposit) * 1e6)),
        maxLtvOverride: options.ltv ? parseInt(options.ltv) * 100 : 0, // Convert to basis points
        lpPool: options.pool ? new PublicKey(options.pool) : undefined,
        lpTokenA: options.tokenA ? new PublicKey(options.tokenA) : undefined,
        lpTokenB: options.tokenB ? new PublicKey(options.tokenB) : undefined,
        lpProtocol: options.protocol ? 
          ['raydium', 'orca', 'meteora', 'kamino'].indexOf(options.protocol) : 
          undefined,
      };

      await whitelistToken(params);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Example commands
if (process.argv.length === 2) {
  console.log('\n📚 Examples:\n');
  console.log('  # Whitelist FWOG as memecoin:');
  console.log('  npx tsx scripts/whitelist-token.ts A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump memecoin\n');
  
  console.log('  # Whitelist JitoSOL with 70% LTV:');
  console.log('  npx tsx scripts/whitelist-token.ts J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn liquid_staking --ltv 70\n');
  
  console.log('  # Whitelist Meteora SOL-USDC LP:');
  console.log('  npx tsx scripts/whitelist-token.ts <lp_mint> lp_volatile --pool <pool> --token-a So11...112 --token-b EPjF...t1v --protocol meteora\n');
}

program.parse(); 