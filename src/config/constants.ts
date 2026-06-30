// ═══════════════════════════════════════════════════════
// GAME CONSTANTS
// ═══════════════════════════════════════════════════════

export const GAME_CONSTANTS = {
  // Characters
  VALID_CHAR_IDS: ['fire', 'light', 'water'],
  CHARS_BASE: {
    fire: { atk: 18, def: 4, spd: 3, hp: 85, crit: 6, dodge: 3, atkSpd: 1.2, critDmg: 0 },
    light: { atk: 8, def: 14, spd: 3, hp: 130, crit: 4, dodge: 4, atkSpd: 0.8, critDmg: 0 },
    water: { atk: 12, def: 6, spd: 4, hp: 95, crit: 22, dodge: 5, atkSpd: 1.0, critDmg: 0 },
  },

  // Rarities
  RARITIES: [
    { id: 'common', weight: 55 },
    { id: 'uncommon', weight: 28 },
    { id: 'rare', weight: 12 },
    { id: 'epic', weight: 4 },
    { id: 'legend', weight: 1 },
  ],

  // Items
  ITEM_TYPES: [
    { slot: 'body', name: 'Нагрудник', stats: ['def', 'hp'], primary: 'def' },
    { slot: 'legs', name: 'Штаны', stats: ['def', 'dodge'], primary: 'def' },
    { slot: 'gloves', name: 'Перчатки', stats: ['atk', 'def'], primary: 'atk' },
    { slot: 'boots', name: 'Боты', stats: ['spd', 'dodge'], primary: 'spd' },
    { slot: 'helmet', name: 'Шлем', stats: ['def', 'hp'], primary: 'def' },
    { slot: 'ring', name: 'Кольцо', stats: ['atk', 'spd'], primary: 'atk' },
    { slot: 'belt', name: 'Пояс', stats: ['hp', 'def'], primary: 'hp' },
  ],

  STAFF_TYPES: [
    {
      slot: 'weapon',
      name: 'Посох огня',
      stats: ['atk', 'crit', 'critDmg'],
      primary: 'atk',
      forClass: 'fire',
      classLabel: 'Пирокан',
      classColor: '#ff7030',
    },
    {
      slot: 'weapon',
      name: 'Посох света',
      stats: ['atk', 'crit', 'critDmg'],
      primary: 'atk',
      forClass: 'light',
      classLabel: 'Люмос',
      classColor: '#ffd040',
    },
    {
      slot: 'weapon',
      name: 'Посох воды',
      stats: ['atk', 'crit', 'critDmg'],
      primary: 'atk',
      forClass: 'water',
      classLabel: 'Аквас',
      classColor: '#40d0ff',
    },
  ],

  // Exchange rates
  PIXR_EXCHANGE_THRESHOLD: 5_000_000,
  PIXR_PER_GRAM_CHEAP: 1000,
  PIXR_PER_GRAM_EXP: 2000,
  GRAM_PER_PIXR_RATE: 800,

  // Wallet
  WALLET_ADDRESS: 'UQD5hiR-ziWL1r2jggCKxzhE7K7yNvH3FqnckOdXosVKYEfb',
  WALLET_MIN_AMOUNT: 1,
  WALLET_MAX_AMOUNT: 10000,

  // Referral
  REF_GOLD_PER_MILESTONE: 500,
  REF_MILESTONE_STEP: 5,
  REF_DEPOSIT_BONUS: 0.05,

  // Market
  MARKET_OPEN_COST: 1,
  MARKET_MAX_LOTS: 3,
  MARKET_TTL_MS: 48 * 60 * 60 * 1000,
  MARKET_COMMISSION: 0.1,
  MARKET_MIN_RARITY: ['uncommon', 'rare', 'epic', 'legend'],

  // Ore drops
  DROP_ORE_MAX_QTY_PER_TYPE: 3,
  DROP_ORE_MAX_TYPES: 5,
  ORE_NAMES: {
    core: 'Обычная руда',
    uore: 'Необычная руда',
    rore: 'Редкая руда',
    eore: 'Эпическая руда',
    lore: 'Легендарная руда',
  },
  VALID_ORES: ['core', 'uore', 'rore', 'eore', 'lore'],

  // Daily tasks
  DAILY_MILESTONES: [
    { id: 0, minutes: 10, rewardType: 'potions', amount: 50 },
    { id: 1, minutes: 20, rewardType: 'gold', amount: 1000 },
    { id: 2, minutes: 30, rewardType: 'pixr', amount: 5 },
    { id: 3, minutes: 60, rewardType: 'gold', amount: 2000 },
  ],

  // Floors
  FLOOR_MAX_RARITY: {
    1: 'common',
    2: 'uncommon',
    3: 'uncommon',
    4: 'rare',
    5: 'rare',
    6: 'rare',
    7: 'epic',
    8: 'epic',
    9: 'legend',
    10: 'legend',
  },

  FLOOR_MIN_RARITY: {
    1: 'common',
    2: 'common',
    3: 'common',
    4: 'common',
    5: 'common',
    6: 'common',
    7: 'common',
    8: 'uncommon',
    9: 'uncommon',
    10: 'uncommon',
  },

  CRIT_DMG_BY_RARITY: {
    common: 0.05,
    uncommon: 0.08,
    rare: 0.12,
    epic: 0.18,
    legend: 0.25,
  },

  STAT_CAP: { crit: 5, dodge: 5 },

  // Upgrades
  UPG_DEFS: [
    { id: 'atk', stat: 'atk', bonus: 3 },
    { id: 'def', stat: 'def', bonus: 2 },
    { id: 'hp', stat: 'hp', bonus: 15 },
    { id: 'spd', stat: 'spd', bonus: 1 },
    { id: 'atkSpd', stat: 'atkSpd', bonus: 0.15 },
    { id: 'crit', stat: 'crit', bonus: 3 },
    { id: 'critDmg', stat: 'critDmg', bonus: 0.15 },
    { id: 'dodge', stat: 'dodge', bonus: 2 },
  ],

  // PvP
  PVP_ATTEMPTS_PER_DAY: 10,
  PVP_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  PVP_RATING_RANGE: 200,
  PVP_WIN_RATING_STRONG: 10,
  PVP_WIN_RATING_WEAK: 5,
  PVP_LOSS_RATING: -5,

  // Boss
  BOSS_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  BOSS_DEFS: [
    { id: 1, name: 'Король гоблинов', cpReq: 0, hp: 500, atk: 20 },
    { id: 2, name: 'Ледяной титан', cpReq: 1000, hp: 1000, atk: 40 },
    { id: 3, name: 'Орк-демон', cpReq: 2400, hp: 2000, atk: 80 },
    { id: 4, name: 'Зомби-лорд', cpReq: 5000, hp: 4000, atk: 160 },
    { id: 5, name: 'Страж теней', cpReq: 9000, hp: 8000, atk: 320 },
    { id: 6, name: 'Голем хаоса', cpReq: 16000, hp: 16000, atk: 640 },
    { id: 7, name: 'Мёртвый палач', cpReq: 28000, hp: 32000, atk: 1280 },
    { id: 8, name: 'Грибной повелитель', cpReq: 50000, hp: 64000, atk: 2560 },
    { id: 9, name: 'Тёмный голем', cpReq: 90000, hp: 128000, atk: 5120 },
    { id: 10, name: 'Тёмный властелин', cpReq: 160000, hp: 256000, atk: 10240 },
  ],

  // Premium tiers
  PREM_TIERS: {
    gold: { name: 'GOLD', days: 7, cost: 10, xp: 1.5, gold: 1.5, drop: 1.5, pixr: 1, refine: 0 },
    plat: { name: 'PLATINUM', days: 7, cost: 50, xp: 2, gold: 2, drop: 2, pixr: 2, refine: 0 },
    ultra: { name: 'ULTRA', days: 30, cost: 300, xp: 3, gold: 3, drop: 3, pixr: 4, refine: 20 },
  },
};

export default GAME_CONSTANTS;
