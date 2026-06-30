import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { saveLimiter } from '../middleware/security';
import { validateGameDataMiddleware, validateDeltaMiddleware } from '../middleware/validation';
import { saveGameData, getUserData, getOrCreateUser } from '../services/UserService';
import { checkCheat, updatePlayerState } from '../utils/antiCheat';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/load
 * Load user save
 */
router.post(
  '/load',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const username = req.user!.username || '';
    const firstName = req.user!.firstName || '';

    logger.info('[Load] User loading save', { tgId });

    let user = await getUserData(tgId);

    if (!user) {
      user = await getOrCreateUser(tgId, username, firstName);
      logger.info('[Load] New user created', { tgId });
    }

    res.json({
      ok: true,
      save: {
        charId: user.charId || null,
        data: user.data || null,
        updatedAt: user.updatedAt || 0,
      },
      user: {
        id: tgId,
        username,
        firstName,
      },
    });
  }),
);

/**
 * POST /api/save
 * Save full game data
 */
router.post(
  '/save',
  authMiddleware,
  saveLimiter,
  validateGameDataMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const tgId = req.user!.id;
    const gameData = req.body.data;

    // Validate data consistency
    if (gameData.tgId && gameData.tgId !== tgId) {
      throw new AppError(403, 'User ID mismatch', 'USER_MISMATCH');
    }

    // Anti-cheat check
    const currentUser = await getUserData(tgId);
    const cheatCheck = checkCheat(tgId, gameData, currentUser?.data);

    if (cheatCheck.isCheat) {
      logger.warn('[Save] Cheat detected', {
        tgId,
        reason: cheatCheck.reason,
        severity: cheatCheck.severity,
      });

      if (cheatCheck.severity === 'high') {
        throw new AppError(403, 'Suspicious activity detected', 'CHEAT_DETECTED');
      }
    }

    // Check for old reset data
    if (currentUser?.data?._resetAt && currentUser.data._resetAt > (gameData.updatedAt || 0)) {
      logger.warn('[Save] Reset detected', { tgId });
      throw new AppError(400, 'Progress was reset server-side', 'PROGRESS_RESET');
    }

    // Save data
    gameData.updatedAt = Date.now();
    const updated = await saveGameData(tgId, gameData);
    updatePlayerState(tgId, gameData);

    const duration = Date.now() - startTime;
    logger.info('[Save] Data saved', { tgId, duration: `${duration}ms` });

    res.json({
      ok: true,
      updatedAt: gameData.updatedAt,
    });
  }),
);

/**
 * POST /api/save/delta
 * Save delta changes only
 */
router.post(
  '/save/delta',
  authMiddleware,
  saveLimiter,
  validateDeltaMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const tgId = req.user!.id;
    const delta = req.body.delta;

    // Get current data
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User data not found', 'NO_SAVE');
    }

    // Merge delta with current data
    const merged = { ...user.data, ...delta };
    merged.updatedAt = Date.now();

    // Anti-cheat on merged data
    const cheatCheck = checkCheat(tgId, merged, user.data);
    if (cheatCheck.isCheat && cheatCheck.severity === 'high') {
      throw new AppError(403, 'Suspicious activity detected', 'CHEAT_DETECTED');
    }

    // Save
    const updated = await saveGameData(tgId, merged);
    updatePlayerState(tgId, merged);

    const duration = Date.now() - startTime;
    logger.info('[SaveDelta] Delta saved', { tgId, duration: `${duration}ms` });

    res.json({
      ok: true,
      updatedAt: merged.updatedAt,
    });
  }),
);

export default router;
