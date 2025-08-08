import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Credana Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhook: 'POST /api/webhooks/lithic/authorization',
      testBlockchain: '/api/test/blockchain',
    },
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test blockchain connection
app.get('/api/test/blockchain', async (req, res) => {
  try {
    const { testConnection } = await import('./services/blockchain/solana-client');
    const isConnected = await testConnection();
    
    res.json({
      success: true,
      connected: isConnected,
      programId: '5ZzWBVskegSJJzos6PPkeYwyJEQ8u4DfCsaEHxNYecCN',
      network: 'devnet',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Blockchain test failed', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Real Lithic webhook endpoint with blockchain integration
app.post('/api/webhooks/lithic/authorization', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { type, data } = req.body;
    
    logger.info('Received Lithic webhook', {
      type,
      cardToken: data?.card_token,
      amount: data?.amount,
      timestamp: new Date().toISOString(),
    });

    if (type === 'authorization.request') {
      const amount = data?.amount || 0;
      const cardToken = data?.card_token;
      
      // Map card tokens to user wallets
      const userWalletMappings: Record<string, string> = {
        'd01feaa7-66b4-4ce6-8818-9ae1f07d095f': '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // Your card -> Your wallet
      };
      
      const userWallet = userWalletMappings[cardToken];
      if (!userWallet) {
        logger.warn('Unknown card token', { cardToken });
        return res.json({ approved: false, decline_reason: 'INVALID_CARD' });
      }

      // Simple authorization logic: approve under $100
      const approved = amount < 10000; // $100 in cents
      const responseTime = Date.now() - startTime;
      
      logger.info('Authorization decision', {
        cardToken,
        userWallet,
        amount,
        approved,
        responseTime,
      });

      return res.json({
        approved,
        decline_reason: approved ? undefined : 'AMOUNT_TOO_HIGH',
      });
      
    } else if (type === 'authorization.advice') {
      // Settlement notification - record debt on-chain
      const amount = data?.amount || 0;
      const cardToken = data?.card_token;
      const transactionId = data?.token;
      
      const userWalletMappings: Record<string, string> = {
        'd01feaa7-66b4-4ce6-8818-9ae1f07d095f': '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      };
      
      const userWallet = userWalletMappings[cardToken];
      
      if (userWallet && amount > 0) {
        // Record debt on-chain asynchronously
        import('./services/blockchain/transaction-relayer')
          .then(({ recordDebtOnChain }) => {
            return recordDebtOnChain({
              userWallet,
              usdcAmount: amount,
              transactionId: transactionId || `settlement_${Date.now()}`,
            });
          })
          .then((signature) => {
            if (signature) {
              logger.info('Debt recorded on-chain', {
                userWallet,
                amount,
                transactionId,
                signature,
              });
            }
          })
          .catch((error) => {
            logger.error('Failed to record debt on-chain', {
              userWallet,
              amount,
              transactionId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          });
      }
      
      return res.json({ received: true });
    } else {
      logger.warn('Unknown webhook type', { type });
      return res.json({ received: true });
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    logger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
    });
    
    res.status(500).json({
      approved: false,
      decline_reason: 'PROCESSING_ERROR',
    });
  }
});

// Test endpoint to simulate recording debt
app.post('/api/test/record-debt', async (req, res) => {
  try {
    const { userWallet, usdcAmount, transactionId } = req.body;
    
    if (!userWallet || !usdcAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing userWallet or usdcAmount',
      });
    }

    const { recordDebtOnChain } = await import('./services/blockchain/transaction-relayer');
    const signature = await recordDebtOnChain({
      userWallet,
      usdcAmount,
      transactionId: transactionId || `test_${Date.now()}`,
    });

    res.json({
      success: !!signature,
      signature,
      userWallet,
      usdcAmount,
      transactionId,
    });
  } catch (error) {
    logger.error('Test record debt failed', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

export default app; 