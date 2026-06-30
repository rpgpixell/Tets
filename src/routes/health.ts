import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /
 * Health check
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      ok: true,
      message: 'Pixel RPG API v2.0',
      timestamp: Date.now(),
    });
  }),
);

export default router;
