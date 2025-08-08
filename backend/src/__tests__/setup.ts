// Jest setup file for backend tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.LOG_LEVEL = 'error'; // Reduce noise during testing

// Mock console methods if needed
// const originalConsoleLog = console.log;
// const originalConsoleError = console.error;

// You can uncomment these to silence console output during tests
// console.log = jest.fn();
// console.error = jest.fn();

// Increase timeout for integration tests
jest.setTimeout(30000);

export {}; 