import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Jupiter, RouteInfo, SwapMode } from '@jup-ag/core';
import axios from 'axios';
import BN from 'bn.js';
import { logger } from '../utils/logger';

// Jupiter API endpoints
const JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4';

interface LiquidationStrategy {
  method: 'instant' | 'dca' | 'twap';
  duration?: number; // in seconds
  intervals?: number; // number of splits
  maxSlippage: number; // basis points
}

interface LiquidationResult {
  success: boolean;
  collateralSold: BN;
  usdcReceived: BN;
  executionPrice: number;
  gasUsed: BN;
  profit: BN;
  txSignatures: string[];
}

export class LiquidationService {
  private jupiter: Jupiter | null = null;
  private connection: Connection;
  private programWallet: Keypair;
  
  constructor(
    connection: Connection,
    programWallet: Keypair
  ) {
    this.connection = connection;
    this.programWallet = programWallet;
  }
  
  async initialize() {
    // Initialize Jupiter
    this.jupiter = await Jupiter.load({
      connection: this.connection,
      cluster: 'mainnet-beta',
      user: this.programWallet.publicKey,
    });
    
    logger.info('Liquidation service initialized with Jupiter');
  }
  
  /**
   * Main liquidation function - no liquidators needed!
   */
  async liquidatePosition(
    userPosition: PublicKey,
    collateralMint: PublicKey,
    collateralAmount: BN,
    debtToRepay: BN,
    collateralType: string
  ): Promise<LiquidationResult> {
    logger.info(`Starting liquidation for position ${userPosition.toBase58()}`);
    
    // Step 1: Determine liquidation strategy based on position size
    const positionValueUsd = await this.getPositionValue(collateralMint, collateralAmount);
    const strategy = this.determineLiquidationStrategy(positionValueUsd, collateralType);
    
    logger.info(`Liquidation strategy: ${strategy.method} for $${positionValueUsd.toFixed(2)}`);
    
    // Step 2: Execute liquidation based on strategy
    let result: LiquidationResult;
    
    switch (strategy.method) {
      case 'instant':
        result = await this.executeInstantSwap(
          collateralMint,
          collateralAmount,
          debtToRepay,
          strategy.maxSlippage
        );
        break;
        
      case 'dca':
        result = await this.executeDCASwap(
          collateralMint,
          collateralAmount,
          debtToRepay,
          strategy.duration!,
          strategy.intervals!,
          strategy.maxSlippage
        );
        break;
        
      case 'twap':
        result = await this.executeTWAPSwap(
          collateralMint,
          collateralAmount,
          debtToRepay,
          strategy.duration!,
          strategy.maxSlippage
        );
        break;
        
      default:
        throw new Error(`Unknown liquidation strategy: ${strategy.method}`);
    }
    
    // Step 3: Distribute profits
    if (result.success && result.profit.gt(new BN(0))) {
      await this.distributeProfits(result.profit);
    }
    
    return result;
  }
  
  /**
   * Determine the best liquidation strategy based on position size and type
   */
  private determineLiquidationStrategy(
    positionValueUsd: number,
    collateralType: string
  ): LiquidationStrategy {
    // Special handling for memecoins - always use longer TWAP
    if (collateralType === 'memecoin') {
      if (positionValueUsd < 5000) {
        return {
          method: 'instant',
          maxSlippage: 300, // 3% slippage for small memecoin positions
        };
      } else if (positionValueUsd < 50000) {
        return {
          method: 'dca',
          duration: 3600, // 1 hour
          intervals: 12, // Every 5 minutes
          maxSlippage: 200,
        };
      } else {
        return {
          method: 'twap',
          duration: 21600, // 6 hours for large memecoin positions
          maxSlippage: 150,
        };
      }
    }
    
    // Standard assets (SOL, blue chips, etc.)
    if (positionValueUsd < 10000) {
      return {
        method: 'instant',
        maxSlippage: 100, // 1% slippage tolerance
      };
    } else if (positionValueUsd < 100000) {
      return {
        method: 'dca',
        duration: 3600, // 1 hour
        intervals: 6, // Every 10 minutes
        maxSlippage: 75,
      };
    } else {
      return {
        method: 'twap',
        duration: 14400, // 4 hours for large positions
        maxSlippage: 50,
      };
    }
  }
  
  /**
   * Execute instant swap via Jupiter
   */
  private async executeInstantSwap(
    inputMint: PublicKey,
    inputAmount: BN,
    minOutputAmount: BN,
    maxSlippageBps: number
  ): Promise<LiquidationResult> {
    try {
      // Get quote from Jupiter
      const quote = await this.getJupiterQuote(
        inputMint.toBase58(),
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        inputAmount.toString(),
        maxSlippageBps
      );
      
      if (!quote || !quote.routePlan) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      // Check if output meets minimum requirement
      const outputAmount = new BN(quote.outAmount);
      if (outputAmount.lt(minOutputAmount)) {
        throw new Error(`Insufficient output: ${outputAmount} < ${minOutputAmount}`);
      }
      
      // Get serialized transaction from Jupiter
      const swapTransaction = await this.getJupiterSwapTransaction(quote);
      
      // Execute transaction
      const signature = await this.connection.sendRawTransaction(
        swapTransaction.swapTransaction,
        { skipPreflight: false }
      );
      
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      logger.info(`Instant swap executed: ${signature}`);
      
      return {
        success: true,
        collateralSold: inputAmount,
        usdcReceived: outputAmount,
        executionPrice: outputAmount.toNumber() / inputAmount.toNumber(),
        gasUsed: new BN(5000), // Estimate
        profit: outputAmount.sub(minOutputAmount),
        txSignatures: [signature],
      };
      
    } catch (error) {
      logger.error('Instant swap failed:', error);
      throw error;
    }
  }
  
