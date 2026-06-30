import { GameData } from '../types/index';
import { logger } from './logger';

// ═══════════════════════════════════════════════════════
// ANTI-CHEAT SYSTEM
// ═══════════════════════════════════════════════════════

export interface CheatCheckResult {
  isCheat: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high';
}

interface LastKnownState {
  hp: number;
  gold: number;
  pixr: number;
  level: number;
  timestamp: number;
}

const playerStates = new Map<string, LastKnownState>();

/**
 * Check if player data looks suspiciously modified
 */
export function checkCheat(tgId: string, clientData: GameData, serverData?: GameData): CheatCheckResult {
  // Check 1: HP should never exceed maxHP without healing items
  if (clientData.hp > clientData.maxHp) {
    logger.warn(`[AntiCheat] HP exceeds maxHP for ${tgId}`, {
      hp: clientData.hp,
      maxHp: clientData.maxHp,
    });
    return {
      isCheat: true,
      reason: 'HP exceeds maxHP',
      severity: 'high',
    };
  }

  // Check 2: HP should be non-negative
  if (clientData.hp < 0) {
    logger.warn(`[AntiCheat] Negative HP for ${tgId}`, { hp: clientData.hp });
    return {
      isCheat: true,
      reason: 'Negative HP',
      severity: 'high',
    };
  }

  // Check 3: Gold/PIXR should be non-negative
  if (clientData.gold < 0 || clientData.pixr < 0) {
    logger.warn(`[AntiCheat] Negative currency for ${tgId}`, {
      gold: clientData.gold,
      pixr: clientData.pixr,
    });
    return {
      isCheat: true,
      reason: 'Negative currency',
      severity: 'high',
    };
  }

  // Check 4: Level should be reasonable (1-1000)
  if (clientData.level < 1 || clientData.level > 1000) {
    logger.warn(`[AntiCheat] Unrealistic level for ${tgId}`, { level: clientData.level });
    return {
      isCheat: true,
      reason: 'Unrealistic level',
      severity: 'high',
    };
  }

  // Check 5: XP should not exceed needed XP
  if (clientData.xp > clientData.xpNeeded) {
    logger.warn(`[AntiCheat] XP exceeds needed for ${tgId}`, {
      xp: clientData.xp,
      xpNeeded: clientData.xpNeeded,
    });
    return {
      isCheat: true,
      reason: 'XP exceeds needed',
      severity: 'high',
    };
  }

  // Check 6: Compare with last known state (rate limiting huge jumps)
  const lastState = playerStates.get(tgId);
  if (lastState) {
    const timeDiff = (clientData.updatedAt - lastState.timestamp) / 1000; // seconds

    // Gold shouldn't increase by more than reasonable amount per second
    const goldIncrease = clientData.gold - lastState.gold;
    const goldPerSecond = goldIncrease / Math.max(timeDiff, 1);
    if (goldPerSecond > 100000) {
      // 100k gold per second is suspicious
      logger.warn(`[AntiCheat] Suspicious gold gain for ${tgId}`, {
        goldIncrease,
        timeSeconds: timeDiff,
        goldPerSec: goldPerSecond,
      });
      return {
        isCheat: true,
        reason: 'Suspicious gold gain',
        severity: 'medium',
      };
    }

    // PIXR shouldn't increase by more than 100 per second
    const pixrIncrease = clientData.pixr - lastState.pixr;
    const pixrPerSecond = pixrIncrease / Math.max(timeDiff, 1);
    if (pixrPerSecond > 100) {
      logger.warn(`[AntiCheat] Suspicious PIXR gain for ${tgId}`, {
        pixrIncrease,
        timeSeconds: timeDiff,
        pixrPerSec: pixrPerSecond,
      });
      return {
        isCheat: true,
        reason: 'Suspicious PIXR gain',
        severity: 'medium',
      };
    }

    // Level shouldn't increase by more than 10 per save
    const levelIncrease = clientData.level - lastState.level;
    if (levelIncrease > 100) {
      logger.warn(`[AntiCheat] Suspicious level jump for ${tgId}`, {
        levelIncrease,
      });
      return {
        isCheat: true,
        reason: 'Suspicious level jump',
        severity: 'high',
      };
    }
  }

  // Check 7: Inventory size sanity check
  if (clientData.inventory && clientData.inventory.length > 1000) {
    logger.warn(`[AntiCheat] Unrealistic inventory size for ${tgId}`, {
      size: clientData.inventory.length,
    });
    return {
      isCheat: true,
      reason: 'Unrealistic inventory size',
      severity: 'high',
    };
  }

  // Check 8: Item IDs should be positive numbers
  if (clientData.inventory) {
    for (const item of clientData.inventory) {
      if (!Number.isFinite(item.id) || item.id <= 0) {
        logger.warn(`[AntiCheat] Invalid item ID for ${tgId}`, { itemId: item.id });
        return {
          isCheat: true,
          reason: 'Invalid item ID',
          severity: 'high',
        };
      }
    }
  }

  return {
    isCheat: false,
    severity: 'low',
  };
}

/**
 * Update player state tracking
 */
export function updatePlayerState(tgId: string, data: GameData): void {
  playerStates.set(tgId, {
    hp: data.hp,
    gold: data.gold,
    pixr: data.pixr,
    level: data.level,
    timestamp: data.updatedAt,
  });
}

/**
 * Clean up old states (every hour)
 */
export function cleanupStates(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let cleaned = 0;

  for (const [tgId, state] of playerStates.entries()) {
    if (state.timestamp < oneHourAgo) {
      playerStates.delete(tgId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[AntiCheat] Cleaned up ${cleaned} old player states`);
  }
}

// Run cleanup every hour
setInterval(cleanupStates, 60 * 60 * 1000);
