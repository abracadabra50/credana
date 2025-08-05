import { Pool } from 'pg';
import { logger } from '../utils/logger';

const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
  max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const db = new Pool(dbConfig);

// Test the connection
db.on('connect', () => {
  logger.info('Database connected successfully');
});

db.on('error', (err) => {
  logger.error('Database connection error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.end();
  logger.info('Database pool closed');
  process.exit(0);
});

export default db; 