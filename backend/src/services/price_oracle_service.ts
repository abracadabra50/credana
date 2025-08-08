import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import BN from 'bn.js';
import { logger } from '../utils/logger';

// GeckoTerminal API configuration
const GECKO_API_BASE = 'https://api.geckoterminal.com/api/v2';
const GECKO_RATE_LIMIT_MS = 2000; // 30 calls per minute

// Pyth Network price feed addresses (Mainnet)
const PYTH_PRICE_FEEDS: Record<string, string> = {
  'SOL/USD': 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG',
  'BTC/USD': 'GVXRSBjFk6e6J3NbVPXohDJetcTjaeeuykUpbQF8UoMU',
  'ETH/USD': 'JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB',
  'USDC/USD': 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
  'USDT/USD': '3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL',
  'mSOL/USD': 'E4v1BBgoso9s64TQvmyownAVJbhbEPGyzA3qn4n46qj9',
  'jitoSOL/USD': '7yyaeuJ1GGtVBLT2z2xub5ZWYKaNhF28mj1RdV4VDFVk',
  'BONK/USD': '8ihFLu5FimgTQ1Unh4dVyEHUGodJ5gJQCrQf4KUVB9bN',
  'WIF/USD': 'EhYXq3ANp5nAerUpbSgd7VK2RRcxK1zNuSQ755G5Mtxx',
};

interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  confidence: number;
  source: 'pyth' | 'gecko' | 'fallback';
  timestamp: number;
  volume24h?: number;
  priceChange24h?: number;
  marketCap?: number;
}

interface PoolPrice {
  poolAddress: string;
  dex: string;
  baseToken: TokenPrice;
  quoteToken: TokenPrice;
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  priceImpact?: Record<string, number>; // amount -> impact percentage
}

export class PriceOracleService {
  private priceCache: Map<string, TokenPrice> = new Map();
  private poolCache: Map<string, PoolPrice> = new Map();
  private lastGeckoCall: number = 0;
  private readonly CACHE_DURATION_MS = 30000; // 30 seconds cache
  
  constructor(
    private connection: Connection
  ) {}

