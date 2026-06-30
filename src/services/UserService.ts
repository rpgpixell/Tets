import { User } from '../db/schemas/index';
import { GameData, UserDocument } from '../types/index';
import { logger } from '../utils/logger';

/**
 * Get or create user
 */
export async function getOrCreateUser(tgId: string, username: string, firstName: string): Promise<UserDocument> {
  try {
    let user = await User.findOne({ tgId }).lean();

    if (!user) {
      logger.info('[UserService] Creating new user', { tgId, username });
      user = await User.create({
        tgId,
        username,
        firstName,
        data: null,
        refMilestones: {},
      });
    }

    return user;
  } catch (err) {
    logger.error('[UserService] Error getting/creating user', { error: err });
    throw err;
  }
}

/**
 * Get user data
 */
export async function getUserData(tgId: string): Promise<UserDocument | null> {
  try {
    return await User.findOne({ tgId }).lean();
  } catch (err) {
    logger.error('[UserService] Error fetching user', { error: err });
    throw err;
  }
}

/**
 * Update user data
 */
export async function updateUserData(
  tgId: string,
  data: Partial<UserDocument>,
): Promise<UserDocument | null> {
  try {
    const updated = await User.findOneAndUpdate({ tgId }, { $set: data }, { new: true }).lean();
    return updated;
  } catch (err) {
    logger.error('[UserService] Error updating user', { error: err });
    throw err;
  }
}

/**
 * Save game data
 */
export async function saveGameData(tgId: string, gameData: GameData): Promise<UserDocument | null> {
  try {
    const now = Date.now();
    const updated = await User.findOneAndUpdate(
      { tgId },
      {
        $set: {
          username: gameData.tgId ? '' : undefined,
          charId: gameData.charId || null,
          data: gameData,
          level: gameData.level || 1,
          cp: gameData.cp || 0,
          floor: gameData.floor || 1,
          updatedAt: now,
        },
      },
      { upsert: true, new: true },
    ).lean();

    return updated;
  } catch (err) {
    logger.error('[UserService] Error saving game data', { error: err });
    throw err;
  }
}

/**
 * Get leaderboard (top 50)
 */
export async function getLeaderboard(limit = 50): Promise<Partial<UserDocument>[]> {
  try {
    return await User.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 })
      .limit(limit)
      .select('tgId username firstName level cp floor charId')
      .lean();
  } catch (err) {
    logger.error('[UserService] Error fetching leaderboard', { error: err });
    throw err;
  }
}

/**
 * Get user stats
 */
export async function getUserStats(
  tgId: string,
): Promise<{ totalPlayers: number; playerRank: number } | null> {
  try {
    const user = await User.findOne({ tgId }).lean();
    if (!user) return null;

    const totalPlayers = await User.countDocuments({ charId: { $ne: null } });
    const playerRank =
      (await User.countDocuments({
        charId: { $ne: null },
        $or: [{ cp: { $gt: user.cp } }, { cp: user.cp, level: { $gt: user.level } }],
      })) + 1;

    return { totalPlayers, playerRank };
  } catch (err) {
    logger.error('[UserService] Error fetching user stats', { error: err });
    throw err;
  }
}
