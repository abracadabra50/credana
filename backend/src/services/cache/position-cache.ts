import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { recordMetrics } from '../../utils/metrics';

// Position data structure for caching
export interface CachedPosition {
  userId: string;
  walletAddress: string;
  collateralAmount: number; // jitoSOL amount in base units (9 decimals)
  debtUsdc: number; // USDC debt in base units (6 decimals)
  borrowIndexSnapshot: number; // Ray precision
  lastUpdateSlot: number;
  creditLimit: number; // USDC credit limit (6 decimals)
  healthFactor: number; // Health factor in BPS (10000 = 100%)
  availableCredit: number; // Available credit in USDC (6 decimals)
  lastCacheUpdate: number; // Unix timestamp
  isHealthy: boolean; // Quick health check
}

// Cache configuration
const CACHE_CONFIG = {
  POSITION_PREFIX: 'position:',
  USER_WALLET_PREFIX: 'user_wallet:',
  HEALTH_FACTOR_PREFIX: 'hf:',
  CREDIT_LIMIT_PREFIX: 'credit:',
  
  // TTL settings (in seconds)
  POSITION_TTL: 3600, // 1 hour
  HEALTH_FACTOR_TTL: 300, // 5 minutes (more frequent updates)
  QUICK_LOOKUP_TTL: 1800, // 30 minutes
  
  // Performance thresholds
  MAX_CACHE_RESPONSE_MS: 50, // Target <50ms cache responses
  STALE_THRESHOLD_MS: 60000, // 1 minute stale threshold
};

export class PositionCacheService {
  /**
   * Get cached position by user ID with health factor calculation
   * CRITICAL: Must return in <50ms for authorization flow
   */
  async getPosition(userId: string): Promise<CachedPosition | null> {
    const startTime = Date.now();
    
    try {
      const cacheKey = `${CACHE_CONFIG.POSITION_PREFIX}${userId}`;
      const cachedData = await redis.get(cacheKey);
      
      const responseTime = Date.now() - startTime;
      recordMetrics('cache.position.response_time', responseTime, { hit: cachedData ? 'true' : 'false' });
      
      if (!cachedData) {
        logger.warn('Cache miss for position', { userId, responseTime });
        return null;
      }
      
      const position: CachedPosition = JSON.parse(cachedData);
      
      // Check if data is stale
      const age = Date.now() - position.lastCacheUpdate;
      if (age > CACHE_CONFIG.STALE_THRESHOLD_MS) {
        logger.warn('Stale position data detected', { userId, ageMs: age });
        recordMetrics('cache.position.stale', 1, { userId });
      }
      
      // Log slow cache responses
      if (responseTime > CACHE_CONFIG.MAX_CACHE_RESPONSE_MS) {
        logger.warn('Slow cache response', { userId, responseTime });
      }
      
      logger.debug('Position cache hit', { userId, responseTime, healthFactor: position.healthFactor });
      return position;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Position cache error', { userId, error, responseTime });
      recordMetrics('cache.position.error', 1, { userId });
      return null;
    }
  }

  /**
   * Get position by wallet address (for webhook lookups)
   */
  async getPositionByWallet(walletAddress: string): Promise<CachedPosition | null> {
    const startTime = Date.now();
    
    try {
      // First get userId from wallet mapping
      const userIdKey = `${CACHE_CONFIG.USER_WALLET_PREFIX}${walletAddress}`;
      const userId = await redis.get(userIdKey);
      
      if (!userId) {
        recordMetrics('cache.wallet_lookup.miss', 1, { wallet: walletAddress });
        return null;
      }
      
      // Then get position by userId
      const position = await this.getPosition(userId);
      
      const responseTime = Date.now() - startTime;
      recordMetrics('cache.wallet_lookup.response_time', responseTime);
      
      return position;
      
    } catch (error) {
      logger.error('Wallet lookup cache error', { walletAddress, error });
      return null;
    }
  }

  /**
   * Cache position data with multiple indexes for fast lookup
   */
  async setPosition(position: CachedPosition): Promise<void> {
    const startTime = Date.now();
    
    try {
      const positionKey = `${CACHE_CONFIG.POSITION_PREFIX}${position.userId}`;
      const walletKey = `${CACHE_CONFIG.USER_WALLET_PREFIX}${position.walletAddress}`;
      const healthFactorKey = `${CACHE_CONFIG.HEALTH_FACTOR_PREFIX}${position.userId}`;
      const creditLimitKey = `${CACHE_CONFIG.CREDIT_LIMIT_PREFIX}${position.userId}`;
      
      // Update cache timestamp
      position.lastCacheUpdate = Date.now();
      
      // Use pipeline for atomic updates
      const pipeline = redis.pipeline();
      
      // Store main position data
      pipeline.setex(positionKey, CACHE_CONFIG.POSITION_TTL, JSON.stringify(position));
      
      // Store wallet-to-userId mapping
      pipeline.setex(walletKey, CACHE_CONFIG.QUICK_LOOKUP_TTL, position.userId);
      
      // Store quick lookup values for authorization
      pipeline.setex(healthFactorKey, CACHE_CONFIG.HEALTH_FACTOR_TTL, position.healthFactor.toString());
      pipeline.setex(creditLimitKey, CACHE_CONFIG.HEALTH_FACTOR_TTL, position.availableCredit.toString());
      
      await pipeline.exec();
      
      const responseTime = Date.now() - startTime;
      recordMetrics('cache.position.write_time', responseTime);
      
      logger.debug('Position cached successfully', { 
        userId: position.userId, 
        responseTime,
        healthFactor: position.healthFactor 
      });
      
    } catch (error) {
      logger.error('Position cache write error', { userId: position.userId, error });
      recordMetrics('cache.position.write_error', 1, { userId: position.userId });
      throw error;
    }
  }

