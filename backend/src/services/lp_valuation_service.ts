import { Connection, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import axios from 'axios';
import Decimal from 'decimal.js';
import DLMM from '@meteora-ag/dlmm';
import { Raydium } from '@raydium-io/raydium-sdk-v2';
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from '@orca-so/whirlpools-sdk';
import { KaminoMarket } from '@kamino-finance/klend-sdk';
import { logger } from '../utils/logger';

// GeckoTerminal API configuration
const GECKO_API_BASE = 'https://api.geckoterminal.com/api/v2';
const GECKO_RATE_LIMIT_MS = 2000; // 30 calls per minute = 1 call per 2 seconds

interface LPPosition {
  protocol: 'meteora' | 'raydium' | 'orca' | 'kamino';
  poolAddress: PublicKey;
  token0: TokenInfo;
  token1: TokenInfo;
  totalValueUSD: number;
  userSharePercent: number;
  reserves: PoolReserves;
  apy: number;
  fees24h: number;
  volume24h: number;
  impermanentLoss?: number;
}

interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  decimals: number;
  amount: BN;
  valueUSD: number;
  price: number;
}

interface PoolReserves {
  token0Amount: BN;
  token1Amount: BN;
  totalSupply: BN;
  reserveUSD: number;
}

export class LPValuationService {
  private lastGeckoCall: number = 0;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION_MS = 60000; // 1 minute cache

  constructor(
    private connection: Connection
  ) {}

  /**
   * Get LP position value across all supported protocols
   */
  async getLPValue(
    lpMint: PublicKey, 
    userBalance: BN, 
    poolAddress?: PublicKey
  ): Promise<LPPosition | null> {
    try {
      // Try to identify the protocol
      const protocol = await this.identifyProtocol(poolAddress || lpMint);
      
      switch (protocol) {
        case 'meteora':
          return await this.getMeteoraLPValue(lpMint, userBalance, poolAddress!);
        case 'raydium':
          return await this.getRaydiumLPValue(lpMint, userBalance, poolAddress!);
        case 'orca':
          return await this.getOrcaLPValue(lpMint, userBalance, poolAddress!);
        case 'kamino':
          return await this.getKaminoLPValue(lpMint, userBalance, poolAddress!);
        default:
          logger.warn(`Unknown LP protocol for mint ${lpMint.toString()}`);
          return null;
      }
    } catch (error) {
      logger.error('Error getting LP value:', error);
      return null;
    }
  }

  /**
   * Get Meteora DLMM LP position value
   */
  private async getMeteoraLPValue(
    lpMint: PublicKey, 
    userBalance: BN, 
    poolAddress: PublicKey
  ): Promise<LPPosition | null> {
    try {
      // Initialize Meteora DLMM pool
      const dlmmPool = await DLMM.create(this.connection, poolAddress);
      
      // Get pool state
      const activeBin = await dlmmPool.getActiveBin();
      const poolState = dlmmPool.lbPair;
      
      // Get token info
      const tokenX = dlmmPool.tokenX;
      const tokenY = dlmmPool.tokenY;
      
      // Get user's position
      const userPositions = await dlmmPool.getPositionsByUserAndLbPair(
        new PublicKey('11111111111111111111111111111111') // Placeholder - should be user's wallet
      );
      
      // Calculate reserves
      const reserveX = poolState.reserveX;
      const reserveY = poolState.reserveY;
      const lpSupply = poolState.lpSupply;
      
      // Get token prices from GeckoTerminal
      const [priceX, priceY] = await Promise.all([
        this.getTokenPrice(tokenX.publicKey.toString()),
        this.getTokenPrice(tokenY.publicKey.toString())
      ]);
      
      // Calculate user's share
      const userSharePercent = userBalance.mul(new BN(10000)).div(lpSupply).toNumber() / 100;
      const userTokenXAmount = reserveX.mul(userBalance).div(lpSupply);
      const userTokenYAmount = reserveY.mul(userBalance).div(lpSupply);
      
      // Calculate USD values
      const tokenXValueUSD = this.calculateUSDValue(userTokenXAmount, priceX, tokenX.decimal);
      const tokenYValueUSD = this.calculateUSDValue(userTokenYAmount, priceY, tokenY.decimal);
      const totalValueUSD = tokenXValueUSD + tokenYValueUSD;
      
      // Get pool metrics from API
      const poolMetrics = await this.getPoolMetrics(poolAddress.toString());
      
      return {
        protocol: 'meteora',
        poolAddress,
        token0: {
          mint: tokenX.publicKey,
          symbol: tokenX.symbol || 'Unknown',
          decimals: tokenX.decimal,
          amount: userTokenXAmount,
          valueUSD: tokenXValueUSD,
          price: priceX
        },
        token1: {
          mint: tokenY.publicKey,
          symbol: tokenY.symbol || 'Unknown',
          decimals: tokenY.decimal,
          amount: userTokenYAmount,
          valueUSD: tokenYValueUSD,
          price: priceY
        },
        totalValueUSD,
        userSharePercent,
        reserves: {
          token0Amount: reserveX,
          token1Amount: reserveY,
          totalSupply: lpSupply,
          reserveUSD: poolMetrics?.reserveUSD || 0
        },
        apy: poolMetrics?.apy || 0,
        fees24h: poolMetrics?.fees24h || 0,
        volume24h: poolMetrics?.volume24h || 0
      };
    } catch (error) {
      logger.error('Error getting Meteora LP value:', error);
      return null;
    }
  }

