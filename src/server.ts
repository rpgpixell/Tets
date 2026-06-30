import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index';
import { logger } from './utils/logger';
import { connectDB } from './db/index';

// Middleware
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import {
  globalLimiter,
  getHelmetMiddleware,
  getCorsMiddleware,
  requestLogger,
  validateBodySize,
} from './middleware/security';

// Routes
import apiRoutes from './routes/index';
import healthRoutes from './routes/health';
import systemRoutes from './routes/system';
import walletRoutes from './routes/wallet';

const app: Express = express();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE SETUP
// ═══════════════════════════════════════════════════════════════════════════════

// Security headers
app.use(getHelmetMiddleware());

// CORS
app.use(getCorsMiddleware(config.security.corsOrigins));

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Validate body size
app.use(validateBodySize);

// Global rate limiter
app.use(globalLimiter);

// Request logging
app.use(requestLogger);

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Health & Status
app.use('/', healthRoutes);
app.use('/health', healthRoutes);
app.use('/status', systemRoutes);

// API v1
app.use('/api', apiRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/system', systemRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: 'Not found',
    path: req.path,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

async function startServer(): Promise<void> {
  try {
    logger.info('[Server] Starting Pixel RPG API v2.0');

    // Connect to database
    await connectDB();

    // Start listening
    const port = config.port;
    app.listen(port, '0.0.0.0', () => {
      logger.info(`[Server] ✅ Listening on port ${port}`);
      logger.info(`[Server] Environment: ${config.env}`);
      logger.info(`[Server] Database: ${config.mongodb.uri.replace(/:[^:]*@/, ':***@')}`);
    });
  } catch (err) {
    logger.error('[Server] Failed to start', { error: err });
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
  logger.info('[Server] SIGINT received, gracefully shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('[Server] SIGTERM received, gracefully shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught Exception', { error: err });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled Rejection', { reason });
  process.exit(1);
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;
