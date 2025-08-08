import { logger } from '../../utils/logger';
import { positionCache, CachedPosition } from '../cache/position-cache';
import { recordMetrics } from '../../utils/metrics';

const BPS_PRECISION = 10_000;
const HEALTH_FACTOR_BUFFER_BPS = 1100; // 1.10 minimum HF for new debt

interface HealthFactorCheckParams {
  currentDebt: number;
  collateralAmount: number;
  collateralPrice: number;
  newDebtAmount: number;
  liquidationThreshold: number; // in basis points
}

interface AuthorizationDecision {
  approved: boolean;
  healthFactor: number;
  reason?: string;
  availableCredit?: number;
}

/**
 * Check if a new debt amount would maintain a healthy position
 * This is the CRITICAL function for card authorization decisions
 * Must execute in <10ms for sub-500ms total auth response
 */
export async function checkHealthFactor(
  params: HealthFactorCheckParams
): Promise<AuthorizationDecision> {
  try {
    const {
      currentDebt,
      collateralAmount,
      collateralPrice,
      newDebtAmount,
      liquidationThreshold,
    } = params;

    // Quick validation
    if (newDebtAmount <= 0) {
      return {
        approved: false,
        healthFactor: 0,
        reason: 'Invalid amount',
      };
    }

    // Calculate collateral value in USD
    // collateralAmount is in 9 decimals (SOL), convert to 6 decimals (USD)
    const collateralValueUSD = (collateralAmount * collateralPrice) / 1_000;

    // Calculate new total debt
    const newTotalDebt = currentDebt + newDebtAmount;

    // If no collateral, decline
    if (collateralValueUSD === 0) {
      return {
        approved: false,
        healthFactor: 0,
        reason: 'No collateral',
      };
    }

    // Calculate health factor after new debt
    // HF = (Collateral Value * Liquidation Threshold) / Total Debt
    const liquidationValue = (collateralValueUSD * liquidationThreshold) / BPS_PRECISION;
    const healthFactor = liquidationValue / newTotalDebt;

    // Convert to basis points for comparison
    const healthFactorBps = Math.floor(healthFactor * BPS_PRECISION);

    // Check if health factor meets minimum buffer
    if (healthFactorBps < HEALTH_FACTOR_BUFFER_BPS) {
      return {
        approved: false,
        healthFactor,
        reason: 'Insufficient collateral',
        availableCredit: calculateAvailableCreditInternal(
          collateralValueUSD,
          currentDebt,
          liquidationThreshold
        ),
      };
    }

    // Additional safety checks
    const maxLTV = 5000; // 50% max LTV from protocol
    const maxBorrowable = (collateralValueUSD * maxLTV) / BPS_PRECISION;
    
    if (newTotalDebt > maxBorrowable) {
      return {
        approved: false,
        healthFactor,
        reason: 'Exceeds max LTV',
        availableCredit: maxBorrowable - currentDebt,
      };
    }

    // Approved!
    return {
      approved: true,
      healthFactor,
      availableCredit: maxBorrowable - newTotalDebt,
    };

  } catch (error) {
    logger.error('Error in health factor check', { error, params });
    
    // On error, decline for safety
    return {
      approved: false,
      healthFactor: 0,
      reason: 'System error',
    };
  }
}

/**
 * Calculate available credit based on current position (internal helper)
 */
function calculateAvailableCreditInternal(
  collateralValueUSD: number,
  currentDebt: number,
  liquidationThreshold: number
): number {
  // Calculate max debt that maintains HF >= 1.10
  const maxDebtForBuffer = (collateralValueUSD * liquidationThreshold) / 
    (HEALTH_FACTOR_BUFFER_BPS);
  
  const availableCredit = maxDebtForBuffer - currentDebt;
  return Math.max(0, availableCredit);
}

/**
 * Quick validation for spending limits and merchant restrictions
 */