  /**
   * Get token price with fallback mechanisms
   */
  async getTokenPrice(
    tokenAddress: string,
    symbol?: string
  ): Promise<TokenPrice> {
    try {
      // Check cache first
      const cacheKey = tokenAddress.toLowerCase();
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached;
      }

      // Try Pyth first for major tokens
      const pythPrice = await this.getPythPrice(tokenAddress, symbol);
      if (pythPrice) {
        this.priceCache.set(cacheKey, pythPrice);
        return pythPrice;
      }

      // Fall back to GeckoTerminal
      const geckoPrice = await this.getGeckoPrice(tokenAddress, symbol);
      if (geckoPrice) {
        this.priceCache.set(cacheKey, geckoPrice);
        return geckoPrice;
      }

      // Last resort: hardcoded fallback
      return this.getFallbackPrice(tokenAddress, symbol);
    } catch (error) {
      logger.error(`Error getting token price for ${tokenAddress}:`, error);
      return this.getFallbackPrice(tokenAddress, symbol);
    }
  }

  /**
   * Get multiple token prices in batch
   */
  async getBatchTokenPrices(
    tokens: Array<{ address: string; symbol?: string }>
  ): Promise<Map<string, TokenPrice>> {
    const prices = new Map<string, TokenPrice>();
    
    // Separate cached and uncached tokens
    const uncachedTokens: typeof tokens = [];
    
    for (const token of tokens) {
      const cached = this.priceCache.get(token.address.toLowerCase());
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        prices.set(token.address, cached);
      } else {
        uncachedTokens.push(token);
      }
    }
    
    if (uncachedTokens.length === 0) {
      return prices;
    }
    
    // Batch fetch from GeckoTerminal (supports up to 30 addresses)
    const batches = this.chunkArray(uncachedTokens, 30);
    
    for (const batch of batches) {
      await this.rateLimitGecko();
      
      try {
        const addresses = batch.map(t => t.address).join(',');
        const response = await axios.get(
          `${GECKO_API_BASE}/simple_token_price/solana`,
          {
            params: {
              token_addresses: addresses,
              vs_currencies: 'usd',
              include_market_cap: true,
              include_24hr_vol: true,
              include_24hr_change: true
            }
          }
        );
        
        const data = response.data?.data?.attributes?.token_prices || {};
        
        for (const token of batch) {
          const priceData = data[token.address.toLowerCase()];
          if (priceData) {
            const tokenPrice: TokenPrice = {
              symbol: token.symbol || 'Unknown',
              address: token.address,
              price: priceData.price_usd || 0,
              confidence: 0.99, // GeckoTerminal is generally reliable
              source: 'gecko',
              timestamp: Date.now(),
              volume24h: priceData.total_volume || 0,
              priceChange24h: priceData.price_change_percentage_24h || 0,
              marketCap: priceData.market_cap || 0
            };
            
            prices.set(token.address, tokenPrice);
            this.priceCache.set(token.address.toLowerCase(), tokenPrice);
          }
        }
      } catch (error) {
        logger.error('Error batch fetching prices:', error);
      }
    }
    
    // Fill in any missing prices with fallbacks
    for (const token of uncachedTokens) {
      if (!prices.has(token.address)) {
        const fallback = this.getFallbackPrice(token.address, token.symbol);
        prices.set(token.address, fallback);
      }
    }
    
    return prices;
  }

  /**
   * Get pool information and pricing
   */
  async getPoolPrice(poolAddress: string): Promise<PoolPrice | null> {
    try {
      // Check cache
      const cached = this.poolCache.get(poolAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached;
      }
      
      await this.rateLimitGecko();
      
      const response = await axios.get(
        `${GECKO_API_BASE}/networks/solana/pools/${poolAddress}`
      );
      
      const data = response.data?.data;
      if (!data) return null;
      
      const attributes = data.attributes;
      const relationships = data.relationships;
      
      const poolPrice: PoolPrice = {
        poolAddress,
        dex: relationships?.dex?.data?.id || 'unknown',
        baseToken: {
          symbol: attributes.base_token_symbol,
          address: relationships.base_token?.data?.id?.split('_')[1] || '',
          price: parseFloat(attributes.base_token_price_usd || '0'),
          confidence: 0.99,
          source: 'gecko',
          timestamp: Date.now()
        },
        quoteToken: {
          symbol: attributes.quote_token_symbol,
          address: relationships.quote_token?.data?.id?.split('_')[1] || '',
          price: parseFloat(attributes.quote_token_price_usd || '0'),
          confidence: 0.99,
          source: 'gecko',
          timestamp: Date.now()
        },
        priceUsd: parseFloat(attributes.base_token_price_usd || '0'),
        liquidity: parseFloat(attributes.reserve_in_usd || '0'),
        volume24h: parseFloat(attributes.volume_usd?.h24 || '0'),
        priceImpact: this.calculatePriceImpact(
          parseFloat(attributes.reserve_in_usd || '0')
        )
      };
      
      this.poolCache.set(poolAddress, poolPrice);
      return poolPrice;
    } catch (error) {
      logger.error(`Error fetching pool price for ${poolAddress}:`, error);
      return null;
    }
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit: number = 10): Promise<TokenPrice[]> {
    try {
      await this.rateLimitGecko();
      
      const response = await axios.get(
        `${GECKO_API_BASE}/networks/solana/tokens/trending`,
        {
          params: { limit }
        }
      );
      
      const tokens: TokenPrice[] = [];
      const data = response.data?.data || [];
      
      for (const item of data) {
        const attr = item.attributes;
        tokens.push({
          symbol: attr.symbol,
          address: attr.address,
          price: parseFloat(attr.price_usd || '0'),
          confidence: 0.99,
          source: 'gecko',
          timestamp: Date.now(),
          volume24h: parseFloat(attr.volume_usd?.h24 || '0'),
          priceChange24h: parseFloat(attr.price_change_percentage?.h24 || '0'),
          marketCap: parseFloat(attr.market_cap_usd || '0')
        });
      }
      
      return tokens;
    } catch (error) {
      logger.error('Error fetching trending tokens:', error);
      return [];
    }
  }

  /**
   * Get new token listings
   */
  async getNewListings(hours: number = 24): Promise<TokenPrice[]> {
    try {
      await this.rateLimitGecko();
      
      const response = await axios.get(
        `${GECKO_API_BASE}/networks/solana/new_pools`,
        {
          params: { 
            include: 'base_token,quote_token',
            'filter[pool_created_at]': `gt_${Date.now() - hours * 3600 * 1000}`
          }
        }
      );
      
      const tokens: TokenPrice[] = [];
      const seen = new Set<string>();
      const data = response.data?.data || [];
      
      for (const pool of data) {
        const baseToken = pool.relationships?.base_token?.data;
        if (baseToken && !seen.has(baseToken.id)) {
          seen.add(baseToken.id);
          const attr = baseToken.attributes;
          tokens.push({
            symbol: attr.symbol,
            address: baseToken.id.split('_')[1],
            price: parseFloat(attr.price_usd || '0'),
            confidence: 0.95, // Lower confidence for new tokens
            source: 'gecko',
            timestamp: Date.now(),
            volume24h: parseFloat(attr.volume_usd?.h24 || '0'),
            priceChange24h: parseFloat(attr.price_change_percentage?.h24 || '0'),
            marketCap: parseFloat(attr.market_cap_usd || '0')
          });
        }
      }
      
      return tokens;
    } catch (error) {
      logger.error('Error fetching new listings:', error);
      return [];
    }
  }

  /**
   * Get Pyth price for major tokens
   */
  private async getPythPrice(
    tokenAddress: string,
    symbol?: string
  ): Promise<TokenPrice | null> {
    try {
      // Map token to Pyth feed
      const feedAddress = this.getPythFeedAddress(tokenAddress, symbol);
      if (!feedAddress) return null;
      
      // Fetch price from Pyth (simplified - in production use Pyth SDK)
      const account = await this.connection.getAccountInfo(new PublicKey(feedAddress));
      if (!account) return null;
      
      // Parse Pyth price data (simplified structure)
      // In production, use @pythnetwork/client SDK
      const price = this.parsePythPriceData(account.data);
      
      if (price) {
        return {
          symbol: symbol || 'Unknown',
          address: tokenAddress,
          price: price.price,
          confidence: price.confidence,
          source: 'pyth',
          timestamp: Date.now()
        };
      }
      
      return null;
    } catch (error) {
      logger.debug(`Pyth price not available for ${tokenAddress}`);
      return null;
    }
  }

  /**
   * Get price from GeckoTerminal
   */
  private async getGeckoPrice(
    tokenAddress: string,
    symbol?: string
  ): Promise<TokenPrice | null> {
    try {
      await this.rateLimitGecko();
      
      const response = await axios.get(
        `${GECKO_API_BASE}/networks/solana/tokens/${tokenAddress}`,
        {
          params: {
            include: 'top_pools'
          }
        }
      );
      
      const data = response.data?.data?.attributes;
      if (!data) return null;
      
      return {
        symbol: data.symbol || symbol || 'Unknown',
        address: tokenAddress,
        price: parseFloat(data.price_usd || '0'),
        confidence: 0.99,
        source: 'gecko',
        timestamp: Date.now(),
        volume24h: parseFloat(data.volume_usd?.h24 || '0'),
        priceChange24h: parseFloat(data.price_change_percentage?.h24 || '0'),
        marketCap: parseFloat(data.market_cap_usd || data.fdv_usd || '0')
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.debug(`Token not found on GeckoTerminal: ${tokenAddress}`);
      } else {
        logger.error(`Error fetching GeckoTerminal price for ${tokenAddress}:`, error);
      }
      return null;
    }
  }

  /**
   * Get fallback price for common tokens
   */
  private getFallbackPrice(tokenAddress: string, symbol?: string): TokenPrice {
    const fallbackPrices: Record<string, number> = {
      'So11111111111111111111111111111111111111112': 100, // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1, // USDT
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 110, // mSOL
      'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 105, // jitoSOL
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 0.00003, // BONK
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 2.5, // WIF
    };
    
    const price = fallbackPrices[tokenAddress] || 0;
    
    return {
      symbol: symbol || 'Unknown',
      address: tokenAddress,
      price,
      confidence: 0.5, // Low confidence for fallback
      source: 'fallback',
      timestamp: Date.now()
    };
  }

  /**
   * Map token address to Pyth price feed
   */
  private getPythFeedAddress(tokenAddress: string, symbol?: string): string | null {
    // Direct mapping for known tokens
    const directMapping: Record<string, string> = {
      'So11111111111111111111111111111111111111112': PYTH_PRICE_FEEDS['SOL/USD'],
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': PYTH_PRICE_FEEDS['USDC/USD'],
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': PYTH_PRICE_FEEDS['USDT/USD'],
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': PYTH_PRICE_FEEDS['mSOL/USD'],
      'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': PYTH_PRICE_FEEDS['jitoSOL/USD'],
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': PYTH_PRICE_FEEDS['BONK/USD'],
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': PYTH_PRICE_FEEDS['WIF/USD'],
    };
    
    if (directMapping[tokenAddress]) {
      return directMapping[tokenAddress];
    }
    
    // Try symbol-based mapping
    if (symbol) {
      const feedKey = `${symbol.toUpperCase()}/USD`;
      return PYTH_PRICE_FEEDS[feedKey] || null;
    }
    
    return null;
  }

  /**
   * Parse Pyth price data (simplified)
   */
  private parsePythPriceData(data: Buffer): { price: number; confidence: number } | null {
    try {
      // This is a simplified version
      // In production, use @pythnetwork/client SDK for proper parsing
      
      // Pyth price account structure (simplified)
      // Offset 208: price (i64)
      // Offset 216: confidence (u64)
      // Offset 224: exponent (i32)
      
      if (data.length < 228) return null;
      
      const price = data.readBigInt64LE(208);
      const confidence = data.readBigUInt64LE(216);
      const exponent = data.readInt32LE(224);
      
      const scaleFactor = Math.pow(10, Math.abs(exponent));
      
      return {
        price: Number(price) / scaleFactor,
        confidence: Number(confidence) / scaleFactor / Number(price)
      };
    } catch (error) {
      logger.error('Error parsing Pyth price data:', error);
      return null;
    }
  }

  /**
   * Calculate price impact for different trade sizes
   */
  private calculatePriceImpact(liquidityUsd: number): Record<string, number> {
    // Simplified price impact calculation
    // In reality, this depends on the AMM curve and current reserves
    
    const impacts: Record<string, number> = {};
    const tradeSizes = [100, 1000, 10000, 100000, 1000000];
    
    for (const size of tradeSizes) {
      // Simple square root model for price impact
      // Impact = k * sqrt(tradeSize / liquidity)
      const k = 2; // Impact coefficient
      impacts[size.toString()] = k * Math.sqrt(size / liquidityUsd);
    }
    
    return impacts;
  }

  /**
   * Rate limiting for GeckoTerminal API
   */
  private async rateLimitGecko(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastGeckoCall;
    
    if (timeSinceLastCall < GECKO_RATE_LIMIT_MS) {
      await new Promise(resolve => 
        setTimeout(resolve, GECKO_RATE_LIMIT_MS - timeSinceLastCall)
      );
    }
    
    this.lastGeckoCall = Date.now();
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Clear price caches
   */
  clearCache(): void {
    this.priceCache.clear();
    this.poolCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    tokenPrices: number;
    pools: number;
    oldestEntry: number | null;
  } {
    let oldestTimestamp: number | null = null;
    
    for (const entry of this.priceCache.values()) {
      if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }
    
    return {
      tokenPrices: this.priceCache.size,
      pools: this.poolCache.size,
      oldestEntry: oldestTimestamp
    };
  }
} 