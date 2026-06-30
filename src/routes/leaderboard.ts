import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { perUserLimiter } from '../middleware/security';
import { getUserData, getLeaderboard } from '../services/UserService';
import { calculateCP, getEffectiveStats } from '../services/GameService';

const router = Router();

/**
 * GET /api/leaderboard
 * Get top 50 players
 */
router.get(
  '/',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const top = await getLeaderboard(50);

    const formatted = top.map((player) => ({
      tgId: player.tgId,
      name: player.firstName || player.username || `Player ${player.tgId?.slice(-4)}`,
      level: player.level || 1,
      cp: player.cp || 0,
      floor: player.floor || 1,
      charId: player.charId,
    }));

    res.json({
      ok: true,
      top: formatted,
      timestamp: Date.now(),
    });
  }),
);

/**
 * GET /api/leaderboard/my-rank
 * Get player's rank
 */
router.get(
  '/my-rank',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const user = await getUserData(tgId);

    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Calculate rank
    const top = await getLeaderboard(1000);
    const rank =
      top.findIndex(
        (p) => p.tgId === tgId && (p.cp || 0) === (user.cp || 0) && (p.level || 0) === (user.level || 0),
      ) + 1;

    res.json({
      ok: true,
      rank: Math.max(1, rank),
      cp: user.cp || 0,
      level: user.level || 1,
      totalPlayers: await require('../services/UserService').getUserStats(tgId),
    });
  }),
);

export default router;