export function validateSpendingLimits(params: {
  amount: number;
  dailySpent: number;
  monthlySpent: number;
  dailyLimit: number;
  monthlyLimit: number;
  merchantCategory?: string;
}): { allowed: boolean; reason?: string } {
  const {
    amount,
    dailySpent,
    monthlySpent,
    dailyLimit,
    monthlyLimit,
    merchantCategory,
  } = params;

  // Check daily limit
  if (dailySpent + amount > dailyLimit) {
    return {
      allowed: false,
      reason: 'Daily spending limit exceeded',
    };
  }

  // Check monthly limit
  if (monthlySpent + amount > monthlyLimit) {
    return {
      allowed: false,
      reason: 'Monthly spending limit exceeded',
    };
  }

  // Check merchant restrictions (MVP: block crypto exchanges)
  const blockedCategories = ['crypto_exchange', 'gambling', 'cash_advance'];
  if (merchantCategory && blockedCategories.includes(merchantCategory)) {
    return {
      allowed: false,
      reason: 'Merchant category not allowed',
    };
  }

  return { allowed: true };
}

/**
 * Calculate the impact of a potential transaction on health factor
 * Useful for showing warnings in the UI
 */
export function calculateHealthFactorImpact(params: {
  currentDebt: number;
  collateralAmount: number;
  collateralPrice: number;
  transactionAmount: number;
  liquidationThreshold: number;
}): {
  currentHF: number;
  newHF: number;
  impact: number;
  riskLevel: 'safe' | 'warning' | 'danger';
} {
  const {
    currentDebt,
    collateralAmount,
    collateralPrice,
    transactionAmount,
    liquidationThreshold,
  } = params;

  // Calculate collateral value
  const collateralValueUSD = (collateralAmount * collateralPrice) / 1_000;
  const liquidationValue = (collateralValueUSD * liquidationThreshold) / BPS_PRECISION;

  // Current health factor
  const currentHF = currentDebt > 0 ? liquidationValue / currentDebt : 999;

  // New health factor after transaction
  const newDebt = currentDebt + transactionAmount;
  const newHF = newDebt > 0 ? liquidationValue / newDebt : 999;

  // Calculate impact
  const impact = currentHF - newHF;

  // Determine risk level
  let riskLevel: 'safe' | 'warning' | 'danger';
  if (newHF >= 2.0) {
    riskLevel = 'safe';
  } else if (newHF >= 1.5) {
    riskLevel = 'warning';
  } else {
    riskLevel = 'danger';
  }

  return {
    currentHF,
    newHF,
    impact,
    riskLevel,
  };
}

/**
 * Emergency circuit breaker checks
 * Additional safety layer for extreme conditions
 */
export function checkCircuitBreakers(params: {
  oracleStaleness: number; // seconds since last update
  networkCongestion: boolean;
  recentLiquidations: number; // count in last hour
}): { proceed: boolean; reason?: string } {
  const maxOracleStaleness = parseInt(process.env.ORACLE_MAX_STALENESS_SECONDS || '30');
  
  // Check oracle freshness
  if (params.oracleStaleness > maxOracleStaleness) {
    return {
      proceed: false,
      reason: 'Stale price data',
    };
  }

  // Check network conditions
  if (params.networkCongestion) {
    return {
      proceed: false,
      reason: 'Network congestion',
    };
  }

  // Check liquidation surge (potential market crash)
  if (params.recentLiquidations > 50) {
    return {
      proceed: false,
      reason: 'Market volatility',
    };
  }

  return { proceed: true };
}

/**
 * HIGH-PERFORMANCE cache-based authorization check for Stripe webhooks
 * CRITICAL: Must complete in <100ms for 500ms total webhook response
 * Uses Redis cache for fastest possible position lookups
 */
