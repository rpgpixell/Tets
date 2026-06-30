import { GameData } from '../types/index';
import { GAME_CONSTANTS } from '../config/constants';
import { logger } from '../utils/logger';

/**
 * Calculate CP (Combat Power)
 */
export function calculateCP(data: GameData): number {
  try {
    if (!data) return 0;

    const baseStats = data.baseStats || {};
    const upg = data.upg || {};
    const equipped = data.equipped || {};

    let cp = 0;

    // Base stats contribution
    const baseAtk = (baseStats.atk || 0) * 1.5;
    const baseDef = (baseStats.def || 0) * 2;
    const baseHp = (baseStats.hp || 0) * 0.5;
    const baseSpd = (baseStats.spd || 0) * 2;

    cp += baseAtk + baseDef + baseHp + baseSpd;

    // Upgrades contribution
    Object.entries(upg).forEach(([key, level]) => {
      if (level > 0) {
        const upgDef = GAME_CONSTANTS.UPG_DEFS.find((u) => u.id === key);
        if (upgDef) {
          cp += (upgDef.bonus * (level as number) * 0.8) | 0;
        }
      }
    });

    // Equipment contribution
    if (data.inventory) {
      Object.values(equipped).forEach((itemId) => {
        const item = data.inventory?.find((i) => i.id === itemId);
        if (item && item.stats) {
          const atk = (item.stats.atk || 0) * 1.5;
          const def = (item.stats.def || 0) * 2;
          const hp = (item.stats.hp || 0) * 0.5;
          const spd = (item.stats.spd || 0) * 2;
          cp += (atk + def + hp + spd) | 0;
        }
      });
    }

    // Level bonus
    const levelBonus = ((data.level || 1) - 1) * 10;
    cp += levelBonus;

    return Math.max(0, cp);
  } catch (err) {
    logger.error('[GameService] Error calculating CP', { error: err });
    return 0;
  }
}

/**
 * Get effective stats with multipliers
 */
export function getEffectiveStats(
  data: GameData,
  premiumMultiplier = 1,
): GameData['stats'] {
  try {
    const stats = data.stats || {};
    return {
      ...stats,
      atk: ((stats.atk || 0) * premiumMultiplier) | 0,
      def: ((stats.def || 0) * premiumMultiplier) | 0,
      hp: ((stats.hp || 0) * premiumMultiplier) | 0,
    };
  } catch (err) {
    logger.error('[GameService] Error getting effective stats', { error: err });
    return data.stats || {};
  }
}

/**
 * Calculate experience needed for next level
 */
export function calculateXpForLevel(level: number): number {
  const baseXp = 100;
  const multiplier = level <= 7 ? 2.5 : 1.1;
  return Math.floor(baseXp * Math.pow(multiplier, level - 1));
}

/**
 * Validate floor unlocking
 */
export function canUnlockFloor(currentCp: number, targetFloor: number): boolean {
  const floorRequirements: Record<number, number> = {
    1: 0,
    2: 500,
    3: 1500,
    4: 3000,
    5: 5000,
    6: 8000,
    7: 12000,
    8: 16000,
    9: 20000,
    10: 25000,
  };

  const required = floorRequirements[targetFloor] || 0;
  return currentCp >= required;
}

/**
 * Check if player can fight boss
 */
export function canFightBoss(boss: any, currentCp: number): boolean {
  return currentCp >= boss.cpReq;
}