  /**
   * Get Raydium LP position value
   */
  private async getRaydiumLPValue(
    lpMint: PublicKey, 
    userBalance: BN, 
    poolAddress: PublicKey
  ): Promise<LPPosition | null> {
    try {
      // Initialize Raydium SDK
      const raydium = await Raydium.load({
        connection: this.connection,
        owner: new PublicKey('11111111111111111111111111111111'), // System program as placeholder
        disableLoadToken: true
      });
      
      // Fetch pool info
      const poolInfo = await raydium.api.fetchPoolById({
        ids: poolAddress.toString()
      });
      
      if (!poolInfo || poolInfo.length === 0) {
        logger.warn(`Raydium pool not found: ${poolAddress.toString()}`);
        return null;
      }
      
      const pool = poolInfo[0];
      
      // Get token prices
      const [priceBase, priceQuote] = await Promise.all([
        this.getTokenPrice(pool.baseMint),
        this.getTokenPrice(pool.quoteMint)
      ]);
      
      // Calculate user's share
      const lpSupply = new BN(pool.lpAmount || '0');
      const userSharePercent = lpSupply.gt(new BN(0)) 
        ? userBalance.mul(new BN(10000)).div(lpSupply).toNumber() / 100 
        : 0;
      
      const baseReserve = new BN(pool.baseReserve || '0');
      const quoteReserve = new BN(pool.quoteReserve || '0');
      
      const userBaseAmount = baseReserve.mul(userBalance).div(lpSupply);
      const userQuoteAmount = quoteReserve.mul(userBalance).div(lpSupply);
      
      // Calculate USD values
      const baseValueUSD = this.calculateUSDValue(userBaseAmount, priceBase, pool.baseDecimals);
      const quoteValueUSD = this.calculateUSDValue(userQuoteAmount, priceQuote, pool.quoteDecimals);
      const totalValueUSD = baseValueUSD + quoteValueUSD;
      
      return {
        protocol: 'raydium',
        poolAddress,
        token0: {
          mint: new PublicKey(pool.baseMint),
          symbol: pool.baseSymbol || 'Unknown',
          decimals: pool.baseDecimals,
          amount: userBaseAmount,
          valueUSD: baseValueUSD,
          price: priceBase
        },
        token1: {
          mint: new PublicKey(pool.quoteMint),
          symbol: pool.quoteSymbol || 'Unknown',
          decimals: pool.quoteDecimals,
          amount: userQuoteAmount,
          valueUSD: quoteValueUSD,
          price: priceQuote
        },
        totalValueUSD,
        userSharePercent,
        reserves: {
          token0Amount: baseReserve,
          token1Amount: quoteReserve,
          totalSupply: lpSupply,
          reserveUSD: pool.tvl || 0
        },
        apy: pool.apr || 0,
        fees24h: pool.fee24h || 0,
        volume24h: pool.volume24h || 0
      };
    } catch (error) {
      logger.error('Error getting Raydium LP value:', error);
      return null;
    }
  }

