#!/usr/bin/env node

/**
 * PRODUCTION CREDANA SERVER
 * Tightened rails with HMAC, idempotency, two-phase flow
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { 
  verifyLithicHMAC, 
  idempotencyMiddleware, 
  webhookRateLimit,
  getLithicWebhookSecret 
} from './middleware/lithic-security';
import { handleLithicWebhook } from './handlers/lithic-webhook-handler';
import { logger, metrics } from './utils/logger';

// Validate environment
const requiredEnvVars = [
  'LITHIC_API_KEY',
  'SOLANA_RPC_URL',
  'PROGRAM_ID'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Validate program ID matches
const EXPECTED_PROGRAM_ID = 'BGKpWD4Vz2gLzhnDWL91ntExNLxotju4sbf1Ut8hLJA4';
if (process.env.PROGRAM_ID !== EXPECTED_PROGRAM_ID) {
  logger.error('Program ID mismatch', {
    expected: EXPECTED_PROGRAM_ID,
    actual: process.env.PROGRAM_ID
  });
  process.exit(1);
}

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Lithic-Signature']
}));

// Body parsing
app.use(express.json({ 
  limit: '1mb',
  verify: (req, res, buf) => {
    // Store raw body for HMAC verification
    (req as any).rawBody = buf.toString('utf8');
  }
}));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip
    });
    
    // Track metrics
    if (req.path === '/api/webhooks/lithic/authorization') {
      metrics.track('webhook_latency', duration);
    }
  });
  
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    metrics: {
      approved: metrics.authApproved,
      declined: metrics.authDeclined,
      errors: metrics.authErrors,
      avgLatency: metrics.avgLatency
    }
  });
});

// Lithic webhook endpoint with full security
app.post(
  '/api/webhooks/lithic/authorization',
  webhookRateLimit(),
  verifyLithicHMAC(getLithicWebhookSecret()),
  idempotencyMiddleware(),
  handleLithicWebhook
);

// Metrics endpoint (protected)
app.get('/metrics', (req, res) => {
  // In production, protect with API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.METRICS_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    auth: {
      approved: metrics.authApproved,
      declined: metrics.authDeclined,
      errors: metrics.authErrors,
      approvalRate: metrics.authApproved / (metrics.authApproved + metrics.authDeclined) || 0
    },
    performance: {
      avgLatency: metrics.avgLatency,
      p95Latency: metrics.p95Latency,
      p99Latency: metrics.p99Latency
    },
    health: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', err);
  metrics.authErrors++;
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(500).json({ 
    error: message,
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path 
  });
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  logger.info('🚀 CREDANA PRODUCTION SERVER STARTED', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    programId: process.env.PROGRAM_ID,
    cluster: process.env.SOLANA_CLUSTER || 'devnet'
  });
  
  console.log(`
═══════════════════════════════════════════════════════════
🔒 PRODUCTION CREDANA SERVER
═══════════════════════════════════════════════════════════
📍 Port: ${PORT}
🔐 HMAC: Enabled
🔄 Idempotency: Enabled  
📊 Two-Phase Flow: Enabled
⚡ Rate Limiting: 100 req/min
🎯 APR: 5% | LTV: 60% | Liquidation: 75%
═══════════════════════════════════════════════════════════
  `);
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Wait for existing connections to close (max 30s)
  setTimeout(() => {
    logger.warn('Forcing shutdown after 30s');
    process.exit(0);
  }, 30000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  // In production, you might want to exit after logging
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  // Exit after logging critical error
  process.exit(1);
});

export default app; 