import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { perUserLimiter, saveLimiter } from '../middleware/security';
import { getUserData, saveGameData } from '../services/UserService';
import { logger } from '../utils/logger';
import { GAME_CONSTANTS } from '../config/constants';
import { GameData } from '../types/index';

const router = Router();

interface PvpOpponent {
  tgId: string;
  name: string;
  level: number;
  cp: number;
  charId?: string;
}

interface BattleResult {
  winnerId: string;
  winnerDmg: number;
  loserDmg: number;
  ratingChange: number;
}

/**
 * GET /api/pvp/opponents
 * Get PvP opponents
 */
router.get(
  '/opponents',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Get nearby players by rating
    const minRating = Math.max(0, (user.data.arenaRating || 0) - GAME_CONSTANTS.PVP_RATING_RANGE);
    const maxRating = (user.data.arenaRating || 0) + GAME_CONSTANTS.PVP_RATING_RANGE;

    // For demo: generate random opponents
    const opponents: PvpOpponent[] = [];
    for (let i = 0; i < 5; i++) {
      opponents.push({
        tgId: `bot_${i}`,
        name: `Bot Player ${i + 1}`,
        level: Math.floor(user.data.level! * (0.8 + Math.random() * 0.4)),
        cp: Math.floor((user.data.cp || 0) * (0.8 + Math.random() * 0.4)),
        charId: GAME_CONSTANTS.VALID_CHAR_IDS[Math.floor(Math.random() * 3)],
      });
    }

    res.json({
      ok: true,
      opponents,
      yourRating: user.data.arenaRating || 0,
    });
  }),
);

/**
 * POST /api/pvp/battle
 * Start PvP battle
 */
router.post(
  '/battle',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { opponentId } = req.body;

    if (!opponentId) {
      throw new AppError(400, 'No opponent ID', 'NO_OPPONENT');
    }

    // Get user data
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Check attempts
    const now = Date.now();
    const resetDate = new Date(now).toISOString().split('T')[0];

    if (user.data.pvpAttemptsDate !== resetDate) {
      user.data.pvpAttempts = 0;
      user.data.pvpAttemptsDate = resetDate;
    }

    if ((user.data.pvpAttempts || 0) >= GAME_CONSTANTS.PVP_ATTEMPTS_PER_DAY) {
      throw new AppError(429, 'Daily attempts exceeded', 'MAX_ATTEMPTS');
    }

    // Simulate battle
    const userStats = {
      atk: (user.data.stats?.atk || 10) + (user.data.upg?.atk || 0) * 3,
      def: (user.data.stats?.def || 5) + (user.data.upg?.def || 0) * 2,
      hp: (user.data.maxHp || 100),
    };

    const opponentStats = {
      atk: Math.floor(userStats.atk * (0.8 + Math.random() * 0.4)),
      def: Math.floor(userStats.def * (0.8 + Math.random() * 0.4)),
      hp: Math.floor(userStats.hp * (0.8 + Math.random() * 0.4)),
    };

    // Determine winner
    const userDmg = Math.max(1, userStats.atk - opponentStats.def);
    const opponentDmg = Math.max(1, opponentStats.atk - userStats.def);

    const userWins = userDmg > opponentDmg;

    // Calculate rating change
    const currentRating = user.data.arenaRating || 0;
    const ratingChange = userWins
      ? userDmg > opponentDmg * 1.5
        ? GAME_CONSTANTS.PVP_WIN_RATING_STRONG
        : GAME_CONSTANTS.PVP_WIN_RATING_WEAK
      : GAME_CONSTANTS.PVP_LOSS_RATING;

    // Update user
    user.data.pvpAttempts = (user.data.pvpAttempts || 0) + 1;
    user.data.arenaRating = Math.max(0, currentRating + ratingChange);
    user.data.updatedAt = now;
    await saveGameData(tgId, user.data);

    logger.info('[PvP] Battle result', {
      player: tgId,
      opponent: opponentId,
      result: userWins ? 'win' : 'loss',
      ratingChange,
    });

    res.json({
      ok: true,
      result: {
        won: userWins,
        ratingBefore: currentRating,
        ratingAfter: user.data.arenaRating,
        ratingChange,
        yourDmg: userWins ? userDmg : opponentDmg,
        enemyDmg: userWins ? opponentDmg : userDmg,
      },
    });
  }),
);

/**
 * GET /api/pvp/stats
 * Get PvP statistics
 */
router.get(
  '/stats',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    const now = Date.now();
    const resetDate = new Date(now).toISOString().split('T')[0];

    if (user.data.pvpAttemptsDate !== resetDate) {
      user.data.pvpAttempts = 0;
    }

    res.json({
      ok: true,
      stats: {
        rating: user.data.arenaRating || 0,
        attempts: {
          used: user.data.pvpAttempts || 0,
          max: GAME_CONSTANTS.PVP_ATTEMPTS_PER_DAY,
        },
        refreshes: user.data.pvpRefreshes || 0,
      },
    });
  }),
);

export default router;