  /**
   * Get Orca Whirlpool LP position value
   */
  private async getOrcaLPValue(
    lpMint: PublicKey, 
    userBalance: BN, 
    poolAddress: PublicKey
  ): Promise<LPPosition | null> {
    try {
      // Initialize Orca Whirlpools SDK
      const ctx = WhirlpoolContext.from(
        this.connection,
        new PublicKey('11111111111111111111111111111111'), // System program as placeholder
        ORCA_WHIRLPOOL_PROGRAM_ID
      );
      
      const client = buildWhirlpoolClient(ctx);
      const whirlpool = await client.getPool(poolAddress);
      
      if (!whirlpool) {
        logger.warn(`Orca pool not found: ${poolAddress.toString()}`);
        return null;
      }
      
      const data = whirlpool.getData();
      
      // Get token info
      const tokenA = whirlpool.getTokenAInfo();
      const tokenB = whirlpool.getTokenBInfo();
      
      // Get token prices
      const [priceA, priceB] = await Promise.all([
        this.getTokenPrice(tokenA.mint.toString()),
        this.getTokenPrice(tokenB.mint.toString())
      ]);
      
      // Calculate reserves (simplified - Orca uses concentrated liquidity)
      const currentPrice = whirlpool.getData().sqrtPrice;
      const price = Math.pow(currentPrice.toNumber() / Math.pow(2, 64), 2);
      
      // This is a simplified calculation - real Orca positions are more complex
      const totalLiquidity = data.liquidity;
      const userLiquidity = totalLiquidity.mul(userBalance).div(new BN(1e9)); // Simplified
      
      // Estimate token amounts based on current price
      const userTokenAAmount = userLiquidity.div(new BN(Math.sqrt(price) * 1e9));
      const userTokenBAmount = userLiquidity.mul(new BN(Math.sqrt(price) * 1e9)).div(new BN(1e18));
      
      // Calculate USD values
      const tokenAValueUSD = this.calculateUSDValue(userTokenAAmount, priceA, tokenA.decimals);
      const tokenBValueUSD = this.calculateUSDValue(userTokenBAmount, priceB, tokenB.decimals);
      const totalValueUSD = tokenAValueUSD + tokenBValueUSD;
      
      // Get pool metrics
      const poolMetrics = await this.getPoolMetrics(poolAddress.toString());
      
      return {
        protocol: 'orca',
        poolAddress,
        token0: {
          mint: tokenA.mint,
          symbol: 'Token A', // Would need to fetch from token list
          decimals: tokenA.decimals,
          amount: userTokenAAmount,
          valueUSD: tokenAValueUSD,
          price: priceA
        },
        token1: {
          mint: tokenB.mint,
          symbol: 'Token B', // Would need to fetch from token list
          decimals: tokenB.decimals,
          amount: userTokenBAmount,
          valueUSD: tokenBValueUSD,
          price: priceB
        },
        totalValueUSD,
        userSharePercent: 0, // Complex to calculate for concentrated liquidity
        reserves: {
          token0Amount: new BN(0), // Would need complex calculation
          token1Amount: new BN(0), // Would need complex calculation
          totalSupply: totalLiquidity,
          reserveUSD: poolMetrics?.reserveUSD || 0
        },
        apy: poolMetrics?.apy || 0,
        fees24h: poolMetrics?.fees24h || 0,
        volume24h: poolMetrics?.volume24h || 0
      };
    } catch (error) {
      logger.error('Error getting Orca LP value:', error);
      return null;
    }
  }

