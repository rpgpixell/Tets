import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { saveLimiter, perUserLimiter } from '../middleware/security';
import { getUserData, saveGameData } from '../services/UserService';
import { logger } from '../utils/logger';
import { GAME_CONSTANTS } from '../config/constants';

const router = Router();

/**
 * GET /api/skills
 * Get player skills
 */
router.get(
  '/',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    res.json({
      ok: true,
      skills: user.data.stats || {},
    });
  }),
);

/**
 * POST /api/skills/upgrade
 * Upgrade skill
 */
router.post(
  '/upgrade',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { skillId } = req.body;

    if (!skillId) {
      throw new AppError(400, 'No skill ID', 'NO_SKILL_ID');
    }

    // Get user
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Find skill definition
    const skillDef = GAME_CONSTANTS.UPG_DEFS.find((u) => u.id === skillId);
    if (!skillDef) {
      throw new AppError(404, 'Skill not found', 'SKILL_NOT_FOUND');
    }

    // Get current level
    if (!user.data.upg) user.data.upg = {};
    const currentLevel = (user.data.upg[skillId] as number) || 0;
    const nextLevel = currentLevel + 1;

    // Calculate cost (exponential)
    const costFormula = (level: number) => Math.floor(100 * Math.pow(1.15, level - 1));
    const goldCost = costFormula(nextLevel);

    // Check gold
    if ((user.data.gold || 0) < goldCost) {
      throw new AppError(400, 'Not enough gold', 'NO_GOLD');
    }

    // Upgrade
    user.data.gold = (user.data.gold || 0) - goldCost;
    (user.data.upg as any)[skillId] = nextLevel;

    // Recalculate stats
    if (!user.data.baseStats) user.data.baseStats = {};
    if (!user.data.stats) user.data.stats = {};

    user.data.stats[skillDef.stat as keyof typeof user.data.stats] =
      (user.data.baseStats[skillDef.stat as keyof typeof user.data.baseStats] || 0) +
      skillDef.bonus * nextLevel;

    user.data.updatedAt = Date.now();
    await saveGameData(tgId, user.data);

    logger.info('[Skills] Skill upgraded', { tgId, skillId, level: nextLevel });

    res.json({
      ok: true,
      skill: {
        id: skillId,
        level: nextLevel,
        costPaid: goldCost,
        newStats: user.data.stats,
      },
    });
  }),
);

export default router;
