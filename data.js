/*
  ══════════════════════════════════════════════════════
  data.js — Все игровые данные (статика)
  Содержит: персонажи (CHARS), навыки (SKILLS_DEF),
  этажи (FLOORS, только 1-10), типы предметов (ITEM_TYPES),
  редкости (RARITIES), улучшения (UPG_DEFS),
  фиктивные игроки рейтинга (FAKE_PLAYERS)
  ══════════════════════════════════════════════════════
*/

// ═══════════════════════════════
//  ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПЕРСОНАЖА
//  (объявлено здесь через var, т.к. data.js
//  грузится первым — даёт глобальную переменную,
//  доступную всем скриптам сразу, без ReferenceError
//  из-за TDZ у let/const между разными <script> тегами)
// ═══════════════════════════════
var G_CHAR = null;

// ═══════════════════════════════
//  ПЕРСОНАЖИ
// ═══════════════════════════════
const CHARS = {
  fire: {
    id: 'fire',
    name: 'Пирокан',
    avatar: '🔥',
    runSrc: '2.png',   runFrames: 8,  runFW: 128, runFH: 128,
    atkSrc: '1.png',   atkFrames: 8,  atkFW: 128, atkFH: 128,
    idleSrc: 'IDLE.png', idleFrames: 7, idleFW: 128, idleFH: 128,
    baseStats: { atk: 18, def: 4,  spd: 3,  hp: 85,  crit: 6,  dodge: 3, atkSpd: 1.2 },
    perk: 'fire_burst',
  },
  light: {
    id: 'light',
    name: 'Люмос',
    avatar: '✨',
    runSrc: 'run3.png',  runFrames: 8, runFW: 128, runFH: 128,
    atkSrc: 'atk3.png',  atkFrames: 10, atkFW: 128, atkFH: 128,
    idleSrc: 'idle3.png', idleFrames: 7, idleFW: 128, idleFH: 128,
    baseStats: { atk: 8,  def: 14, spd: 3,  hp: 130, crit: 4,  dodge: 4, atkSpd: 0.8 },
    perk: 'life_drain',
  },
  water: {
    id: 'water',
    name: 'Аквас',
    avatar: '💧',
    runSrc: 'run2.png',  runFrames: 8, runFW: 128, runFH: 128,
    atkSrc: 'atk1.png',  atkFrames: 7, atkFW: 128, atkFH: 128,
    idleSrc: 'idle2.png', idleFrames: 8, idleFW: 128, idleFH: 128,
    baseStats: { atk: 12, def: 6,  spd: 4,  hp: 95,  crit: 22, dodge: 5, atkSpd: 1.0 },
    perk: 'cryo_charge',
  },
};