export async function checkAuthorizationCached(
  userId: string,
  authorizationAmount: number, // in cents
  walletAddress?: string
): Promise<{
  approved: boolean;
  healthFactor: number;
  availableCredit: number;
  reason?: string;
  responseTimeMs: number;
  cacheHit: boolean;
}> {
  const startTime = Date.now();
  
  try {
    // Get position from cache (target <10ms)
    let position: CachedPosition | null = null;
    let cacheHit = false;
    
    if (userId) {
      position = await positionCache.getPosition(userId);
      cacheHit = position !== null;
    } else if (walletAddress) {
      position = await positionCache.getPositionByWallet(walletAddress);
      cacheHit = position !== null;
    }
    
    const lookupTime = Date.now() - startTime;
    recordMetrics('auth.cache_lookup.response_time', lookupTime);
    
    if (!position) {
      logger.warn('Position not found in cache', { userId, walletAddress, lookupTime });
      return {
        approved: false,
        healthFactor: 0,
        availableCredit: 0,
        reason: 'Position not found',
        responseTimeMs: Date.now() - startTime,
        cacheHit: false
      };
    }
    
    // Quick validation checks
    if (authorizationAmount <= 0) {
      return {
        approved: false,
        healthFactor: position.healthFactor,
        availableCredit: position.availableCredit,
        reason: 'Invalid amount',
        responseTimeMs: Date.now() - startTime,
        cacheHit
      };
    }
    
    // Convert authorization amount from cents to USDC (6 decimals)
    const debtIncreaseUsdc = authorizationAmount * 10000; // cents to 6-decimal USDC
    
    // Check if amount exceeds available credit
    if (debtIncreaseUsdc > position.availableCredit) {
      recordMetrics('auth.decline.insufficient_credit', 1, { userId: position.userId });
      
      return {
        approved: false,
        healthFactor: position.healthFactor,
        availableCredit: position.availableCredit,
        reason: 'Insufficient available credit',
        responseTimeMs: Date.now() - startTime,
        cacheHit
      };
    }
    
    // Calculate new health factor after potential debt increase
    const newTotalDebt = position.debtUsdc + debtIncreaseUsdc;
    
    // Use cached collateral value (position should include current price calculation)
    // For now, approximate with stored collateral - in production, this would use current price
    const estimatedCollateralValue = position.collateralAmount * 200; // Approximate $200 jitoSOL
    const liquidationValue = (estimatedCollateralValue * 6000) / BPS_PRECISION; // 60% liquidation threshold
    
    const newHealthFactor = newTotalDebt > 0 
      ? (liquidationValue / newTotalDebt) * BPS_PRECISION 
      : BPS_PRECISION * 10;
    
    // Check minimum health factor buffer (110%)
    const isHealthy = newHealthFactor >= HEALTH_FACTOR_BUFFER_BPS;
    
    const responseTime = Date.now() - startTime;
    
    // Performance monitoring
    if (responseTime > 100) {
      logger.warn('Slow authorization check', { 
        userId: position.userId, 
        responseTime,
        authAmount: authorizationAmount 
      });
    }
    
    recordMetrics('auth.authorization.response_time', responseTime);
    recordMetrics('auth.authorization.decision', 1, { 
      approved: isHealthy ? 'true' : 'false',
      cache_hit: cacheHit ? 'true' : 'false'
    });
    
    const result = {
      approved: isHealthy,
      healthFactor: newHealthFactor,
      availableCredit: Math.max(0, position.availableCredit - debtIncreaseUsdc),
      reason: isHealthy ? undefined : 'Would exceed health factor threshold',
      responseTimeMs: responseTime,
      cacheHit
    };
    
    logger.info('Authorization check completed', {
      userId: position.userId,
      approved: result.approved,
      authAmount: authorizationAmount / 100, // Convert to dollars for logging
      healthFactor: newHealthFactor / 100, // Convert to percentage
      responseTime,
      cacheHit
    });
    
    return result;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Authorization check failed', { 
      userId, 
      walletAddress, 
      authorizationAmount,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime 
    });
    
    recordMetrics('auth.authorization.error', 1, { userId: userId || 'unknown' });
    
    // Fail safe: decline on error
    return {
      approved: false,
      healthFactor: 0,
      availableCredit: 0,
      reason: 'System error',
      responseTimeMs: responseTime,
      cacheHit: false
    };
  }
}

/**
 * Calculate available credit for user (cache-optimized)
 */
export async function calculateAvailableCredit(userId: string): Promise<number> {
  const startTime = Date.now();
  
  try {
    const availableCredit = await positionCache.getAvailableCredit(userId);
    
    const responseTime = Date.now() - startTime;
    recordMetrics('auth.available_credit.response_time', responseTime);
    
    return availableCredit || 0;
    
  } catch (error) {
    logger.error('Calculate available credit failed', { userId, error });
    return 0;
  }
} 