  /**
   * Execute DCA (Dollar Cost Average) swap
   */
  private async executeDCASwap(
    inputMint: PublicKey,
    inputAmount: BN,
    minOutputAmount: BN,
    duration: number,
    intervals: number,
    maxSlippageBps: number
  ): Promise<LiquidationResult> {
    const amountPerInterval = inputAmount.div(new BN(intervals));
    const intervalDuration = duration / intervals;
    
    let totalUsdcReceived = new BN(0);
    const txSignatures: string[] = [];
    
    logger.info(`Starting DCA: ${intervals} swaps over ${duration}s`);
    
    for (let i = 0; i < intervals; i++) {
      try {
        // Execute swap for this interval
        const result = await this.executeInstantSwap(
          inputMint,
          amountPerInterval,
          minOutputAmount.div(new BN(intervals)),
          maxSlippageBps
        );
        
        totalUsdcReceived = totalUsdcReceived.add(result.usdcReceived);
        txSignatures.push(...result.txSignatures);
        
        logger.info(`DCA interval ${i + 1}/${intervals} complete`);
        
        // Wait for next interval (except for last one)
        if (i < intervals - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalDuration * 1000));
        }
        
      } catch (error) {
        logger.error(`DCA interval ${i + 1} failed:`, error);
        // Continue with remaining intervals
      }
    }
    
    return {
      success: totalUsdcReceived.gte(minOutputAmount),
      collateralSold: inputAmount,
      usdcReceived: totalUsdcReceived,
      executionPrice: totalUsdcReceived.toNumber() / inputAmount.toNumber(),
      gasUsed: new BN(5000 * intervals),
      profit: totalUsdcReceived.sub(minOutputAmount),
      txSignatures,
    };
  }
  
  /**
   * Execute TWAP (Time-Weighted Average Price) swap
   */
  private async executeTWAPSwap(
    inputMint: PublicKey,
    inputAmount: BN,
    minOutputAmount: BN,
    duration: number,
    maxSlippageBps: number
  ): Promise<LiquidationResult> {
    // For TWAP, we'll use many small intervals
    const intervals = Math.min(duration / 60, 100); // One swap per minute, max 100
    
    logger.info(`Starting TWAP: ${intervals} swaps over ${duration}s`);
    
    // Use DCA implementation with many intervals for TWAP
    return this.executeDCASwap(
      inputMint,
      inputAmount,
      minOutputAmount,
      duration,
      intervals,
      maxSlippageBps
    );
  }
  
  /**
   * Get Jupiter quote
   */
  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number
  ): Promise<any> {
    try {
      const response = await axios.get(`${JUPITER_API_URL}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps,
          onlyDirectRoutes: false,
          asLegacyTransaction: false,
        },
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get Jupiter quote:', error);
      return null;
    }
  }
  
  /**
   * Get Jupiter swap transaction
   */
  private async getJupiterSwapTransaction(quote: any): Promise<any> {
    try {
      const response = await axios.post(`${JUPITER_API_URL}/swap`, {
        quoteResponse: quote,
        userPublicKey: this.programWallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        computeUnitPriceMicroLamports: 'auto',
        prioritizationFeeLamports: 'auto',
      });
      
      return response.data;
    } catch (error) {
      logger.error('Failed to get Jupiter swap transaction:', error);
      throw error;
    }
  }
  
  /**
   * Get position value in USD
   */
  private async getPositionValue(
    mint: PublicKey,
    amount: BN
  ): Promise<number> {
    try {
      const response = await axios.get(`${JUPITER_PRICE_API}/price`, {
        params: {
          ids: mint.toBase58(),
        },
      });
      
      const price = response.data.data[mint.toBase58()]?.price || 0;
      return (amount.toNumber() / 1e9) * price; // Assuming 9 decimals
      
    } catch (error) {
      logger.error('Failed to get position value:', error);
      return 0;
    }
  }
  
  /**
   * Distribute liquidation profits
   */
  private async distributeProfits(profit: BN): Promise<void> {
    // 50% to insurance fund
    const insuranceAmount = profit.div(new BN(2));
    
    // 30% to treasury
    const treasuryAmount = profit.mul(new BN(30)).div(new BN(100));
    
    // 20% for CRED token buyback
    const buybackAmount = profit.sub(insuranceAmount).sub(treasuryAmount);
    
    logger.info(`Profit distribution:
      Insurance: ${insuranceAmount}
      Treasury: ${treasuryAmount}
      Buyback: ${buybackAmount}
    `);
    
    // TODO: Implement actual transfers to respective accounts
  }
  
  /**
   * Monitor positions for liquidation opportunities
   */
  async monitorPositions(): Promise<void> {
    logger.info('Starting position monitoring...');
    
    // This would run continuously in production
    setInterval(async () => {
      try {
        // TODO: Fetch all positions from on-chain
        // TODO: Check health factors
        // TODO: Trigger liquidations as needed
        
        logger.debug('Position check complete');
      } catch (error) {
        logger.error('Position monitoring error:', error);
      }
    }, 30000); // Check every 30 seconds
  }
} 