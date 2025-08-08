import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, SystemProgram } from '@solana/web3.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CREDANA_PROGRAM_ID = new PublicKey('5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN');

// Initialize connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Your wallet (the one mapped to your card)
const YOUR_WALLET = new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');

// Load admin wallet (for paying transaction fees)
function loadAdminWallet(): Keypair {
  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const privateKey = process.env.SOLANA_PRIVATE_KEY.split(',').map(s => parseInt(s.trim()));
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } catch (error) {
      throw new Error('Failed to load admin wallet from SOLANA_PRIVATE_KEY');
    }
  }
  throw new Error('SOLANA_PRIVATE_KEY not found in environment');
}

// PDA derivation functions
function getUserPositionPDA(userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), userPubkey.toBuffer()],
    CREDANA_PROGRAM_ID
  );
}

function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    CREDANA_PROGRAM_ID
  );
}

// Create init_position instruction
function createInitPositionInstruction(
  userWallet: PublicKey,
  userPosition: PublicKey,
  config: PublicKey,
  payer: PublicKey
): TransactionInstruction {
  // Calculate discriminator for 'init_position'
  const discriminator = Buffer.from([0xc5, 0x14, 0x0a, 0x01, 0x61, 0xa0, 0xb1, 0x5b]);
  
  // No additional parameters needed for init_position
  const data = Buffer.alloc(8);
  discriminator.copy(data, 0);

  return new TransactionInstruction({
    keys: [
      { pubkey: userPosition, isSigner: false, isWritable: true },
      { pubkey: userWallet, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: CREDANA_PROGRAM_ID,
    data,
  });
}

async function initUserPosition() {
  console.log('🚀 INITIALIZING YOUR USER POSITION');
  console.log('═══════════════════════════════════════');
  
  const adminWallet = loadAdminWallet();
  
  // Get PDAs
  const [userPositionPDA, userPositionBump] = getUserPositionPDA(YOUR_WALLET);
  const [configPDA] = getConfigPDA();
  
  console.log('\n📋 ADDRESSES:');
  console.log(`Your Wallet: ${YOUR_WALLET.toString()}`);
  console.log(`Your Position PDA: ${userPositionPDA.toString()} (bump: ${userPositionBump})`);
  console.log(`Config: ${configPDA.toString()}`);
  console.log(`Admin (Payer): ${adminWallet.publicKey.toString()}`);
  
  // Check if position already exists
  try {
    const positionAccount = await connection.getAccountInfo(userPositionPDA);
    if (positionAccount) {
      console.log('\n⚠️  Your position already exists!');
      console.log(`Position account has ${positionAccount.data.length} bytes of data`);
      console.log('\n✅ Ready to deposit collateral and start using your card!');
      return;
    }
  } catch (error) {
    console.log('Position account check failed, proceeding with initialization...');
  }
  
  // Check admin wallet balance
  const balance = await connection.getBalance(adminWallet.publicKey);
  console.log(`\n💰 Admin wallet balance: ${balance / 1e9} SOL`);
  
  if (balance < 0.01e9) {
    console.log('⚠️  Low balance! Need SOL for transaction fees.');
    console.log(`💸 Airdrop command: solana airdrop 1 ${adminWallet.publicKey.toString()} --url devnet`);
    return;
  }
  
  // Create init_position transaction
  const initPositionIx = createInitPositionInstruction(
    YOUR_WALLET,
    userPositionPDA,
    configPDA,
    adminWallet.publicKey
  );
  
  const transaction = new Transaction().add(initPositionIx);
  
  try {
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = adminWallet.publicKey;
    
    // Sign transaction
    transaction.sign(adminWallet);
    
    console.log('\n📡 Sending position initialization transaction...');
    
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
    
    console.log('\n✅ YOUR POSITION INITIALIZED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════');
    console.log('\n🎯 WHAT\'S NEXT:');
    console.log('1. ✅ Program initialized');
    console.log('2. ✅ Your position created');
    console.log('3. 🔄 Start the backend server');
    console.log('4. 💳 Test a real card transaction');
    console.log('\n💡 Your card is ready to record debt on-chain!');
    console.log(`💳 Card: 4111-1113-0243-7242`);
    console.log(`🔗 Wallet: ${YOUR_WALLET.toString()}`);
    
  } catch (error) {
    console.error('\n❌ Position initialization failed:', error);
    
    if (error instanceof Error && error.message.includes('insufficient funds')) {
      console.log('\n💡 TIP: Fund your admin wallet:');
      console.log(`solana airdrop 1 ${adminWallet.publicKey.toString()} --url devnet`);
    }
  }
}

// Run the initialization
initUserPosition().catch(console.error); 