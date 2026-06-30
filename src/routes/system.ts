import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { perUserLimiter } from '../middleware/security';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/stats
 * Server statistics
 */
router.get(
  '/stats',
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    res.json({
      ok: true,
      server: {
        uptime: Math.floor(uptime),
        memory: {
          rss: Math.round(memory.rss / 1024 / 1024),
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
          external: Math.round(memory.external / 1024 / 1024),
        },
        timestamp: Date.now(),
      },
    });
  }),
);

/**
 * GET /api/version
 * API version
 */
router.get(
  '/version',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      ok: true,
      version: '2.0.0',
      apiVersion: 'v1',
      timestamp: Date.now(),
    });
  }),
);

export default router;
