import dotenv from 'dotenv';
import app from './app';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;

// Start server
const server = app.listen(PORT, () => {
  logger.info('Credana Backend Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    lithicEnvironment: process.env.LITHIC_ENVIRONMENT || 'sandbox',
    timestamp: new Date().toISOString(),
  });

  // Log available endpoints
  console.log('\n🚀 Credana Backend API is running!');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log('\n📋 Available Endpoints:');
  console.log(`   📊 Health Check: http://localhost:${PORT}/health`);
  console.log(`   🎪 Webhook: POST http://localhost:${PORT}/api/webhooks/lithic/authorization`);
  console.log(`   🔗 Test Blockchain: GET http://localhost:${PORT}/api/test/blockchain`);
  console.log(`   💸 Test Record Debt: POST http://localhost:${PORT}/api/test/record-debt`);
  console.log('\n💡 Your real card token: d01feaa7-66b4-4ce6-8818-9ae1f07d095f');
  console.log('💡 Your wallet: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
  console.log('💡 Ready to receive real Lithic webhooks!');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

export default server; 