import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, web3 } from '@coral-xyz/anchor';
import { logger } from '../../utils/logger';

// Program configuration
const CREDANA_PROGRAM_ID = new PublicKey('5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN');
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Initialize Solana connection
export const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Load or create wallet
function loadWallet(): Keypair {
  try {
    if (process.env.SOLANA_PRIVATE_KEY) {
      const privateKey = process.env.SOLANA_PRIVATE_KEY.split(',').map(s => parseInt(s.trim()));
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } else {
      logger.warn('No SOLANA_PRIVATE_KEY found, generating ephemeral wallet');
      const wallet = Keypair.generate();
      logger.info('Ephemeral wallet created', { 
        publicKey: wallet.publicKey.toString(),
        note: 'This wallet will not persist between restarts'
      });
      return wallet;
    }
  } catch (error) {
    logger.error('Failed to load wallet, generating new one', { error });
    return Keypair.generate();
  }
}

export const wallet = loadWallet();

// Create Anchor provider
export const provider = new AnchorProvider(
  connection, 
  new Wallet(wallet), 
  { commitment: 'confirmed' }
);

// PDA derivation functions
export function getUserPositionPDA(userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_position'), userPubkey.toBuffer()],
    CREDANA_PROGRAM_ID
  );
}

export function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    CREDANA_PROGRAM_ID
  );
}

export function getVaultAuthorityPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault_authority')],
    CREDANA_PROGRAM_ID
  );
}

export function getJitoSolVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('jito_sol_vault')],
    CREDANA_PROGRAM_ID
  );
}

export function getUsdcVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('usdc_vault')],
    CREDANA_PROGRAM_ID
  );
}

// Utility functions
export async function getUserPosition(userPubkey: PublicKey) {
  try {
    const [userPositionPDA] = getUserPositionPDA(userPubkey);
    const accountInfo = await connection.getAccountInfo(userPositionPDA);
    
    if (!accountInfo) {
      return null;
    }

    // TODO: Parse account data using Anchor/Borsh
    // For now, return basic info
    return {
      address: userPositionPDA.toString(),
      exists: true,
      data: accountInfo.data,
    };
  } catch (error) {
    logger.error('Failed to get user position', { error, userPubkey: userPubkey.toString() });
    return null;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const version = await connection.getVersion();
    const slot = await connection.getSlot();
    
    logger.info('Solana connection test successful', {
      version: version['solana-core'],
      slot,
      rpcUrl: SOLANA_RPC_URL,
      programId: CREDANA_PROGRAM_ID.toString(),
    });
    
    return true;
  } catch (error) {
    logger.error('Solana connection test failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      rpcUrl: SOLANA_RPC_URL,
    });
    return false;
  }
}

// Export constants
export { CREDANA_PROGRAM_ID }; 