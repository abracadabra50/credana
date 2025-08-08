import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CREDANA_PROGRAM_ID = new PublicKey('5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN');

// Initialize connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Load or create admin wallet
function loadAdminWallet(): Keypair {
  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const privateKey = process.env.SOLANA_PRIVATE_KEY.split(',').map(s => parseInt(s.trim()));
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } catch (error) {
      console.log('Failed to load wallet from env, generating new one...');
    }
  }
  
  console.log('⚠️  No SOLANA_PRIVATE_KEY found, generating ephemeral admin wallet');
  const wallet = Keypair.generate();
  console.log(`📋 Admin wallet: ${wallet.publicKey.toString()}`);
  console.log(`🔑 Private key (save this): [${Array.from(wallet.secretKey).join(',')}]`);
  return wallet;
}

// PDA derivation functions
function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    CREDANA_PROGRAM_ID
  );
}

// Create initialize instruction with proper Anchor serialization
function createInitializeInstruction(
  admin: PublicKey,
  config: PublicKey
): TransactionInstruction {
  // Initialize instruction discriminator (calculated correctly above)
  const discriminator = Buffer.from([0xAF, 0xAF, 0x6D, 0x1F, 0x0D, 0x98, 0x9B, 0xED]);
  
  // InitializeParams struct
  const params = {
    ltv_max_bps: 8000,                    // 80% LTV
    liquidation_threshold_bps: 8500,      // 85% liquidation threshold
    liquidation_bonus_bps: 500,           // 5% liquidation bonus
    interest_rate_bps: 800,               // 8% annual interest rate
    sol_usd_oracle: new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix'),       // Pyth SOL/USD on devnet
    jito_sol_usd_oracle: new PublicKey('7yyaeuJ1GGtVBLT2z2xub5ZWYKaNhF28mj1RdV4VDFVk'), // Pyth jitoSOL/USD on devnet
    usdc_mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),        // USDC mint on devnet
    jito_sol_mint: new PublicKey('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'),     // jitoSOL mint
  };
  
  // Serialize parameters using Anchor format (little-endian)
  const data = Buffer.alloc(8 + 2 + 2 + 2 + 2 + 32 + 32 + 32 + 32); // discriminator + params
  let offset = 0;
  
  // Discriminator
  discriminator.copy(data, offset);
  offset += 8;
  
  // Parameters
  data.writeUInt16LE(params.ltv_max_bps, offset);
  offset += 2;
  data.writeUInt16LE(params.liquidation_threshold_bps, offset);
  offset += 2;
  data.writeUInt16LE(params.liquidation_bonus_bps, offset);
  offset += 2;
  data.writeUInt16LE(params.interest_rate_bps, offset);
  offset += 2;
  
  // PublicKeys (32 bytes each)
  params.sol_usd_oracle.toBuffer().copy(data, offset);
  offset += 32;
  params.jito_sol_usd_oracle.toBuffer().copy(data, offset);
  offset += 32;
  params.usdc_mint.toBuffer().copy(data, offset);
  offset += 32;
  params.jito_sol_mint.toBuffer().copy(data, offset);

  return new TransactionInstruction({
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: CREDANA_PROGRAM_ID,
    data,
  });
}

async function initializeProgram() {
  console.log('🚀 INITIALIZING CREDANA PROGRAM');
  console.log('═══════════════════════════════════');
  
  const adminWallet = loadAdminWallet();
  
  // Get config PDA
  const [configPDA, configBump] = getConfigPDA();
  
  console.log('\n📋 ADDRESSES:');
  console.log(`Admin: ${adminWallet.publicKey.toString()}`);
  console.log(`Program: ${CREDANA_PROGRAM_ID.toString()}`);
  console.log(`Config PDA: ${configPDA.toString()} (bump: ${configBump})`);
  
  // Check if already initialized
  try {
    const configAccount = await connection.getAccountInfo(configPDA);
    if (configAccount) {
      console.log('\n⚠️  Program already initialized!');
      console.log(`Config account exists with ${configAccount.data.length} bytes`);
      return;
    }
  } catch (error) {
    console.log('Config account check failed, proceeding with initialization...');
  }
  
  // Check admin wallet balance
  const balance = await connection.getBalance(adminWallet.publicKey);
  console.log(`\n💰 Admin wallet balance: ${balance / 1e9} SOL`);
  
  if (balance < 0.01e9) { // Less than 0.01 SOL
    console.log('⚠️  Low balance! You may need to airdrop SOL for transaction fees.');
    console.log(`💸 Airdrop command: solana airdrop 1 ${adminWallet.publicKey.toString()} --url devnet`);
    return;
  }
  
  // Create initialize transaction
  const initializeIx = createInitializeInstruction(
    adminWallet.publicKey,
    configPDA
  );
  
  const transaction = new Transaction().add(initializeIx);
  
  try {
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = adminWallet.publicKey;
    
    // Sign transaction
    transaction.sign(adminWallet);
    
    console.log('\n📡 Sending initialization transaction...');
    
    // Send transaction
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      }
    );
    
    console.log(`📝 Transaction signature: ${signature}`);
    console.log(`🔗 View on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    // Confirm transaction
    console.log('⏳ Confirming transaction...');
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
    });
    
    if (confirmation.value.err) {
      console.error('❌ Transaction failed:', confirmation.value.err);
      return;
    }
    
    console.log('\n✅ PROGRAM INITIALIZED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════');
    console.log('\n📊 CONFIGURATION:');
    console.log(`   LTV Ratio: 80%`);
    console.log(`   Liquidation Threshold: 85%`);
    console.log(`   Liquidation Bonus: 5%`);
    console.log(`   Interest Rate: 8% APR`);
    console.log(`   Admin: ${adminWallet.publicKey.toString()}`);
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Initialize your user position');
    console.log('2. Deposit jitoSOL collateral');
    console.log('3. Start recording card transactions');
    
  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    
    if (error instanceof Error && error.message.includes('insufficient funds')) {
      console.log('\n💡 TIP: Fund your admin wallet:');
      console.log(`solana airdrop 2 ${adminWallet.publicKey.toString()} --url devnet`);
    }
  }
}

// Run the initialization
initializeProgram().catch(console.error); 