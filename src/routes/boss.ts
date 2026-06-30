import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { saveLimiter } from '../middleware/security';
import { getUserData, saveGameData } from '../services/UserService';
import { logger } from '../utils/logger';
import { GAME_CONSTANTS } from '../config/constants';

const router = Router();

interface BossState {
  floor: number;
  hp: number;
  maxHp: number;
  defeatedAt?: number;
}

const bosses = new Map<number, BossState>();

// Initialize bosses
for (let i = 1; i <= 10; i++) {
  const bossDef = GAME_CONSTANTS.BOSS_DEFS.find((b) => b.id === i);
  if (bossDef) {
    bosses.set(i, {
      floor: i,
      hp: bossDef.hp,
      maxHp: bossDef.hp,
    });
  }
}

/**
 * GET /api/boss/:floor
 * Get boss info
 */
router.get(
  '/:floor',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const floor = parseInt(req.params.floor);

    if (floor < 1 || floor > 10) {
      throw new AppError(400, 'Invalid floor', 'INVALID_FLOOR');
    }

    const bossDef = GAME_CONSTANTS.BOSS_DEFS.find((b) => b.id === floor);
    if (!bossDef) {
      throw new AppError(404, 'Boss not found', 'BOSS_NOT_FOUND');
    }

    const bossState = bosses.get(floor) || {
      floor,
      hp: bossDef.hp,
      maxHp: bossDef.hp,
    };

    res.json({
      ok: true,
      boss: {
        id: bossDef.id,
        name: bossDef.name,
        cpReq: bossDef.cpReq,
        hp: bossState.hp,
        maxHp: bossState.maxHp,
        atk: bossDef.atk,
        lastDefeated: bossState.defeatedAt,
      },
    });
  }),
);

/**
 * POST /api/boss/:floor/fight
 * Fight boss
 */
router.post(
  '/:floor/fight',
  authMiddleware,
  saveLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const floor = parseInt(req.params.floor);
    const tgId = req.user!.id;

    if (floor < 1 || floor > 10) {
      throw new AppError(400, 'Invalid floor', 'INVALID_FLOOR');
    }

    const bossDef = GAME_CONSTANTS.BOSS_DEFS.find((b) => b.id === floor);
    if (!bossDef) {
      throw new AppError(404, 'Boss not found', 'BOSS_NOT_FOUND');
    }

    // Get user
    const user = await getUserData(tgId);
    if (!user?.data) {
      throw new AppError(404, 'User not found', 'NO_SAVE');
    }

    // Check CP requirement
    if ((user.data.cp || 0) < bossDef.cpReq) {
      throw new AppError(400, 'CP requirement not met', 'LOW_CP');
    }

    // Check cooldown
    const now = Date.now();
    if (user.data.boss) {
      const timeSinceLastFight = now - (user.data.boss.lastFightTime || 0);
      if (timeSinceLastFight < GAME_CONSTANTS.BOSS_COOLDOWN_MS) {
        const hoursRemaining = Math.ceil(
          (GAME_CONSTANTS.BOSS_COOLDOWN_MS - timeSinceLastFight) / (60 * 60 * 1000),
        );
        throw new AppError(429, `Wait ${hoursRemaining} hours`, 'BOSS_ON_COOLDOWN');
      }
    }

    // Simulate battle
    const userDmg = Math.max(1, (user.data.stats?.atk || 10) - bossDef.atk / 4);
    const bossDmg = Math.max(1, bossDef.atk - (user.data.stats?.def || 5));

    const roundsToKill = Math.ceil(bossDef.hp / userDmg);
    const roundsToPlayerDeath = Math.ceil((user.data.maxHp || 100) / bossDmg);

    const playerWins = roundsToKill < roundsToPlayerDeath;

    if (playerWins) {
      // Reward
      const baseGold = Math.floor(bossDef.hp * 0.5);
      const baseXp = Math.floor(bossDef.hp * 0.1);
      const pixr = floor >= 7 ? 1 : 0;

      user.data.gold = (user.data.gold || 0) + baseGold;
      user.data.xp = (user.data.xp || 0) + baseXp;
      user.data.pixr = (user.data.pixr || 0) + pixr;

      // Mark boss as defeated
      if (!user.data.boss) user.data.boss = {};
      user.data.boss.floor = floor;
      user.data.boss.lastFightTime = now;

      logger.info('[Boss] Player defeated boss', { tgId, floor, gold: baseGold });
    } else {
      // Damage player
      user.data.hp = Math.max(0, (user.data.hp || 0) - Math.floor(bossDmg * 5));
      logger.info('[Boss] Player lost to boss', { tgId, floor });
    }

    user.data.updatedAt = now;
    await saveGameData(tgId, user.data);

    res.json({
      ok: true,
      result: {
        won: playerWins,
        playerDmg: playerWins ? userDmg : bossDmg,
        bossDmg: playerWins ? bossDmg : userDmg,
        reward: playerWins
          ? {
              gold: Math.floor(bossDef.hp * 0.5),
              xp: Math.floor(bossDef.hp * 0.1),
              pixr: floor >= 7 ? 1 : 0,
            }
          : null,
      },
    });
  }),
);

export default router;