  /**
   * Get Kamino vault position value
   */
  private async getKaminoLPValue(
    lpMint: PublicKey, 
    userBalance: BN, 
    poolAddress: PublicKey
  ): Promise<LPPosition | null> {
    try {
      // Initialize Kamino Market
      const kaminoMarket = await KaminoMarket.load(
        this.connection,
        poolAddress // This should be the market address
      );
      
      if (!kaminoMarket) {
        logger.warn(`Kamino market not found: ${poolAddress.toString()}`);
        return null;
      }
      
      // Get reserve info (simplified - Kamino has complex vault structures)
      const reserves = kaminoMarket.reserves;
      if (reserves.length === 0) {
        return null;
      }
      
      // For simplicity, assume it's a single-asset vault
      const reserve = reserves[0];
      const tokenMint = reserve.config.tokenInfo.mint;
      
      // Get token price
      const tokenPrice = await this.getTokenPrice(tokenMint.toString());
      
      // Calculate user's share
      const totalSupply = reserve.stats.totalDepositsWads;
      const userSharePercent = totalSupply.gt(new BN(0))
        ? userBalance.mul(new BN(10000)).div(totalSupply).toNumber() / 100
        : 0;
      
      // Calculate USD value
      const tokenValueUSD = this.calculateUSDValue(
        userBalance,
        tokenPrice,
        reserve.config.tokenInfo.decimals
      );
      
      return {
        protocol: 'kamino',
        poolAddress,
        token0: {
          mint: tokenMint,
          symbol: reserve.config.tokenInfo.symbol,
          decimals: reserve.config.tokenInfo.decimals,
          amount: userBalance,
          valueUSD: tokenValueUSD,
          price: tokenPrice
        },
        token1: {
          mint: tokenMint, // Same token for single-asset vault
          symbol: reserve.config.tokenInfo.symbol,
          decimals: reserve.config.tokenInfo.decimals,
          amount: new BN(0),
          valueUSD: 0,
          price: tokenPrice
        },
        totalValueUSD: tokenValueUSD,
        userSharePercent,
        reserves: {
          token0Amount: userBalance,
          token1Amount: new BN(0),
          totalSupply,
          reserveUSD: tokenValueUSD / userSharePercent * 100
        },
        apy: reserve.stats.supplyInterestAPY.toNumber(),
        fees24h: 0, // Would need to calculate
        volume24h: 0 // Would need to calculate
      };
    } catch (error) {
      logger.error('Error getting Kamino LP value:', error);
      return null;
    }
  }

  /**
   * Get token price from GeckoTerminal API
   */
  private async getTokenPrice(tokenAddress: string): Promise<number> {
    try {
      // Check cache first
      const cached = this.priceCache.get(tokenAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached.price;
      }
      
      // Rate limiting
      const now = Date.now();
      const timeSinceLastCall = now - this.lastGeckoCall;
      if (timeSinceLastCall < GECKO_RATE_LIMIT_MS) {
        await new Promise(resolve => setTimeout(resolve, GECKO_RATE_LIMIT_MS - timeSinceLastCall));
      }
      
      // Make API call
      const response = await axios.get(
        `${GECKO_API_BASE}/simple_token_price/solana`,
        {
          params: {
            token_addresses: tokenAddress,
            vs_currencies: 'usd'
          }
        }
      );
      
      this.lastGeckoCall = Date.now();
      
      const price = response.data?.data?.attributes?.token_prices?.[tokenAddress.toLowerCase()] || 0;
      
      // Update cache
      this.priceCache.set(tokenAddress, {
        price,
        timestamp: Date.now()
      });
      
      return price;
    } catch (error) {
      logger.error(`Error fetching token price for ${tokenAddress}:`, error);
      
      // Fallback prices for common tokens
      const fallbackPrices: Record<string, number> = {
        'So11111111111111111111111111111111111111112': 100, // SOL
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1, // USDT
      };
      
      return fallbackPrices[tokenAddress] || 0;
    }
  }