// ═══════════════════════════════
//  НАВЫКИ ПЕРСОНАЖЕЙ
// ═══════════════════════════════
const SKILLS_DEF = {
  fire: [
    {
      id: 'fire_fireball', name: 'Огн. шар', icon: 'images/fs1.png', cd: 30,
      desc: 'Шар x2 урон',
      cast: function(target, lv) {
        lv = lv || 0;
        if (!target) return false;
        var dmg = Math.floor(G.stats.atk * 2 * (1 + lv * 0.10) * (0.9 + Math.random() * 0.2));
        var crit = Math.random() * 100 < effectiveCrit();
        if (crit) dmg = Math.floor(dmg * effectiveCritDmg());
        fireballs.push({
          worldX: player.worldX + 70, y: player.y + 40,
          targetM: target, speed: 700, dmg: dmg, crit: crit, angle: 0,
          isSkill: true, skillColor: '#ff4400'
        });
        showSkillFlash('rgba(255,80,0,0.25)');
        showDmgPop('\uD83D\uDD25\u00D72', PLAYER_SCREEN_X, player.y - 25, '#ff6600');
        return true;
      }
    },
    {
      id: 'fire_curse', name: 'Проклятие', icon: 'images/fs2.png', cd: 20,
      desc: '-30% DEF 30с',
      cast: function(target, lv) {
        if (!target) return false;
        target._cursed = true;
        target._cursedTimer = 30;
        target._defDebuff = 0.30 + (lv||0)*0.03;
        spawnParticles(target.worldX, target.y + 20, '#8800aa', 12);
        showDmgPop('CURSE!', target.worldX - worldX, target.y - 10, '#cc44ff');
        showSkillFlash('rgba(100,0,150,0.2)');
        return true;
      }
    },
    {
      id: 'fire_haste', name: 'Ярость', icon: 'images/fs3.png', cd: 25,
      desc: 'АТК.скор x2 5с',
      cast: function(target, lv) {
        skillBuffs.atkSpdBoost = { mult: 2.0, timer: 5 + (lv||0)*0.5 };
        showDmgPop('HASTE!', PLAYER_SCREEN_X, player.y - 25, '#ffff00');
        showSkillFlash('rgba(255,255,0,0.2)');
        return true;
      }
    },
  ],
  light: [
    {
      id: 'light_smite', name: 'Кара света', icon: 'images/ls1.png', cd: 30,
      desc: 'x2 урон +20% хил',
      cast: function(target, lv) {
        lv = lv || 0;
        if (!target) return false;
        var dmg = Math.floor(G.stats.atk * 2 * (1 + lv * 0.10) * (0.9 + Math.random() * 0.2));
        var crit = Math.random() * 100 < effectiveCrit();
        if (crit) dmg = Math.floor(dmg * effectiveCritDmg());
        fireballs.push({
          worldX: player.worldX + 70, y: player.y + 40,
          targetM: target, speed: 700, dmg: dmg, crit: crit, angle: 0,
          isSkill: true, skillColor: '#ffffaa',
          onHit: function() {
            var heal = Math.max(1, Math.floor(G.maxHp * 0.20));
            G.hp = Math.min(G.maxHp, G.hp + heal);
            showDmgPop('+' + heal + '\u2764', PLAYER_SCREEN_X, player.y - 30, '#44ff88');
            updateHUD();
          }
        });
        showSkillFlash('rgba(255,255,180,0.25)');
        showDmgPop('\u2728\u00D72', PLAYER_SCREEN_X, player.y - 25, '#ffffaa');
        return true;
      }
    },
    {
      id: 'light_shield', name: 'Щит света', icon: 'images/ls2.png', cd: 18,
      desc: '+20% DEF 7с',
      cast: function(target, lv) {
        skillBuffs.defBoost = { pct: 0.20 + (lv||0)*0.03, timer: 7 + (lv||0)*0.5 };
        showDmgPop('SHIELD!', PLAYER_SCREEN_X, player.y - 25, '#88ddff');
        showSkillFlash('rgba(100,200,255,0.2)');
        return true;
      }
    },
    {
      id: 'light_reflect', name: 'Отражение', icon: 'images/ls3.png', cd: 22,
      desc: 'Отражение 5% 5с',
      cast: function(target, lv) {
        skillBuffs.reflect = { pct: 0.05 + (lv||0)*0.01, timer: 5 + (lv||0)*0.5 };
        showDmgPop('REFLECT!', PLAYER_SCREEN_X, player.y - 25, '#aaffff');
        showSkillFlash('rgba(150,255,255,0.2)');
        return true;
      }
    },
  ],
  water: [
    {
      id: 'water_burst', name: 'Тройной удар', icon: 'images/ws2.png', cd: 30,
      desc: '3 выстрела подряд',
      cast: function(target, lv) {
        if (!target) return false;
        for (var i = 0; i < 3; i++) {
          (function(idx) {
            setTimeout(function() {
              if (!target || target.hp <= 0) return;
              var dmg = Math.floor(G.stats.atk * (0.85 + Math.random() * 0.3));
              var crit = Math.random() * 100 < effectiveCrit();
              if (crit) dmg = Math.floor(dmg * effectiveCritDmg());
              fireballs.push({
                worldX: player.worldX + 70, y: player.y + 38 + idx * 8,
                targetM: target, speed: 680, dmg: dmg, crit: crit, angle: 0,
                isSkill: true, skillColor: '#44aaff'
              });
            }, idx * 260);
          })(i);
        }
        showSkillFlash('rgba(0,100,255,0.2)');
        showDmgPop('\u00D73!', PLAYER_SCREEN_X, player.y - 25, '#44aaff');
        return true;
      }
    },
    {
      id: 'water_critup', name: 'Концентрация', icon: 'images/ws3.png', cd: 20,
      desc: '+20% Крит 7с',
      cast: function(target, lv) {
        skillBuffs.critBoost = { flat: 20 + (lv||0)*3, timer: 7 + (lv||0)*0.5 };
        showDmgPop('CRIT UP!', PLAYER_SCREEN_X, player.y - 25, '#00ffcc');
        showSkillFlash('rgba(0,255,200,0.2)');
        return true;
      }
    },
    {
      id: 'water_freeze', name: 'Заморозка', icon: 'images/ws1.png', cd: 20,
      desc: 'Заморозка 2с',
      cast: function(target, lv) {
        if (!target) return false;
        target._frozen = true;
        target._frozenTimer = 2 + (lv||0)*0.4;
        spawnParticles(target.worldX, target.y + 20, '#88ddff', 14);
        showDmgPop('FREEZE!', target.worldX - worldX, target.y - 10, '#88eeff');
        showSkillFlash('rgba(0,180,255,0.2)');
        return true;
      }
    },
  ],
};

