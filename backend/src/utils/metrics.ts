import { register, Counter, Histogram, Gauge } from 'prom-client';

// Metrics for monitoring
export const authorizationLatency = new Histogram({
  name: 'stripe_authorization_response_time_seconds',
  help: 'Time taken to respond to Stripe authorization requests',
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0],
  labelNames: ['approved', 'reason'],
});

export const authorizationDecisions = new Counter({
  name: 'stripe_authorization_decisions_total',
  help: 'Total number of authorization decisions',
  labelNames: ['approved', 'reason'],
});

export const healthFactorGauge = new Gauge({
  name: 'user_health_factor',
  help: 'Current health factor for users',
  labelNames: ['user_id'],
});

export const blockchainTransactions = new Counter({
  name: 'blockchain_transactions_total',
  help: 'Total number of blockchain transactions',
  labelNames: ['instruction_type', 'status'],
});

export function recordMetrics(metricName: string, value: number, labels?: Record<string, string>) {
  switch (metricName) {
    case 'stripe.authorization.response_time':
      authorizationLatency.observe(labels || {}, value / 1000); // Convert to seconds
      break;
    case 'stripe.authorization.decision':
      authorizationDecisions.inc(labels || {}, value);
      break;
    case 'user.health_factor':
      healthFactorGauge.set(labels || {}, value);
      break;
    case 'blockchain.transaction':
      blockchainTransactions.inc(labels || {}, value);
      break;
    default:
      // Generic counter for other metrics
      break;
  }
}

export { register }; 