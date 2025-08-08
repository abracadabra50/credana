import { Connection, PublicKey, AccountInfo, MemcmpFilter } from '@solana/web3.js';
import { logger } from '../../utils/logger';
import { positionCache, CachedPosition } from '../cache/position-cache';
import { recordMetrics } from '../../utils/metrics';
import { db } from '../../config/database';

// Program configuration
const PROGRAM_CONFIG = {
  PROGRAM_ID: process.env.CREDIT_CORE_PROGRAM_ID || 'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS',
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  POLLING_INTERVAL_MS: parseInt(process.env.INDEXER_POLLING_INTERVAL || '5000'), // 5 seconds
  BATCH_SIZE: parseInt(process.env.INDEXER_BATCH_SIZE || '100'),
};

// Position account discriminator (first 8 bytes of account data)
const USER_POSITION_DISCRIMINATOR = [0x7d, 0x70, 0x1c, 0x86, 0xd4, 0x9b, 0x7c, 0x1e]; // From Anchor

export class ProgramIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private isRunning: boolean = false;
  private lastProcessedSlot: number = 0;

  constructor() {
    this.connection = new Connection(PROGRAM_CONFIG.SOLANA_RPC_URL, 'confirmed');
    this.programId = new PublicKey(PROGRAM_CONFIG.PROGRAM_ID);
  }

  /**
   * Start the indexer service
   */
  async start(): Promise<void> {
    logger.info('Starting program indexer', {
      programId: this.programId.toString(),
      rpcUrl: PROGRAM_CONFIG.SOLANA_RPC_URL,
      pollingInterval: PROGRAM_CONFIG.POLLING_INTERVAL_MS
    });

    this.isRunning = true;

    // Get last processed slot from database
    try {
      const result = await db.query(
        'SELECT last_processed_slot FROM indexer_state WHERE program_id = $1',
        [this.programId.toString()]
      );

      if (result.rows.length > 0) {
        this.lastProcessedSlot = result.rows[0].last_processed_slot;
        logger.info('Resuming from slot', { slot: this.lastProcessedSlot });
      } else {
        // Initialize state
        this.lastProcessedSlot = await this.connection.getSlot();
        await db.query(
          'INSERT INTO indexer_state (program_id, last_processed_slot) VALUES ($1, $2)',
          [this.programId.toString(), this.lastProcessedSlot]
        );
        logger.info('Initialized indexer state', { startSlot: this.lastProcessedSlot });
      }
    } catch (error) {
      logger.warn('Could not get indexer state from database, starting fresh', { error });
      this.lastProcessedSlot = await this.connection.getSlot();
    }

    // Initial full sync
    await this.performFullSync();

    // Start polling loop
    this.startPollingLoop();
  }

  /**
   * Stop the indexer service
   */
  async stop(): Promise<void> {
    logger.info('Stopping program indexer');
    this.isRunning = false;
  }

  /**
   * Perform full sync of all positions to warm cache
   */
  private async performFullSync(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting full position sync');

    try {
      // Get all user position accounts
      const positionAccounts = await this.getAllUserPositions();
      
      if (positionAccounts.length === 0) {
        logger.info('No positions found during full sync');
        return;
      }

      // Process positions in batches
      const batches = this.chunkArray(positionAccounts, PROGRAM_CONFIG.BATCH_SIZE);
      let totalProcessed = 0;

      for (const batch of batches) {
        const cachedPositions = await this.processBatch(batch);
        
        if (cachedPositions.length > 0) {
          await positionCache.warmCache(cachedPositions);
          totalProcessed += cachedPositions.length;
        }

        // Small delay to avoid overwhelming Redis
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      recordMetrics('indexer.full_sync.duration', duration);
      recordMetrics('indexer.full_sync.positions', totalProcessed);

      logger.info('Full sync completed', {
        positionsProcessed: totalProcessed,
        duration,
        accountsFound: positionAccounts.length
      });

    } catch (error) {
      logger.error('Full sync failed', { error });
      recordMetrics('indexer.full_sync.error', 1);
      throw error;
    }
  }

  /**
   * Start the continuous polling loop
   */
  private startPollingLoop(): void {
    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.processNewTransactions();
        
        // Update last processed slot in database periodically
        await this.updateProcessedSlot();
        
      } catch (error) {
        logger.error('Polling error', { error });
        recordMetrics('indexer.polling.error', 1);
      }

      // Schedule next poll
      setTimeout(poll, PROGRAM_CONFIG.POLLING_INTERVAL_MS);
    };

    poll();
  }

  /**
   * Get all user position accounts from the program
   */
  private async getAllUserPositions(): Promise<{ pubkey: PublicKey; account: AccountInfo<Buffer> }[]> {
    try {
      // Create memcmp filter for user position accounts
      const filter: MemcmpFilter = {
        memcmp: {
          offset: 0, // Account discriminator is at offset 0
          bytes: Buffer.from(USER_POSITION_DISCRIMINATOR).toString('base64'),
        },
      };

      const accounts = await this.connection.getProgramAccounts(this.programId, {
        filters: [filter],
        encoding: 'base64',
      });

      logger.debug('Found user position accounts', { count: accounts.length });
      return [...accounts]; // Convert readonly array to mutable

    } catch (error) {
      logger.error('Failed to get user position accounts', { error });
      throw error;
    }
  }

  /**
   * Process new transactions since last processed slot
   */
  private async processNewTransactions(): Promise<void> {
    try {
      const currentSlot = await this.connection.getSlot();
      
      if (currentSlot <= this.lastProcessedSlot) {
        return; // No new slots to process
      }

      // Get signatures for our program in the slot range
      const signatures = await this.connection.getSignaturesForAddress(
        this.programId,
        {
          before: undefined,
          until: undefined,
          limit: 100,
        }
      );

      // Filter signatures for slots we haven't processed
      const newSignatures = signatures.filter(sig => 
        sig.slot && sig.slot > this.lastProcessedSlot
      );

      if (newSignatures.length === 0) {
        this.lastProcessedSlot = currentSlot;
        return;
      }

      logger.debug('Processing new transactions', { 
        count: newSignatures.length,
        fromSlot: this.lastProcessedSlot,
        toSlot: currentSlot
      });

      // Process each transaction that might have affected positions
      for (const sigInfo of newSignatures) {
        if (sigInfo.err) continue; // Skip failed transactions

        await this.processTransaction(sigInfo.signature);
      }

      this.lastProcessedSlot = currentSlot;
      recordMetrics('indexer.transactions.processed', newSignatures.length);

    } catch (error) {
      logger.error('Failed to process new transactions', { error });
      recordMetrics('indexer.transaction_processing.error', 1);
    }
  }

  /**
   * Process a specific transaction that may have updated positions
   */
  private async processTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return;

      // For now, just trigger a refresh of all positions when any transaction occurs
      // In production, we'd parse the specific accounts that were modified
      logger.debug('Transaction detected, cache will be refreshed on next sync', {
        signature,
        slot: tx.slot
      });
      
      // This could be optimized to only refresh specific positions
      // For MVP, the polling mechanism will handle updates

    } catch (error) {
      logger.warn('Failed to process transaction', { signature, error });
    }
  }



  /**
   * Process a batch of position accounts
   */
  private async processBatch(
    accounts: { pubkey: PublicKey; account: AccountInfo<Buffer> }[]
  ): Promise<CachedPosition[]> {
    const positions: CachedPosition[] = [];

    for (const { pubkey, account } of accounts) {
      try {
        const position = await this.parseUserPosition(pubkey, account);
        if (position) {
          positions.push(position);
        }
      } catch (error) {
        logger.warn('Failed to parse position account', { 
          pubkey: pubkey.toString(), 
          error 
        });
      }
    }

    return positions;
  }

  /**
   * Parse on-chain user position account to cached position format
   */
  private async parseUserPosition(
    pubkey: PublicKey,
    account: AccountInfo<Buffer>
  ): Promise<CachedPosition | null> {
    try {
      // Simple parsing without full Anchor setup
      // In production, you'd use the actual IDL and Anchor coder
      const data = account.data;
      
      if (data.length < 8) return null;

      // Skip discriminator (8 bytes) and parse the rest
      // This is a simplified version - in production, use proper Anchor deserialization
      let offset = 8;
      
      // owner: PublicKey (32 bytes)
      const owner = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      // coll_mint: PublicKey (32 bytes) - skip for now
      offset += 32;

      // coll_amount: u64 (8 bytes)
      const collAmount = data.readBigUInt64LE(offset);
      offset += 8;

      // debt_usdc: u64 (8 bytes)
      const debtUsdc = data.readBigUInt64LE(offset);
      offset += 8;

      // borrow_index_snapshot: u128 (16 bytes) - read as BigInt but store as number
      const borrowIndexSnapshot = data.readBigUInt64LE(offset); // Simplified
      offset += 16;

      // last_update_slot: u64 (8 bytes)
      const lastUpdateSlot = data.readBigUInt64LE(offset);

      // Get user info from database
      const userResult = await db.query(
        'SELECT id, wallet_address FROM users WHERE wallet_address = $1',
        [owner.toString()]
      );

      if (userResult.rows.length === 0) {
        logger.debug('User not found for position', { owner: owner.toString() });
        return null;
      }

      const { id: userId, wallet_address: walletAddress } = userResult.rows[0];

      // Calculate derived values
      const collateralAmount = Number(collAmount);
      const debt = Number(debtUsdc);
      
      // Simple health factor calculation (in production, use current prices)
      const estimatedCollateralValue = collateralAmount * 200; // Approximate $200 jitoSOL
      const liquidationValue = (estimatedCollateralValue * 6000) / 10000; // 60% liquidation threshold
      const healthFactor = debt > 0 ? Math.floor((liquidationValue / debt) * 10000) : 99999;
      
      // Calculate available credit (50% LTV)
      const maxBorrow = (estimatedCollateralValue * 5000) / 10000;
      const availableCredit = Math.max(0, maxBorrow - debt);

      const cachedPosition: CachedPosition = {
        userId,
        walletAddress,
        collateralAmount,
        debtUsdc: debt,
        borrowIndexSnapshot: Number(borrowIndexSnapshot),
        lastUpdateSlot: Number(lastUpdateSlot),
        creditLimit: maxBorrow,
        healthFactor,
        availableCredit,
        lastCacheUpdate: Date.now(),
        isHealthy: healthFactor >= 11000, // 110% minimum
      };

      return cachedPosition;

    } catch (error) {
      logger.error('Failed to parse user position', { 
        pubkey: pubkey.toString(), 
        error 
      });
      return null;
    }
  }

  /**
   * Update the last processed slot in database
   */
  private async updateProcessedSlot(): Promise<void> {
    try {
      await db.query(
        'UPDATE indexer_state SET last_processed_slot = $1, updated_at = NOW() WHERE program_id = $2',
        [this.lastProcessedSlot, this.programId.toString()]
      );
    } catch (error) {
      logger.warn('Failed to update processed slot', { error });
    }
  }

  /**
   * Utility function to chunk array into batches
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get indexer health status
   */
  async getHealth(): Promise<{
    isRunning: boolean;
    lastProcessedSlot: number;
    currentSlot: number;
    lag: number;
  }> {
    const currentSlot = await this.connection.getSlot();
    
    return {
      isRunning: this.isRunning,
      lastProcessedSlot: this.lastProcessedSlot,
      currentSlot,
      lag: currentSlot - this.lastProcessedSlot,
    };
  }
}

// Export singleton instance
export const programIndexer = new ProgramIndexer(); 