  /**
   * Get pool metrics from GeckoTerminal
   */
  private async getPoolMetrics(poolAddress: string): Promise<{
    reserveUSD: number;
    apy: number;
    fees24h: number;
    volume24h: number;
  } | null> {
    try {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastCall = now - this.lastGeckoCall;
      if (timeSinceLastCall < GECKO_RATE_LIMIT_MS) {
        await new Promise(resolve => setTimeout(resolve, GECKO_RATE_LIMIT_MS - timeSinceLastCall));
      }
      
      const response = await axios.get(
        `${GECKO_API_BASE}/networks/solana/pools/${poolAddress}`
      );
      
      this.lastGeckoCall = Date.now();
      
      const data = response.data?.data?.attributes;
      
      return {
        reserveUSD: parseFloat(data?.reserve_in_usd || '0'),
        apy: parseFloat(data?.apy || '0'),
        fees24h: parseFloat(data?.fee_24h || '0'),
        volume24h: parseFloat(data?.volume_usd?.h24 || '0')
      };
    } catch (error) {
      logger.error(`Error fetching pool metrics for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Calculate USD value from token amount
   */
  private calculateUSDValue(amount: BN, price: number, decimals: number): number {
    const divisor = new BN(10).pow(new BN(decimals));
    const value = new Decimal(amount.toString())
      .div(divisor.toString())
      .mul(price)
      .toNumber();
    return value;
  }

  /**
   * Identify which protocol a pool belongs to
   */
  private async identifyProtocol(poolOrMint: PublicKey): Promise<'meteora' | 'raydium' | 'orca' | 'kamino' | 'unknown'> {
    try {
      const account = await this.connection.getAccountInfo(poolOrMint);
      if (!account) return 'unknown';
      
      // Check program owners
      const programId = account.owner.toString();
      
      // Known program IDs
      const METEORA_DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';
      const RAYDIUM_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
      const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK';
      const ORCA_WHIRLPOOL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
      const KAMINO_LEND = 'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD';
      
      if (programId === METEORA_DLMM) return 'meteora';
      if (programId === RAYDIUM_AMM || programId === RAYDIUM_CLMM) return 'raydium';
      if (programId === ORCA_WHIRLPOOL) return 'orca';
      if (programId === KAMINO_LEND) return 'kamino';
      
      // Try to identify by account data structure (simplified)
      const dataLength = account.data.length;
      if (dataLength === 752) return 'raydium'; // Typical Raydium AMM account size
      if (dataLength === 1544) return 'orca'; // Typical Orca account size
      
      return 'unknown';
    } catch (error) {
      logger.error('Error identifying protocol:', error);
      return 'unknown';
    }
  }

  /**
   * Get risk parameters for an LP position
   */
  getLPRiskParameters(position: LPPosition): {
    maxLTV: number;
    liquidationThreshold: number;
    riskScore: number;
  } {
    // Base LTV for LP tokens
    let maxLTV = 0.5; // 50% base LTV
    let liquidationThreshold = 0.65; // 65% liquidation threshold
    let riskScore = 5; // Medium risk by default
    
    // Adjust based on protocol
    switch (position.protocol) {
      case 'meteora':
        maxLTV = 0.55; // Higher for concentrated liquidity
        liquidationThreshold = 0.70;
        riskScore = 4;
        break;
      case 'raydium':
        maxLTV = 0.50;
        liquidationThreshold = 0.65;
        riskScore = 5;
        break;
      case 'orca':
        maxLTV = 0.55;
        liquidationThreshold = 0.70;
        riskScore = 4;
        break;
      case 'kamino':
        maxLTV = 0.60; // Higher for managed vaults
        liquidationThreshold = 0.75;
        riskScore = 3;
        break;
    }
    
    // Adjust based on token composition
    const isStablePair = this.isStablecoin(position.token0.symbol) && 
                        this.isStablecoin(position.token1.symbol);
    const hasBlueChip = this.isBlueChip(position.token0.symbol) || 
                        this.isBlueChip(position.token1.symbol);
    
    if (isStablePair) {
      maxLTV += 0.15; // Boost for stable pairs
      liquidationThreshold += 0.10;
      riskScore = Math.max(1, riskScore - 2);
    } else if (hasBlueChip) {
      maxLTV += 0.05; // Small boost for blue chip
      liquidationThreshold += 0.05;
      riskScore = Math.max(2, riskScore - 1);
    }
    
    // Adjust based on pool metrics
    if (position.reserves.reserveUSD > 10000000) { // $10M+ liquidity
      maxLTV += 0.05;
      riskScore = Math.max(1, riskScore - 1);
    }
    
    // Cap values
    maxLTV = Math.min(0.80, maxLTV);
    liquidationThreshold = Math.min(0.90, liquidationThreshold);
    
    return {
      maxLTV,
      liquidationThreshold,
      riskScore
    };
  }

  private isStablecoin(symbol: string): boolean {
    const stables = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDH', 'PAI', 'USDD'];
    return stables.includes(symbol.toUpperCase());
  }

  private isBlueChip(symbol: string): boolean {
    const blueChips = ['SOL', 'BTC', 'ETH', 'wSOL', 'wBTC', 'wETH', 'stSOL', 'mSOL', 'jitoSOL'];
    return blueChips.includes(symbol);
  }
} 