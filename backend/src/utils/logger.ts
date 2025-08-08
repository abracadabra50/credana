/**
 * Production Logger
 * Structured logging with levels and context
 */

import winston from 'winston';

const { combine, timestamp, json, errors, printf } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    process.env.NODE_ENV === 'production' ? json() : devFormat
  ),
  defaultMeta: { 
    service: 'credana-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    })
  ]
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }));
}

// Metrics tracking
export const metrics = {
  authApproved: 0,
  authDeclined: 0,
  authErrors: 0,
  avgLatency: 0,
  p95Latency: 0,
  p99Latency: 0,
  
  track(metric: string, value: number) {
    // In production, send to CloudWatch/Datadog/etc
    logger.debug('Metric tracked', { metric, value });
  }
}; 