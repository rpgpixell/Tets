import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { config } from '../config/index';
import { logger } from '../utils/logger';

const router = Router();
const adminId = config.telegram.adminTgId;

/**
 * Admin authentication middleware
 */
function isAdmin(req: Request): boolean {
  const authHeader = req.headers.authorization;
  const apiKey = config.security.apiSecretKey;
  return authHeader === `Bearer ${apiKey}`;
}

/**
 * GET /api/admin/status
 * Server status
 */
router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    res.json({
      ok: true,
      status: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now(),
      },
    });
  }),
);

/**
 * POST /api/admin/user/:tgId/reset
 * Reset user progress
 */
router.post(
  '/user/:tgId/reset',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const tgId = req.params.tgId;
    const reason = req.body?.reason || 'Admin reset';

    const { getUserData, saveGameData } = await import('../services/UserService');
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    // Reset data
    user.data._resetAt = Date.now();
    user.data.hp = user.data.maxHp || 100;
    user.data.floor = 1;

    await saveGameData(tgId, user.data);

    logger.info('[Admin] User reset', { tgId, reason });

    res.json({
      ok: true,
      message: `User ${tgId} reset`,
    });
  }),
);

/**
 * POST /api/admin/user/:tgId/give-item
 * Give item to user
 */
router.post(
  '/user/:tgId/give-item',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const tgId = req.params.tgId;
    const { itemName, rarity, level } = req.body;

    const { getUserData, saveGameData } = await import('../services/UserService');
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (!user.data.inventory) user.data.inventory = [];

    const newItem = {
      id: Math.max(0, ...user.data.inventory.map((i) => i.id)) + 1,
      slot: 'weapon' as const,
      name: itemName || 'Admin Item',
      icon: '',
      rarity: rarity || 'rare',
      level: level || 1,
      stats: {},
    };

    user.data.inventory.push(newItem);
    user.data.updatedAt = Date.now();

    await saveGameData(tgId, user.data);

    logger.info('[Admin] Item given', { tgId, itemName });

    res.json({
      ok: true,
      item: newItem,
    });
  }),
);

/**
 * POST /api/admin/user/:tgId/add-gold
 * Add gold to user
 */
router.post(
  '/user/:tgId/add-gold',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAdmin(req)) {
      throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const tgId = req.params.tgId;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
      throw new AppError(400, 'Invalid amount', 'INVALID_AMOUNT');
    }

    const { getUserData, saveGameData } = await import('../services/UserService');
    const user = await getUserData(tgId);

    if (!user?.data) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    user.data.gold = (user.data.gold || 0) + amount;
    user.data.updatedAt = Date.now();

    await saveGameData(tgId, user.data);

    logger.info('[Admin] Gold added', { tgId, amount });

    res.json({
      ok: true,
      gold: user.data.gold,
    });
  }),
);

export default router;