  /**
   * Quick health factor check for authorization (fastest possible lookup)
   * Target: <10ms response time
   */
  async getHealthFactor(userId: string): Promise<number | null> {
    const startTime = Date.now();
    
    try {
      const healthFactorKey = `${CACHE_CONFIG.HEALTH_FACTOR_PREFIX}${userId}`;
      const healthFactorStr = await redis.get(healthFactorKey);
      
      const responseTime = Date.now() - startTime;
      recordMetrics('cache.health_factor.response_time', responseTime);
      
      if (!healthFactorStr) {
        // Fallback to full position lookup if health factor cache miss
        const position = await this.getPosition(userId);
        return position?.healthFactor || null;
      }
      
      const healthFactor = parseInt(healthFactorStr);
      
      if (responseTime > 10) {
        logger.warn('Slow health factor lookup', { userId, responseTime });
      }
      
      return healthFactor;
      
    } catch (error) {
      logger.error('Health factor cache error', { userId, error });
      return null;
    }
  }

  /**
   * Quick available credit check for authorization
   */
  async getAvailableCredit(userId: string): Promise<number | null> {
    try {
      const creditKey = `${CACHE_CONFIG.CREDIT_LIMIT_PREFIX}${userId}`;
      const creditStr = await redis.get(creditKey);
      
      if (!creditStr) {
        // Fallback to full position lookup
        const position = await this.getPosition(userId);
        return position?.availableCredit || null;
      }
      
      return parseInt(creditStr);
      
    } catch (error) {
      logger.error('Available credit cache error', { userId, error });
      return null;
    }
  }

  /**
   * Batch cache multiple positions (for cache warming)
   */
  async setPositions(positions: CachedPosition[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      const pipeline = redis.pipeline();
      
      for (const position of positions) {
        const positionKey = `${CACHE_CONFIG.POSITION_PREFIX}${position.userId}`;
        const walletKey = `${CACHE_CONFIG.USER_WALLET_PREFIX}${position.walletAddress}`;
        const healthFactorKey = `${CACHE_CONFIG.HEALTH_FACTOR_PREFIX}${position.userId}`;
        const creditLimitKey = `${CACHE_CONFIG.CREDIT_LIMIT_PREFIX}${position.userId}`;
        
        position.lastCacheUpdate = Date.now();
        
        pipeline.setex(positionKey, CACHE_CONFIG.POSITION_TTL, JSON.stringify(position));
        pipeline.setex(walletKey, CACHE_CONFIG.QUICK_LOOKUP_TTL, position.userId);
        pipeline.setex(healthFactorKey, CACHE_CONFIG.HEALTH_FACTOR_TTL, position.healthFactor.toString());
        pipeline.setex(creditLimitKey, CACHE_CONFIG.HEALTH_FACTOR_TTL, position.availableCredit.toString());
      }
      
      await pipeline.exec();
      
      const responseTime = Date.now() - startTime;
      recordMetrics('cache.batch_write.response_time', responseTime);
      recordMetrics('cache.batch_write.count', positions.length);
      
      logger.info('Batch cache write completed', { 
        count: positions.length, 
        responseTime 
      });
      
    } catch (error) {
      logger.error('Batch cache write error', { count: positions.length, error });
      throw error;
    }
  }

  /**
   * Remove position from cache
   */
  async deletePosition(userId: string, walletAddress?: string): Promise<void> {
    try {
      const keys = [
        `${CACHE_CONFIG.POSITION_PREFIX}${userId}`,
        `${CACHE_CONFIG.HEALTH_FACTOR_PREFIX}${userId}`,
        `${CACHE_CONFIG.CREDIT_LIMIT_PREFIX}${userId}`,
      ];
      
      if (walletAddress) {
        keys.push(`${CACHE_CONFIG.USER_WALLET_PREFIX}${walletAddress}`);
      }
      
      await redis.del(...keys);
      
      logger.debug('Position cache cleared', { userId });
      
    } catch (error) {
      logger.error('Position cache delete error', { userId, error });
      throw error;
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<any> {
    try {
      const info = await redis.info('memory');
      const keyCount = await redis.dbsize();
      
      return {
        keyCount,
        memoryInfo: info,
        timestamp: Date.now()
      };
      
    } catch (error) {
      logger.error('Cache stats error', { error });
      return null;
    }
  }

  /**
   * Warm cache with active positions
   */
  async warmCache(positions: CachedPosition[]): Promise<void> {
    logger.info('Starting cache warming', { count: positions.length });
    
    const startTime = Date.now();
    await this.setPositions(positions);
    const duration = Date.now() - startTime;
    
    recordMetrics('cache.warm.duration', duration);
    recordMetrics('cache.warm.count', positions.length);
    
    logger.info('Cache warming completed', { 
      count: positions.length, 
      duration 
    });
  }
}

// Export singleton instance
export const positionCache = new PositionCacheService(); 