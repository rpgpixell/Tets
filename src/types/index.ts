// ═══════════════════════════════════════════════════════
// TypeScript Types для всего приложения
// ═══════════════════════════════════════════════════════

export interface TelegramUser {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResult {
  ok: boolean;
  user?: TelegramUser;
  error?: string;
}

// ═══════════════════════════════════════════════════════
// GAME STATE TYPES
// ═══════════════════════════════════════════════════════

export interface ItemStats {
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
  crit?: number;
  dodge?: number;
  atkSpd?: number;
  critDmg?: number;
}

export interface GameItem {
  id: number;
  slot: 'weapon' | 'body' | 'legs' | 'gloves' | 'boots' | 'helmet' | 'ring' | 'belt';
  name: string;
  icon: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
  level: number;
  stats: ItemStats;
  forClass?: string | null;
  classLabel?: string | null;
  classColor?: string | null;
  _equipped?: boolean;
  rune?: ItemStats;
  refine?: number;
  enchants?: Record<string, number>;
}

export interface EquippedItems {
  weapon?: number;
  body?: number;
  legs?: number;
  gloves?: number;
  boots?: number;
  helmet?: number;
  ring?: number;
  belt?: number;
}

export interface PlayerUpgrades {
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
  atkSpd?: number;
  crit?: number;
  critDmg?: number;
  dodge?: number;
}

export interface DailyTasks {
  date: string;
  seconds: number;
  claimed: number[];
}

export interface BossProgress {
  floor: number;
  lastFightTime: number;
}

export interface PremiumStatus {
  tier: 'gold' | 'plat' | 'ultra';
  expiresAt: number;
}

export interface BattlePassStatus {
  active: boolean;
  claimed: number[];
}

export interface GameData {
  tgId: string;
  charId?: string | null;
  level: number;
  cp: number;
  floor: number;
  maxFloor: number;
  hp: number;
  maxHp: number;
  gold: number;
  pixr: number;
  gram: number;
  xp: number;
  xpNeeded: number;
  killCount: number;
  inventory: GameItem[];
  equipped: EquippedItems;
  upg: PlayerUpgrades;
  stats: ItemStats;
  baseStats: ItemStats;
  potions: number;
  potionLv: number;
  potionThreshold: number;
  dailyTasks: DailyTasks;
  specialTasksClaimed: Record<string, number>;
  arenaRating: number;
  pvpAttempts: number;
  pvpAttemptsDate: string;
  pvpRefreshes: number;
  pvpRefreshDate: string;
  boss?: BossProgress;
  prem?: PremiumStatus;
  bp?: BattlePassStatus;
  marketUnlocked: boolean;
  ore: Record<string, number>;
  blessStones: Record<string, number>;
  runes: Record<string, number>;
  updatedAt: number;
  _resetAt?: number;
  _adminUpdatedAt?: number;
}

export interface UserDocument {
  tgId: string;
  username: string;
  firstName: string;
  charId?: string | null;
  data?: GameData | null;
  level: number;
  cp: number;
  floor: number;
  updatedAt: number;
  refClaimVer: number;
  refBy?: string | null;
  refMilestones: Record<string, number>;
}

// ════════════���══════════════════════════════════════════
// TRANSACTION TYPES
// ═══════════════════════════════════════════════════════

export interface Transaction {
  id: string;
  userId: string;
  username: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  wallet: string;
  memo: string;
  createdAt: number;
  approvedAt?: number | null;
  rejectedAt?: number | null;
  adminNote: string;
}

// ═══════════════════════════════════════════════════════
// MARKET TYPES
// ═══════════════════════════════════════════════════════

export interface MarketListing {
  listingId: string;
  sellerId: string;
  sellerName: string;
  item: GameItem | OreItem;
  price: number;
  status: 'active' | 'sold' | 'cancelled';
  buyerId?: string | null;
  buyerName?: string | null;
  createdAt: number;
  expiresAt: number;
  soldAt?: number | null;
  cancelledAt?: number | null;
  pendingPixr?: number | null;
  claimedAt?: number | null;
}

export interface OreItem {
  isOre: boolean;
  oreId: string;
  qty: number;
  name: string;
  icon: string;
  rarity: string;
}

// ═══════════════════════════════════════════════════════
// PVP TYPES
// ═══════════════════════════════════════════════════════

export interface PvpBattle {
  battleId: string;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  attackerChar?: string | null;
  defenderChar?: string | null;
  winnerId: string;
  ratingChange: number;
  attackerRatingBefore: number;
  defenderRatingBefore: number;
  attackerDmgDealt: number;
  defenderDmgDealt: number;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════��═══════════

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  ok: boolean;
  items: T[];
  page: number;
  total: number;
  hasMore: boolean;
}

// ═══════════════════════════════════════════════════════
// SKILL & BUFF TYPES
// ═══════════════════════════════════════════════════════

export interface SkillBuff {
  timer: number;
  pct?: number;
  duration?: number;
}

export interface Skills {
  [key: string]: {
    level: number;
    cooldown: number;
    lastUsed?: number;
  };
}

// ═══════════════════════════════════════════════════════
// ADMIN TYPES
// ═══════════════════════════════════════════════════════

export interface AdminAction {
  admin: string;
  action: string;
  target: string;
  details: Record<string, any>;
  timestamp: number;
}
