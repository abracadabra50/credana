/**
 * Auth Service Entry Point
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import signRoutes from './routes/sign';

const app = express();
const PORT = process.env.AUTH_PORT || 3003;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    process.env.APP_URL || 'http://localhost:3000',
  ],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api', authRoutes);
app.use('/api', signRoutes);

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[Auth] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
    ╔═══════════════════════════════════════════════╗
    ║                                               ║
    ║     🔐 CREDANA AUTH SERVICE                  ║
    ║                                               ║
    ║     Port: ${PORT}                             ║
    ║     Health: http://localhost:${PORT}/health   ║
    ║                                               ║
    ║     Endpoints:                                ║
    ║     POST /api/auth/email/start                ║
    ║     POST /api/auth/email/verify               ║
    ║     POST /api/auth/webauthn/register          ║
    ║     GET  /api/auth/session                    ║
    ║     POST /api/auth/signout                    ║
    ║     POST /api/sign/solana                     ║
    ║     POST /api/sign/deposit-collateral         ║
    ║     GET  /api/wallet/info                     ║
    ║                                               ║
    ╚═══════════════════════════════════════════════╝
  `);
});

export default app; 