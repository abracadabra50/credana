import { logger } from '../../utils/logger';

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
        availableCredit: calculateAvailableCredit(
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
 * Calculate available credit based on current position
 */
function calculateAvailableCredit(
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