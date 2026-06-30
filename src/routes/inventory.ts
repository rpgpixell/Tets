import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { saveLimiter, perUserLimiter } from '../middleware/security';
import { getUserData, saveGameData } from '../services/UserService';
import { logger } from '../utils/logger';
import { GAME_CONSTANTS } from '../config/constants';

const router = Router();

/**
 * GET /api/inventory
 * Get player inventory
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
      inventory: user.data.inventory || [],
      equipped: user.data.equipped || {},
      stats: user.data.stats || {},
    });
  }),
);

/**
 * POST /api/inventory/equip
 * Equip item
 */
router.post(
  '/equip',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { itemId } = req.body;

    if (!itemId) {
      throw new AppError(400, 'No item ID', 'NO_ITEM_ID');
    }

    // Get user
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Find item
    const item = user.data.inventory?.find((i) => i.id === itemId);
    if (!item) {
      throw new AppError(404, 'Item not found', 'ITEM_NOT_FOUND');
    }

    // Equip
    if (!user.data.equipped) user.data.equipped = {};
    (user.data.equipped as any)[item.slot] = itemId;

    // Recalculate stats
    if (!user.data.baseStats) user.data.baseStats = {};
    if (!user.data.stats) user.data.stats = { ...user.data.baseStats };

    // Apply item bonuses
    if (item.stats) {
      Object.entries(item.stats).forEach(([stat, value]) => {
        if (value && user.data && user.data.stats) {
          (user.data.stats as any)[stat] = ((user.data.stats as any)[stat] || 0) + (value as number);
        }
      });
    }

    user.data.updatedAt = Date.now();
    await saveGameData(tgId, user.data);

    logger.info('[Inventory] Item equipped', { tgId, itemId, slot: item.slot });

    res.json({
      ok: true,
      equipped: {
        itemId,
        slot: item.slot,
        newStats: user.data.stats,
      },
    });
  }),
);

/**
 * POST /api/inventory/unequip
 * Unequip item
 */
router.post(
  '/unequip',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { slot } = req.body;

    if (!slot) {
      throw new AppError(400, 'No slot', 'NO_SLOT');
    }

    // Get user
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Find equipped item
    if (!user.data.equipped) user.data.equipped = {};
    const itemId = (user.data.equipped as any)[slot];
    if (!itemId) {
      throw new AppError(404, 'Nothing equipped in that slot', 'NOT_EQUIPPED');
    }

    // Unequip
    delete (user.data.equipped as any)[slot];

    user.data.updatedAt = Date.now();
    await saveGameData(tgId, user.data);

    logger.info('[Inventory] Item unequipped', { tgId, itemId, slot });

    res.json({
      ok: true,
      unequipped: {
        itemId,
        slot,
      },
    });
  }),
);

/**
 * DELETE /api/inventory/:itemId
 * Delete/Sell item
 */
router.delete(
  '/:itemId',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const itemId = parseInt(req.params.itemId);

    // Get user
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Find and remove item
    const item = user.data.inventory?.find((i) => i.id === itemId);
    if (!item) {
      throw new AppError(404, 'Item not found', 'ITEM_NOT_FOUND');
    }

    // Calculate sell value
    const sellValue = Math.floor(100 * Math.pow(1.5, item.level || 1));

    user.data.gold = (user.data.gold || 0) + sellValue;
    user.data.inventory = user.data.inventory?.filter((i) => i.id !== itemId) || [];

    user.data.updatedAt = Date.now();
    await saveGameData(tgId, user.data);

    logger.info('[Inventory] Item sold', { tgId, itemId, value: sellValue });

    res.json({
      ok: true,
      sold: {
        itemId,
        value: sellValue,
      },
    });
  }),
);

export default router;