// ═══════════════════════════════
//  ЭТАЖИ (только 1-10)
//  Каждый этаж: номер, название, CP для входа,
//  множители XP/золота, монстры, цвета фона, таблица лута
// ═══════════════════════════════
const FLOORS = [
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 1 — Тёмный лес (×1.0)
  // ═══════════════════════════════════════════════════════
  { n: 1, name: 'Тёмный лес', emoji: '🌲', cpReq: 0, xpMult: 1.0, goldMult: 1.0,
    desc: 'Начало пути. Слабые враги, лёгкое золото.',
    monsters: ['Гоблин','Гриб','Скелет','Волк'],
    baseXp: [15, 10, 25, 18],
    baseGold: [8, 5, 12, 10],
    bg: ['#0a1a0a','#0d2a0d','#0f3a0f'], sky: '#0a1a05',
    loot: [
      { slot:'body',   name:'Кожаный нагрудник', rarity:'common',   chance:20 },
      { slot:'helmet', name:'Шлем ополченца',     rarity:'common',   chance:15 },
      { slot:'legs',   name:'Штаны ополченца',    rarity:'common',   chance:15 },
      { slot:'weapon', name:'Посох огня',          rarity:'uncommon', chance:12, forClass:'fire' },
      { slot:'weapon', name:'Посох света',         rarity:'uncommon', chance:12, forClass:'light' },
      { slot:'weapon', name:'Посох воды',          rarity:'uncommon', chance:11, forClass:'water' },
      { slot:'boots',  name:'Сапоги',              rarity:'common',   chance:8  },
      { slot:'gloves', name:'Перчатки',            rarity:'common',   chance:7  },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 2 — Ледяные пещеры (×1.2)
  // ═══════════════════════════════════════════════════════
  { n: 2, name: 'Ледяные пещеры', emoji: '❄️', cpReq: 600, xpMult: 1.2, goldMult: 1.2,
    desc: 'Холодные глубины. Ледяные существа.',
    monsters: ['Ледяной голем','Голем земли','Голем льда','Снежный голем'],
    baseXp: [40, 45, 35, 30],
    baseGold: [20, 22, 18, 15],
    bg: ['#0a1525','#0d2040','#103060'], sky: '#050f1a',
    loot: [
      { slot:'body',   name:'Ледяной доспех',  rarity:'common',   chance:20 },
      { slot:'boots',  name:'Снегоступы',       rarity:'uncommon', chance:18 },
      { slot:'belt',   name:'Пояс холода',      rarity:'common',   chance:12 },
      { slot:'weapon', name:'Посох огня',        rarity:'uncommon', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',       rarity:'uncommon', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',        rarity:'uncommon', chance:15, forClass:'water' },
      { slot:'ring',   name:'Кольцо льда',       rarity:'uncommon', chance:5  },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 3 — Марс (×1.44)
  // ═══════════════════════════════════════════════════════
  { n: 3, name: 'Планета Марс', emoji: '🔴', cpReq: 1000, xpMult: 1.44, goldMult: 1.44,
    desc: 'Ржавые пустоши красной планеты. Марсианские твари безжалостны.',
    monsters: ['Орк-демон','Марсианин','Голем марса','Сильный голем'],
    baseXp: [70, 65, 80, 55],
    baseGold: [40, 38, 45, 32],
    bg: ['#3a1004','#4a1806','#5c2a0a'], sky: '#1e0800',
    loot: [
      { slot:'gloves', name:'Перчатки песка',  rarity:'uncommon', chance:22 },
      { slot:'body',   name:'Доспех пустоши',  rarity:'rare',     chance:18 },
      { slot:'legs',   name:'Штаны пустоши',   rarity:'uncommon', chance:15 },
      { slot:'weapon', name:'Посох огня',       rarity:'rare',     chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',      rarity:'rare',     chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',       rarity:'rare',     chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 4 — Земля мёртвых (×1.73)
  // ═══════════════════════════════════════════════════════
  { n: 4, name: 'Земля мёртвых', emoji: '💀', cpReq: 1500, xpMult: 1.73, goldMult: 1.73,
    desc: 'Падший ангел несёт смерть, но и щедрую награду.',
    monsters: ['Зомби воин','Зомби палач','Зомби','Зомби скаут'],
    baseXp: [110, 120, 100, 130],
    baseGold: [60, 65, 55, 70],
    bg: ['#101028','#18183a','#202050'], sky: '#080820',
    loot: [
      { slot:'body',   name:'Доспех небес',  rarity:'rare', chance:22 },
      { slot:'ring',   name:'Кольцо небес',  rarity:'rare', chance:18 },
      { slot:'belt',   name:'Пояс небес',    rarity:'rare', chance:15 },
      { slot:'weapon', name:'Посох огня',     rarity:'rare', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',    rarity:'epic', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',     rarity:'rare', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 5 — Бездна (×2.07)
  // ═══════════════════════════════════════════════════════
  { n: 5, name: 'Бездна', emoji: '🌑', cpReq: 4000, xpMult: 2.07, goldMult: 2.07,
    desc: 'Конец света. Максимальный опыт и золото.',
    monsters: ['Демон-воин','Ледяной великан','Костяной рыцарь','Зомбиноид'],
    baseXp: [150, 160, 170, 155],
    baseGold: [80, 85, 90, 82],
    bg: ['#0a0010','#100018','#180025'], sky: '#050008',
    loot: [
      { slot:'body',   name:'Доспех бездны', rarity:'epic', chance:22 },
      { slot:'ring',   name:'Кольцо теней',  rarity:'epic', chance:18 },
      { slot:'helmet', name:'Шлем бездны',   rarity:'epic', chance:15 },
      { slot:'weapon', name:'Посох огня',     rarity:'epic', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',    rarity:'epic', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',     rarity:'epic', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 6 — Призрачный замок (×2.49)
  // ═══════════════════════════════════════════════════════
  { n: 6, name: 'Призрачный замок', emoji: '👻', cpReq: 8000, xpMult: 2.49, goldMult: 2.49,
    desc: 'Проклятые стены и неупокоенные духи.',
    monsters: ['Кость','Банши','Рыцарь-мертвец','Призрачный зомби'],
    baseXp: [180, 190, 200, 210],
    baseGold: [95, 100, 105, 110],
    bg: ['#0f0f1f','#181828','#20203a'], sky: '#080814',
    loot: [
      { slot:'helmet', name:'Шлем проклятого',  rarity:'rare', chance:22 },
      { slot:'gloves', name:'Перчатки призрака', rarity:'epic', chance:18 },
      { slot:'legs',   name:'Штаны призрака',    rarity:'epic', chance:15 },
      { slot:'weapon', name:'Посох огня',         rarity:'epic', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',        rarity:'epic', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',         rarity:'epic', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 7 — Кристальные шахты (×2.99)
  // ═══════════════════════════════════════════════════════
  { n: 7, name: 'Кристальные шахты', emoji: '💎', cpReq: 14000, xpMult: 2.99, goldMult: 2.99,
    desc: 'Рудники полны горных духов и самоцветов.',
    monsters: ['Голем','Гоблин','Горный дух','Кристальный голем'],
    baseXp: [250, 240, 260, 270],
    baseGold: [130, 125, 135, 140],
    bg: ['#0a1020','#0f1830','#142040'], sky: '#060c18',
    loot: [
      { slot:'ring',   name:'Кристальное кольцо', rarity:'rare', chance:22 },
      { slot:'helmet', name:'Горный шлем',         rarity:'epic', chance:18 },
      { slot:'belt',   name:'Пояс шахтёра',        rarity:'epic', chance:15 },
      { slot:'weapon', name:'Посох огня',           rarity:'epic', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',          rarity:'epic', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',           rarity:'epic', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 8 — Пустыня Забытых (×3.58)
  // ═══════════════════════════════════════════════════════
  { n: 8, name: 'Пустыня Забытых', emoji: '🏜️', cpReq: 22000, xpMult: 3.58, goldMult: 3.58,
    desc: 'Иссушающий жар и древние стражи.',
    monsters: ['Мумия','Трольь','Хранитель пустыни','Фараон'],
    baseXp: [300, 290, 320, 330],
    baseGold: [160, 155, 170, 175],
    bg: ['#1a1000','#281800','#382200'], sky: '#100c00',
    loot: [
      { slot:'ring',   name:'Амулет фараона', rarity:'epic', chance:22 },
      { slot:'body',   name:'Доспех пустыни', rarity:'epic', chance:18 },
      { slot:'boots',  name:'Сапоги пустыни', rarity:'epic', chance:15 },
      { slot:'weapon', name:'Посох огня',      rarity:'epic', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',     rarity:'epic', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',      rarity:'epic', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 9 — Морские глубины (×4.3)
  // ═══════════════════════════════════════════════════════
  { n: 9, name: 'Морские глубины', emoji: '🌊', cpReq: 35000, xpMult: 4.3, goldMult: 4.3,
    desc: 'Тёмные воды таят чудовищ.',
    monsters: ['Камень','Мертвец','Морской дьявол','Водяной голем'],
    baseXp: [380, 420, 400, 390],
    baseGold: [200, 220, 210, 205],
    bg: ['#000a18','#001025','#001835'], sky: '#000810',
    loot: [
      { slot:'boots',  name:'Сапоги глубин',    rarity:'epic',   chance:22 },
      { slot:'ring',   name:'Жемчужина бездны', rarity:'epic',   chance:18 },
      { slot:'belt',   name:'Пояс морей',        rarity:'epic',   chance:10 },
      { slot:'weapon', name:'Посох огня',         rarity:'legend', chance:15, forClass:'fire' },
      { slot:'weapon', name:'Посох света',        rarity:'legend', chance:15, forClass:'light' },
      { slot:'weapon', name:'Посох воды',         rarity:'legend', chance:15, forClass:'water' },
    ]
  },
  
  // ═══════════════════════════════════════════════════════
  //  ЭТАЖ 10 — Небесная Цитадель (×5.16)
  // ═══════════════════════════════════════════════════════
  { n: 10, name: 'Небесная Цитадель', emoji: '🏯', cpReq: 55000, xpMult: 5.16, goldMult: 5.16,
    desc: 'Цитадель богов. Только сильнейшие выживут.',
    monsters: ['Небесный страж','Архангел','Потусторонний','Голем неба'],
    baseXp: [600, 700, 650, 800],
    baseGold: [350, 400, 380, 450],
    bg: ['#08080f','#101018','#181820'], sky: '#05050c',
    loot: [
      { slot:'body',   name:'Доспех Эгиды',  rarity:'legend', chance:20 },
      { slot:'ring',   name:'Кольцо богов',  rarity:'legend', chance:18 },
      { slot:'helmet', name:'Шлем цитадели', rarity:'legend', chance:15 },
      { slot:'weapon', name:'Посох огня',     rarity:'legend', chance:16, forClass:'fire' },
      { slot:'weapon', name:'Посох света',    rarity:'legend', chance:16, forClass:'light' },
      { slot:'weapon', name:'Посох воды',     rarity:'legend', chance:15, forClass:'water' },
    ]
  },
];

// ═══════════════════════════════
//  РЕДКОСТИ ПРЕДМЕТОВ
// ═══════════════════════════════
const RARITIES = [
  { id: 'common',   name: 'Обычный',     color: '#888',    dot: '#666',    weight: 55 },
  { id: 'uncommon', name: 'Необычный',   color: '#2ecc71', dot: '#2ecc71', weight: 28 },
  { id: 'rare',     name: 'Редкий',      color: '#3498db', dot: '#3498db', weight: 12 },
  { id: 'epic',     name: 'Эпический',   color: '#9b59b6', dot: '#9b59b6', weight: 4  },
  { id: 'legend',   name: 'Легендарный', color: '#f5c542', dot: '#f5c542', weight: 1  },
];

// ── Иконка предмета по слоту и редкости ──
function itemIcon(slot, rarity, forClass) {
  var r = rarity || 'common';
  var sfx = { common: 'c', uncommon: 'u', rare: 'r', epic: 'e', legend: 'l' }[r] || 'c';
  if (slot === 'weapon') {
    var pfx = { water: 'ww', fire: 'wf', light: 'wl' }[forClass] || 'ww';
    return 'images/' + pfx + sfx + '.png';
  }
  var slotPfx = { body: 'a', legs: 'l', gloves: 'p', boots: 'b', helmet: 'h', ring: 'ring', belt: 'belt' }[slot];
  if (!slotPfx) return 'images/ac.png';
  return 'images/' + slotPfx + sfx + '.png';
}

// Посохи — привязаны к классу персонажа
const STAFF_TYPES = [
  { slot: 'weapon', name: 'Посох огня',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'fire',  classLabel: 'Пирокан', classColor: '#ff7030' },
  { slot: 'weapon', name: 'Посох света', stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'light', classLabel: 'Люмос',   classColor: '#ffd040' },
  { slot: 'weapon', name: 'Посох воды',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'water', classLabel: 'Аквас',   classColor: '#40d0ff' },
];

// Общие типы предметов
const ITEM_TYPES = [
  { slot: 'body',   name: 'Нагрудник', stats: ['def', 'hp'],    primary: 'def'  },
  { slot: 'legs',   name: 'Штаны',     stats: ['def', 'dodge'], primary: 'def'  },
  { slot: 'gloves', name: 'Перчатки',  stats: ['atk', 'def'],   primary: 'atk'  },
  { slot: 'boots',  name: 'Боты',      stats: ['spd', 'dodge'], primary: 'spd'  },
  { slot: 'helmet', name: 'Шлем',      stats: ['def', 'hp'],    primary: 'def'  },
  { slot: 'ring',   name: 'Кольцо',    stats: ['atk', 'spd'],   primary: 'atk'  },
  { slot: 'belt',   name: 'Пояс',      stats: ['hp', 'def'],    primary: 'hp'   },
];

// ═══════════════════════════════
//  УЛУЧШЕНИЯ ХАРАКТЕРИСТИК
// ═══════════════════════════════
const UPG_DEFS = [
  { id: 'atk',     name: 'Атака',          svgId: 'upg-atk',    stat: 'atk',     bonus: 3,    maxLv: 60, baseCost: 80,  currency: 'gold' },
  { id: 'def',     name: 'Защита',         svgId: 'upg-def',    stat: 'def',     bonus: 2,    maxLv: 60, baseCost: 70,  currency: 'gold' },
  { id: 'hp',      name: 'Макс. HP',       svgId: 'upg-hp',     stat: 'hp',      bonus: 15,   maxLv: 60, baseCost: 60,  currency: 'gold' },
  { id: 'spd',     name: 'Скорость',       svgId: 'upg-spd',    stat: 'spd',     bonus: 1,    maxLv: 60, baseCost: 100, currency: 'gold' },
  { id: 'atkSpd',  name: 'Скорость атаки', svgId: 'upg-atkspd', stat: 'atkSpd',  bonus: 0.15, maxLv: 60, baseCost: 150, currency: 'gold' },
  { id: 'crit',    name: 'Шанс крита',     svgId: 'upg-crit',   stat: 'crit',    bonus: 3,    maxLv: 10, baseCost: 50,  currency: 'pixr' },
  { id: 'critDmg', name: 'Сила крита',     svgId: 'upg-critdmg',stat: 'critDmg', bonus: 0.15, maxLv: 10, baseCost: 50,  currency: 'pixr' },
  { id: 'dodge',   name: 'Уклонение',      svgId: 'upg-dodge',  stat: 'dodge',   bonus: 2,    maxLv: 10, baseCost: 50,  currency: 'pixr' },
];

// Pixel SVG иконки для характеристик
function upgIcon(svgId) {
  const icons = {
    'upg-atk':    `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="2" y="2" width="2" height="2" fill="#ff6060"/><rect x="4" y="4" width="2" height="2" fill="#ff6060"/><rect x="6" y="6" width="2" height="2" fill="#ff8080"/><rect x="8" y="8" width="2" height="2" fill="#ff8080"/><rect x="10" y="10" width="2" height="2" fill="#e74c3c"/><rect x="12" y="12" width="2" height="2" fill="#e74c3c"/><rect x="4" y="2" width="8" height="2" fill="#ff6060"/><rect x="12" y="2" width="2" height="10" fill="#ff6060"/><rect x="2" y="4" width="2" height="4" fill="#c0392b"/><rect x="2" y="8" width="4" height="2" fill="#c0392b"/></svg>`,
    'upg-def':    `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="3" y="1" width="10" height="2" fill="#3498db"/><rect x="1" y="3" width="2" height="6" fill="#3498db"/><rect x="13" y="3" width="2" height="6" fill="#3498db"/><rect x="3" y="1" width="2" height="4" fill="#5dade2"/><rect x="11" y="1" width="2" height="4" fill="#5dade2"/><rect x="3" y="9" width="4" height="2" fill="#3498db"/><rect x="9" y="9" width="4" height="2" fill="#3498db"/><rect x="5" y="11" width="2" height="2" fill="#3498db"/><rect x="9" y="11" width="2" height="2" fill="#3498db"/><rect x="7" y="13" width="2" height="2" fill="#2980b9"/><rect x="3" y="3" width="10" height="6" fill="#2471a3" opacity="0.5"/></svg>`,
    'upg-hp':     `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="2" y="4" width="4" height="4" fill="#e74c3c"/><rect x="10" y="4" width="4" height="4" fill="#e74c3c"/><rect x="0" y="6" width="16" height="6" fill="#e74c3c"/><rect x="2" y="12" width="12" height="2" fill="#e74c3c"/><rect x="4" y="14" width="8" height="2" fill="#c0392b"/><rect x="6" y="3" width="4" height="10" fill="#ff6b6b"/><rect x="4" y="5" width="8" height="6" fill="#ff6b6b"/></svg>`,
    'upg-spd':    `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="0" y="6" width="4" height="2" fill="#2ecc71"/><rect x="2" y="4" width="4" height="2" fill="#2ecc71"/><rect x="4" y="2" width="4" height="2" fill="#27ae60"/><rect x="6" y="4" width="4" height="2" fill="#2ecc71"/><rect x="8" y="2" width="4" height="2" fill="#2ecc71"/><rect x="10" y="4" width="4" height="2" fill="#27ae60"/><rect x="2" y="8" width="6" height="2" fill="#2ecc71" opacity="0.6"/><rect x="4" y="10" width="8" height="2" fill="#2ecc71" opacity="0.4"/></svg>`,
    'upg-crit':   `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="7" y="0" width="2" height="4" fill="#f5c542"/><rect x="7" y="12" width="2" height="4" fill="#f5c542"/><rect x="0" y="7" width="4" height="2" fill="#f5c542"/><rect x="12" y="7" width="4" height="2" fill="#f5c542"/><rect x="2" y="2" width="2" height="2" fill="#f5c542"/><rect x="12" y="2" width="2" height="2" fill="#f5c542"/><rect x="2" y="12" width="2" height="2" fill="#f5c542"/><rect x="12" y="12" width="2" height="2" fill="#f5c542"/><rect x="5" y="5" width="6" height="6" fill="#f5c542"/><rect x="6" y="6" width="4" height="4" fill="#fff8d0"/></svg>`,
    'upg-critdmg':`<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="7" y="0" width="2" height="4" fill="#ff6020"/><rect x="7" y="12" width="2" height="4" fill="#ff6020"/><rect x="0" y="7" width="4" height="2" fill="#ff6020"/><rect x="12" y="7" width="4" height="2" fill="#ff6020"/><rect x="2" y="2" width="2" height="2" fill="#ff6020"/><rect x="12" y="2" width="2" height="2" fill="#ff6020"/><rect x="2" y="12" width="2" height="2" fill="#ff6020"/><rect x="12" y="12" width="2" height="2" fill="#ff6020"/><rect x="5" y="5" width="6" height="6" fill="#ff8040"/><rect x="6" y="6" width="4" height="4" fill="#ffddaa"/><rect x="7" y="4" width="2" height="8" fill="#fff" opacity="0.5"/><rect x="4" y="7" width="8" height="2" fill="#fff" opacity="0.5"/></svg>`,
    'upg-dodge':  `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="4" y="0" width="2" height="4" fill="#9b59b6"/><rect x="10" y="0" width="2" height="4" fill="#9b59b6"/><rect x="0" y="4" width="4" height="2" fill="#9b59b6"/><rect x="12" y="4" width="4" height="2" fill="#9b59b6"/><rect x="0" y="10" width="4" height="2" fill="#9b59b6"/><rect x="12" y="10" width="4" height="2" fill="#9b59b6"/><rect x="4" y="12" width="2" height="4" fill="#9b59b6"/><rect x="10" y="12" width="2" height="4" fill="#9b59b6"/><rect x="6" y="4" width="4" height="2" fill="#c39bd3"/><rect x="4" y="6" width="2" height="4" fill="#c39bd3"/><rect x="10" y="6" width="2" height="4" fill="#c39bd3"/><rect x="6" y="10" width="4" height="2" fill="#c39bd3"/></svg>`,
    'upg-atkspd': `<svg width="36" height="36" viewBox="0 0 16 16" fill="none" style="image-rendering:pixelated"><rect x="2" y="2" width="2" height="2" fill="#ffaa00"/><rect x="4" y="4" width="2" height="2" fill="#ffaa00"/><rect x="6" y="6" width="4" height="2" fill="#ffcc44"/><rect x="8" y="4" width="2" height="2" fill="#ffaa00"/><rect x="10" y="2" width="2" height="2" fill="#ffaa00"/><rect x="4" y="8" width="2" height="2" fill="#ffcc44"/><rect x="2" y="10" width="2" height="2" fill="#ffaa00"/><rect x="10" y="8" width="2" height="2" fill="#ffcc44"/><rect x="12" y="6" width="2" height="2" fill="#ffaa00"/><rect x="12" y="10" width="2" height="2" fill="#ffaa00"/><rect x="4" y="12" width="8" height="2" fill="#ff8800"/></svg>`,
  };
  return icons[svgId] || '';
}

// SVG монетки (золото) для кнопок улучшений
function goldCoinSvg(size) {
  size = size || 14;
  return `<svg width="${size}" height="${size}" viewBox="0 0 10 10" fill="none" style="image-rendering:pixelated;vertical-align:middle;flex-shrink:0"><rect x="2" y="0" width="6" height="2" fill="#f5c542"/><rect x="0" y="2" width="10" height="6" fill="#f5c542"/><rect x="2" y="8" width="6" height="2" fill="#f5c542"/><rect x="3" y="2" width="4" height="6" fill="#c8a000"/><rect x="4" y="3" width="2" height="4" fill="#f5c542"/></svg>`;
}
// ═══════════════════════════════
//  РУДА (Материалы для крафта)
// ═══════════════════════════════
const ORE_TYPES = [
  { id: 'core',  name: 'Руда',        rarity: 'common',   icon: 'images/core.png', color: '#888'    },
  { id: 'uore',  name: 'Ред. руда',   rarity: 'uncommon', icon: 'images/uore.png', color: '#2ecc71' },
  { id: 'rore',  name: 'Редк. руда',  rarity: 'rare',     icon: 'images/rore.png', color: '#3498db' },
  { id: 'eore',  name: 'Эпич. руда',  rarity: 'epic',     icon: 'images/eore.png', color: '#9b59b6' },
  { id: 'lore',  name: 'Леген. руда', rarity: 'legend',   icon: 'images/lore.png', color: '#f5c542' },
];

// Шансы дропа руды по этажам (%), отдельный бросок, 1-3 шт
const ORE_DROP_TABLE = {
  1:  { core: 2,   uore: 0,   rore: 0,   eore: 0,   lore: 0   },
  2:  { core: 3,   uore: 1.5, rore: 0,   eore: 0,   lore: 0   },
  3:  { core: 4,   uore: 2.5, rore: 0,   eore: 0,   lore: 0   },
  4:  { core: 4,   uore: 3,   rore: 1,   eore: 0,   lore: 0   },
  5:  { core: 4,   uore: 3.5, rore: 2,   eore: 0,   lore: 0   },
  6:  { core: 4,   uore: 4,   rore: 2.5, eore: 0.5, lore: 0   },
  7:  { core: 4,   uore: 4,   rore: 3,   eore: 1,   lore: 0   },
  8:  { core: 4,   uore: 4,   rore: 3.5, eore: 1.5, lore: 0.2 },
  9:  { core: 4,   uore: 4,   rore: 4,   eore: 2,   lore: 0.4 },
  10: { core: 4,   uore: 4,   rore: 4,   eore: 2.5, lore: 0.6 },
};

// ═══════════════════════════════
//  ТИПЫ РУН
// ═══════════════════════════════
const RUNE_TYPES = [
  { id: 'crune', name: 'Обычная руна',    rarity: 'common',   icon: 'images/crune.png', color: '#888888',
    stats: { atk: [1, 10] } },
  { id: 'urune', name: 'Необычная руна',  rarity: 'uncommon', icon: 'images/urune.png', color: '#2ecc71',
    stats: { atk: [5, 20] } },
  { id: 'rrune', name: 'Редкая руна',     rarity: 'rare',     icon: 'images/rrune.png', color: '#3498db',
    stats: { atk: [10, 30], def: [10, 30] } },
  { id: 'erune', name: 'Эпическая руна',  rarity: 'epic',     icon: 'images/erune.png', color: '#9b59b6',
    stats: { atk: [30, 50], def: [30, 50], hp: [100, 300] } },
  { id: 'lrune', name: 'Легендарная руна',rarity: 'legend',   icon: 'images/lrune.png', color: '#f5c542',
    stats: { atk: [50, 100], def: [50, 100], hp: [300, 1000] } },
];

// Стоимость вставки руны по редкости предмета (PIXR)
const RUNE_INSERT_COST = {
  common: 1, uncommon: 10, rare: 50, epic: 300, legend: 1000
};

// ═══════════════════════════════
//  РЕЦЕПТЫ КРАФТА
// ═══════════════════════════════
const CRAFT_RECIPES = [
  {
    id: 'bless_stone',
    name: 'Камень заточки',
    desc: 'Защищает предмет от разрушения при провале заточки',
    icon: 'images/bless.png',
    result: { type: 'bless_stone', qty: 1 },
    cost: [
      { oreId: 'core', qty: 100 },
      { oreId: 'uore', qty: 100 },
    ],
    pixrCost: 50,
    chance: 100,
  },
  {
    id: 'crune',
    name: 'Обычная руна',
    desc: '+1-10 ATK при вставке в предмет',
    icon: 'images/crune.png',
    result: { type: 'rune', runeId: 'crune', qty: 1 },
    cost: [ { oreId: 'core', qty: 100 } ],
    pixrCost: 5,
    chance: 70,
  },
  {
    id: 'urune',
    name: 'Необычная руна',
    desc: '+5-20 ATK при вставке в предмет',
    icon: 'images/urune.png',
    result: { type: 'rune', runeId: 'urune', qty: 1 },
    cost: [ { oreId: 'uore', qty: 100 }, { runeId: 'crune', qty: 5 } ],
    pixrCost: 10,
    chance: 70,
  },
  {
    id: 'rrune',
    name: 'Редкая руна',
    desc: '+10-30 ATK, +10-30 DEF при вставке',
    icon: 'images/rrune.png',
    result: { type: 'rune', runeId: 'rrune', qty: 1 },
    cost: [ { oreId: 'rore', qty: 100 }, { runeId: 'urune', qty: 5 } ],
    pixrCost: 20,
    chance: 70,
  },
  {
    id: 'erune',
    name: 'Эпическая руна',
    desc: '+30-50 ATK, +30-50 DEF, +100-300 HP',
    icon: 'images/erune.png',
    result: { type: 'rune', runeId: 'erune', qty: 1 },
    cost: [ { oreId: 'eore', qty: 100 }, { runeId: 'rrune', qty: 5 } ],
    pixrCost: 40,
    chance: 70,
  },
  {
    id: 'lrune',
    name: 'Легендарная руна',
    desc: '+50-100 ATK, +50-100 DEF, +300-1000 HP',
    icon: 'images/lrune.png',
    result: { type: 'rune', runeId: 'lrune', qty: 1 },
    cost: [ { oreId: 'lore', qty: 100 }, { runeId: 'erune', qty: 5 } ],
    pixrCost: 80,
    chance: 70,
  },
];

// ═══════════════════════════════
//  НОВЫЕ ШАНСЫ ЗАТОЧКИ (+1..+15)
// ═══════════════════════════════
var REFINE_CHANCES_V2 = [95, 85, 75, 65, 55, 45, 35, 25, 15, 5, 5, 5, 5, 5, 1];
var REFINE_MAX_V2     = 15;
var REFINE_GOLD_COST  = [100, 200, 400, 700, 1200, 2000, 3500, 6000, 10000, 20000, 20000, 20000, 20000, 20000, 50000];
