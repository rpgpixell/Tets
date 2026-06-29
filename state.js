/*
  ══════════════════════════════════════════════════════
  state.js — Глобальное состояние игры и базовые расчёты
  Содержит: объект G (все данные игрока), расчёт CP,
  вспомогательные функции для этажей
  ══════════════════════════════════════════════════════
*/

// ═══════════════════════════════
//  ГЛОБАЛЬНОЕ СОСТОЯНИЕ ИГРЫ
//  G — центральный объект: золото, уровень, HP,
//  характеристики, инвентарь, экипировка, навыки
// ═══════════════════════════════
const G = {
  gold: 111111110,
  pixr: 1111110,
  gram: 0,
  level: 1,
  xp: 0,
  xpNeeded: 100,
  floor: 1,
  maxFloor: 1,
  killCount: 0,

  stats: {
    atk: 10, def: 5, spd: 3, hp: 100,
    crit: 5, dodge: 3, atkSpd: 1.0,
  },
  hp: 100,
  maxHp: 100,

  // Уровни вложенных улучшений
  upg: { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, critDmg: 0, dodge: 0, atkSpd: 0 },
  potionLv: 0,
  bp: { active: false, claimed: [] },
  prem: { tier: null, expiresAt: 0 },

  // Инвентарь и экипировка
  owned: {},
  skills: {},        // { skillId: { unlocked, level } }
  inventory: [],
  equipped: { 
    weapon: null, 
    body: null,      // ← добавлено
    legs: null,      // ← добавлено
    gloves: null,    // ← добавлено
    belt: null,      // ← добавлено
    ring: null, 
    boots: null, 
    helmet: null 
  },
  invFilter: 'all',
  boss: { floor: 1, lastFightTime: 0 }, // lastFightTime = timestamp победы (ms)
  marketUnlocked: false,
  arenaRating: 1000,
  // Материалы крафта
  ore: { core: 0, uore: 0, rore: 0, eore: 0, lore: 0 },
  blessStones: 0,
  runes: { crune: 0, urune: 0, rrune: 0, erune: 0, lrune: 0 },
  pvpAttempts: 0,
  pvpAttemptsDate: '',
  pvpRefreshes: 0,
  pvpRefreshDate: '',
};

// Базовые статы — отдельно, чтобы пересчитывать после снятия предметов
G.baseStats = { atk: 10, def: 5, spd: 3, hp: 100, crit: 5, dodge: 3, atkSpd: 1.0, critDmg: 0 };

// ── Расчёт боевой мощи (CP) ──
function calcCP() {
  const s = G.stats;
  const critDmgBonus = (typeof effectiveCritDmg === 'function')
    ? Math.max(0, effectiveCritDmg() - 1.8)
    : (s.critDmg || 0);
  return Math.floor(
    s.atk * 4 + s.def * 3 + s.hp * 0.5 + s.spd * 6 + s.crit * 8 + s.dodge * 8
    + critDmgBonus * 500
    + ((s.atkSpd || 1.0) - 1.0) * 200
    + G.level * 20
  );
}

// ── Конфигурации этажей ──
function floorCfg()     { return FLOORS[Math.min(G.floor - 1, FLOORS.length - 1)]; }
function nextFloorCfg() { return FLOORS[Math.min(G.floor,     FLOORS.length - 1)]; }