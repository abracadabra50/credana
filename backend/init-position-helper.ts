import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PROGRAM_ID = '5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN';
const CONFIG_PDA = 'DxfTMDhNkmNh4pryChfvQffKAGYXcSFcQ9G15puSQzGw';
const YOUR_WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

console.log(`
🚀 CREDANA POSITION INITIALIZATION HELPER
═══════════════════════════════════════════════

This script will help you initialize your position.

📊 Current Setup:
   • Your Wallet: ${YOUR_WALLET}
   • Program ID: ${PROGRAM_ID}
   • Config PDA: ${CONFIG_PDA}

🔑 WALLET OPTIONS:
═══════════════════════════════════════════════

OPTION 1: Use Frontend (EASIEST)
─────────────────────────────────
1. Open http://localhost:3000 in your browser
2. Connect your wallet (Phantom/Solflare)
3. Click "Initialize Position" button
4. Approve the transaction

OPTION 2: Use Private Key (CLI)
─────────────────────────────────
If you have the private key for ${YOUR_WALLET}:

1. Export your private key as an array:
   export USER_PRIVATE_KEY='[your,private,key,array]'
   
2. Run this command:
   npx tsx init-position-with-key.ts

OPTION 3: Generate Test Wallet (For Testing Only)
──────────────────────────────────────────────────
To create a new test wallet and initialize:

   npx tsx init-test-position.ts

📝 MANUAL TRANSACTION (Advanced)
═══════════════════════════════════════════════

If you want to create the transaction manually:

\`\`\`typescript
// Transaction Details
const instruction = {
  programId: new PublicKey('${PROGRAM_ID}'),
  accounts: {
    user: new PublicKey('${YOUR_WALLET}'),
    position: [PDA derived from user + "position"],
    config: new PublicKey('${CONFIG_PDA}'),
    systemProgram: SystemProgram.programId,
  },
  data: Buffer.from([/* init_position instruction */])
};
\`\`\`

🎯 NEXT STEPS AFTER INITIALIZATION:
═══════════════════════════════════════════════

1. ✅ Position initialized
2. 💰 Deposit jitoSOL collateral (increases credit limit)
3. 💳 Use your card (transactions auto-approved under $100)
4. 📊 Debt recorded on-chain
5. 💸 Repay with USDC anytime

🔗 USEFUL COMMANDS:
═══════════════════════════════════════════════

Check your SOL balance:
  solana balance ${YOUR_WALLET} --url devnet

Check position account (after init):
  solana account [position_pda] --url devnet

Monitor program logs:
  solana logs ${PROGRAM_ID} --url devnet

`);

// Helper function to derive position PDA
async function getPositionPDA(userPubkey: PublicKey, programId: PublicKey) {
  const [positionPDA] = await PublicKey.findProgramAddress(
    [Buffer.from("position"), userPubkey.toBuffer()],
    programId
  );
  return positionPDA;
}

// Show the position PDA
(async () => {
  const userPubkey = new PublicKey(YOUR_WALLET);
  const programId = new PublicKey(PROGRAM_ID);
  const positionPDA = await getPositionPDA(userPubkey, programId);
  
  console.log(`📍 Your Position PDA will be: ${positionPDA.toBase58()}`);
  console.log(`
💡 TIP: The easiest way is to use the frontend!
   Just open http://localhost:3000 and connect your wallet.
`);
})(); 