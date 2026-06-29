/*
  ══════════════════════════════════════════════════════
  server.js — Backend для PIXEL RPG
  Express + MongoDB (Mongoose) + Telegram WebApp auth
  + Админ-панель + Транзакции (пополнение/вывод)
  + Long Polling для уведомлений клиентов
  + Telegram Bot (встроенный)
  ══════════════════════════════════════════════════════
*/

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const crypto   = require('crypto');
const path     = require('path');

// ── Telegram Bot ──

const { initBot, getBot }     = require('./bot');
const { registerAdminRoutes } = require('./admin');

// ── BOT_TOKEN (нужен для верификации запросов от бота) ──
const BOT_TOKEN = process.env.BOT_TOKEN || '';
if (!BOT_TOKEN) console.warn('⚠️  BOT_TOKEN не задан — /bot/transaction не будет работать');


const http = require('http');

const app    = express();
const server = http.createServer(app);
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';
if (!process.env.BOT_USERNAME) console.warn('⚠️  BOT_USERNAME не задан');
const REF_GOLD_PER_MILESTONE = 500;
const REF_MILESTONE_STEP     = 5;
const REF_DEPOSIT_BONUS      = 0.05; // 5% от депозита GRAM другу

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb', type: ['application/json', 'text/plain'] }));

// ═══════════════════════════════
//  MongoDB
// ═══════════════════════════════
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI не задан');
  process.exit(1);
}

console.log('🔗 [MongoDB] Подключение...');

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 10000,
})
.then(() => {
  console.log('✅ MongoDB подключена');
  console.log(`📊 База данных: ${mongoose.connection.db.databaseName}`);
})
.catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

// ═══════════════════════════════
//  СХЕМЫ
// ═══════════════════════════════

// ── Пользователи ──
const SaveSchema = new mongoose.Schema({
  tgId:      { type: String, required: true },
  username:  { type: String, default: '' },
  firstName: { type: String, default: '' },
  charId:    { type: String, default: null },
  data:      { type: mongoose.Schema.Types.Mixed, default: null },
  level:     { type: Number, default: 1 },
  cp:        { type: Number, default: 0 },
  floor:     { type: Number, default: 1 },
  updatedAt:    { type: Number, default: 0 },
  refClaimVer:  { type: Number, default: 0 },
  refBy:        { type: String, default: null },
  refMilestones: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { minimize: false });

SaveSchema.index({ tgId: 1 }, { unique: true });
SaveSchema.index({ cp: -1, level: -1 });
SaveSchema.index({ refBy: 1 });
SaveSchema.index({ updatedAt: -1 });

const Save = mongoose.model('Save', SaveSchema);

// ── Транзакции ──
const TransactionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, default: '' },
  type: { type: String, enum: ['deposit', 'withdraw'], required: true },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  wallet: { type: String, default: '' },
  memo: { type: String, default: '' },
  createdAt: { type: Number, default: Date.now },
  approvedAt: { type: Number, default: null },
  rejectedAt: { type: Number, default: null },
  adminNote: { type: String, default: '' }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ── Логи админа ──
const AdminLogSchema = new mongoose.Schema({
  admin: String,
  action: String,
  target: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Number, default: Date.now }
});
const AdminLog = mongoose.model('AdminLog', AdminLogSchema);

// ── Маркет ──
const MarketListingSchema = new mongoose.Schema({
  listingId:   { type: String, required: true, unique: true },
  sellerId:    { type: String, required: true, index: true },
  sellerName:  { type: String, default: '' },
  item:        { type: mongoose.Schema.Types.Mixed, required: true },
  price:       { type: Number, required: true, min: 1 },
  status:      { type: String, enum: ['active', 'sold', 'cancelled'], default: 'active', index: true },
  buyerId:     { type: String, default: null },
  buyerName:   { type: String, default: null },
  createdAt:   { type: Number, default: Date.now },
  expiresAt:   { type: Number, required: true },
  soldAt:      { type: Number, default: null },
  cancelledAt: { type: Number, default: null },
  pendingPixr:  { type: Number, default: null },   // PIXR ожидает получения продавцом
  claimedAt:    { type: Number, default: null },    // когда продавец забрал PIXR
}, { minimize: false });
MarketListingSchema.index({ status: 1, createdAt: -1 });
MarketListingSchema.index({ sellerId: 1, status: 1 });
MarketListingSchema.index({ expiresAt: 1 });
const MarketListing = mongoose.model('MarketListing', MarketListingSchema);

// Авто-истечение лотов каждые 10 минут
setInterval(async () => {
  try {
    const now = Date.now();
    const expired = await MarketListing.find({ status: 'active', expiresAt: { $lte: now } }).lean();
    for (const listing of expired) {
      // Атомарно переводим в cancelled
      const updated = await MarketListing.findOneAndUpdate(
        { listingId: listing.listingId, status: 'active' },
        { $set: { status: 'cancelled', cancelledAt: now } },
        { new: false }
      );
      if (!updated) continue;
      // Возвращаем предмет/руду владельцу
      if (listing.item && listing.item.isOre) {
        const oreKey = 'data.ore.' + listing.item.oreId;
        await Save.findOneAndUpdate(
          { tgId: listing.sellerId },
          { $inc: { [oreKey]: listing.item.qty } }
        );
      } else {
        await Save.findOneAndUpdate(
          { tgId: listing.sellerId },
          { $push: { 'data.inventory': listing.item } }
        );
      }
      notifyClient(listing.sellerId, 'market_expired', { listingId: listing.listingId, item: listing.item });
      console.log(`⏰ [market] Лот ${listing.listingId} истёк — предмет возвращён ${listing.sellerId}`);
    }
  } catch (e) {
    console.error('❌ [market] expire job error:', e.message);
  }
}, 10 * 60 * 1000);

// ── PvP история боёв ──
const PvpBattleSchema = new mongoose.Schema({
  battleId:     { type: String, required: true, unique: true },
  attackerId:   { type: String, required: true, index: true },
  defenderId:   { type: String, required: true },
  attackerName: { type: String, default: '' },
  defenderName: { type: String, default: '' },
  attackerChar: { type: String, default: null },
  defenderChar: { type: String, default: null },
  winnerId:     { type: String, required: true },
  ratingChange: { type: Number, default: 0 },
  attackerRatingBefore: { type: Number, default: 1000 },
  defenderRatingBefore: { type: Number, default: 1000 },
  attackerDmgDealt: { type: Number, default: 0 },
  defenderDmgDealt: { type: Number, default: 0 },
  createdAt:    { type: Number, default: Date.now },
}, { minimize: false });
PvpBattleSchema.index({ attackerId: 1, createdAt: -1 });
PvpBattleSchema.index({ defenderId: 1, createdAt: -1 });
const PvpBattle = mongoose.model('PvpBattle', PvpBattleSchema);

// ── Специальные задания ──
const SpecialTaskSchema = new mongoose.Schema({
  taskId:       { type: String, required: true, unique: true },
  title:        { type: String, required: true },
  description:  { type: String, default: '' },
  link:         { type: String, default: '' },
  linkText:     { type: String, default: 'Перейти' },
  rewardType:   { type: String, enum: ['gold', 'pixr', 'potions', 'gram'], required: true },
  rewardAmount: { type: Number, required: true, min: 1 },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Number, default: Date.now },
}, { minimize: false });
SpecialTaskSchema.index({ active: 1, createdAt: -1 });
const SpecialTask = mongoose.model('SpecialTask', SpecialTaskSchema);

// ── Глобальная статистика (синглтон) ──
const GlobalStatSchema = new mongoose.Schema({
  _id:             { type: String, default: 'global' },
  pixrExchangedTotal: { type: Number, default: 0 }, // сколько PIXR обменяно на GRAM за всё время
}, { minimize: false });
const GlobalStat = mongoose.model('GlobalStat', GlobalStatSchema);

// ── Рейтинг по времени в игре ──
const PlaytimeRatingSchema = new mongoose.Schema({
  tgId:         { type: String, required: true, unique: true },
  username:     { type: String, default: '' },
  firstName:    { type: String, default: '' },
  charId:       { type: String, default: null },
  level:        { type: Number, default: 1 },
  totalSeconds: { type: Number, default: 0 },  // всё накопленное время
  todaySeconds: { type: Number, default: 0 },  // секунд сегодня
  todayDate:    { type: String, default: '' },  // YYYY-MM-DD
  sessions:     { type: Number, default: 0 },
  lastSeenAt:   { type: Number, default: 0 },
  updatedAt:    { type: Number, default: 0 },
}, { minimize: false });
PlaytimeRatingSchema.index({ totalSeconds: -1 });
PlaytimeRatingSchema.index({ todaySeconds: -1 });
PlaytimeRatingSchema.index({ lastSeenAt: -1 });
const PlaytimeRating = mongoose.model('PlaytimeRating', PlaytimeRatingSchema);

// Константы обмена
const PIXR_EXCHANGE_THRESHOLD = 5_000_000; // после этого порога цена меняется
const PIXR_PER_GRAM_CHEAP     = 1000;      // до порога: 1000 PIXR = 1 GRAM
const PIXR_PER_GRAM_EXP       = 2000;      // после порога: 2000 PIXR = 1 GRAM
const GRAM_PER_PIXR_RATE      = 800;       // 1 GRAM → 800 PIXR (обратный)

// ═══════════════════════════════
//  КОНФИГ КОШЕЛЬКА
// ═══════════════════════════════
const WALLET_CONFIG = {
  address: 'UQD5hiR-ziWL1r2jggCKxzhE7K7yNvH3FqnckOdXosVKYEfb',
  minAmount: 1,
};

// ═══════════════════════════════
//  Rate limiter
// ═══════════════════════════════
const _rl = new Map();
function rateLimit(tgId, maxReqs, windowMs) {
  const now = Date.now();
  let e = _rl.get(tgId);
  if (!e || now > e.reset) { _rl.set(tgId, { n: 1, reset: now + windowMs }); return false; }
  if (++e.n > maxReqs) return true;
  return false;
}
setInterval(() => { const now = Date.now(); _rl.forEach((v, k) => { if (now > v.reset) _rl.delete(k); }); }, 300000);

// ═══════════════════════════════
//  Проверка Telegram
// ═══════════════════════════════
function verifyTelegram(initData) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const insecure = process.env.ALLOW_INSECURE === '1';
  if (!insecure) {
    const botToken = process.env.BOT_TOKEN || '';
    if (!botToken) return null;
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc !== hash) return null;
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (authDate && (Math.floor(Date.now() / 1000) - authDate) > 172800) return null; // 48h

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (e) {}
  if (!user || !user.id) return null;

  return {
    id:        String(user.id),
    username:  user.username   || '',
    firstName: user.first_name || '',
    startParam: params.get('start_param') || '',
  };
}

function authUser(req, res) {
  const tg = verifyTelegram(req.body && req.body.initData);
  if (!tg) { 
    console.warn('❌ [authUser] Ошибка авторизации');
    res.status(401).json({ ok: false, error: 'auth_failed' }); 
    return null; 
  }
  return tg;
}

// ═══════════════════════════════
//  Утилиты
// ═══════════════════════════════
function calcPendingGold(refMilestones, friends) {
  let gold = 0;
  const newMilestones = Object.assign({}, refMilestones);
  friends.forEach(f => {
    const paid = newMilestones[f.tgId] || 0;
    const maxMilestone = Math.floor(f.level / REF_MILESTONE_STEP) * REF_MILESTONE_STEP;
    if (maxMilestone > paid) {
      const count = (maxMilestone - paid) / REF_MILESTONE_STEP;
      gold += count * REF_GOLD_PER_MILESTONE;
      newMilestones[f.tgId] = maxMilestone;
    }
  });
  return { gold, newMilestones };
}

// ═══════════════════════════════
//  Кэш лидерборда
// ═══════════════════════════════
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 10000;

function getLeaderboardCache() {
  if (leaderboardCache && Date.now() - leaderboardCacheTime < LEADERBOARD_CACHE_TTL) {
    return leaderboardCache;
  }
  return null;
}

function setLeaderboardCache(data) {
  leaderboardCache = data;
  leaderboardCacheTime = Date.now();
}

// ═══════════════════════════════
//  ПОЛЛИНГ — простой опрос (без долгого ожидания)
// ═══════════════════════════════

const pendingNotifications = new Map();

// ── Простой опрос (без Long Polling) ──
app.post('/api/poll', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  const tgId = tg.id;
  const notifs = pendingNotifications.get(tgId) || [];
  
  if (notifs.length > 0) {
    pendingNotifications.set(tgId, []);
    console.log(`📨 [Poll] Отдано ${notifs.length} уведомлений для ${tgId}`);
    return res.json({
      ok: true,
      notifications: notifs,
      timestamp: Date.now()
    });
  }
  
  // Просто возвращаем пустой ответ
  res.json({
    ok: true,
    notifications: [],
    timestamp: Date.now()
  });
});


// ✅ Очистка старых уведомлений (утечка памяти)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  pendingNotifications.forEach((notifs, tgId) => {
    const fresh = notifs.filter(n => n.timestamp > cutoff);
    if (fresh.length === 0) pendingNotifications.delete(tgId);
    else if (fresh.length !== notifs.length) pendingNotifications.set(tgId, fresh);
  });
}, 5 * 60 * 1000);

function notifyClient(tgId, eventType, data) {
  if (!tgId) return false;

  const notification = {
    event: eventType,
    data: data || {},
    timestamp: Date.now()
  };

  if (!pendingNotifications.has(tgId)) {
    pendingNotifications.set(tgId, []);
  }
  pendingNotifications.get(tgId).push(notification);

  console.log(`📨 [Poll] Уведомление для ${tgId}: ${eventType}`);
  return true;
}

function forceReloadClient(tgId) {
  return notifyClient(tgId, 'reload', { reason: 'data_updated' });
}

// ═══════════════════════════════
//  ОСНОВНЫЕ РОУТЫ
// ═══════════════════════════════
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'pixel-rpg', db: mongoose.connection.readyState === 1 });
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/load', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  const startParam = tg.startParam || (req.body && req.body.startParam) || '';
  console.log(`🟢 [load] tgId: ${tg.id}`);
  
  try {
    let doc = await Save.findOne({ tgId: tg.id }).lean();

    if (!doc) {
      const refBy = (startParam && startParam !== tg.id) ? startParam : null;
      doc = await Save.create({
        tgId: tg.id, 
        username: tg.username, 
        firstName: tg.firstName,
        refBy, 
        refMilestones: {},
        data: null,
      });
      console.log(`🆕 [load] Новый пользователь: ${tg.id}`);

      if (getBot() && process.env.ADMIN_TG_ID) {
        try {
          let inviterName = '— (органика)';
          if (refBy) {
            const inviter = await Save.findOne({ tgId: refBy }, 'firstName username').lean();
            if (inviter) {
              inviterName = (inviter.firstName || inviter.username || refBy) +
                (inviter.username ? ' (@' + inviter.username + ')' : '') +
                ' [' + refBy + ']';
            } else {
              inviterName = refBy;
            }
          }
          const newUserMsg =
            '🆕 *Новый игрок!*\n\n' +
            '*Имя:* ' + (tg.firstName || '—') + '\n' +
            '*Username:* ' + (tg.username ? '@' + tg.username : '—') + '\n' +
            '*ID:* `' + tg.id + '`\n' +
            '*Пригласил:* ' + inviterName;
          await getBot()?.sendMessage(process.env.ADMIN_TG_ID, newUserMsg, { parse_mode: 'Markdown' });
        } catch (e) {
          console.error('❌ [load] Ошибка уведомления о новом пользователе:', e.message);
        }
      }

      return res.json({
        ok: true,
        save: { charId: null, data: null, updatedAt: 0 },
        user: { id: tg.id, username: tg.username, firstName: tg.firstName },
      });
    }
    
    if (!doc.refBy && startParam && startParam !== tg.id) {
      await Save.updateOne({ tgId: tg.id }, { $set: { refBy: startParam } });
      doc.refBy = startParam;
    }

    res.json({
      ok: true,
      save: {
        charId: doc.charId,
        data: doc.data,
        updatedAt: doc.updatedAt || 0,
      },
      user: { id: tg.id, username: tg.username, firstName: tg.firstName },
    });
  } catch (e) {
    console.error('❌ [load] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/save', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const tg = authUser(req, res); 
    if (!tg) return;
    
    if (rateLimit(tg.id, 10, 10000)) {
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }
    
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') {
      console.error('❌ [save] Нет данных');
      return res.status(400).json({ ok: false, error: 'bad_data' });
    }

    if (data.tgId && data.tgId !== tg.id) {
      console.error(`❌ [save] Несоответствие tgId!`);
      return res.status(403).json({ ok: false, error: 'user_mismatch' });
    }

    data.tgId = tg.id;
    
    const currentDoc = await Save.findOne({ tgId: tg.id }).lean();
    if (currentDoc) {
      const clientUpdatedAt = data.updatedAt || 0;
      const serverData = currentDoc.data || {};
      const serverUpdatedAt = serverData.updatedAt || 0;

      // ✅ Если был сброс — клиент не знает об этом, блокируем его старые данные
      const resetAt = serverData._resetAt || 0;
      if (resetAt > clientUpdatedAt) {
        console.log(`🛑 [save] Блок после сброса для ${tg.id}: resetAt=${resetAt} > clientAt=${clientUpdatedAt}`);
        // Принудительно шлём reload через SSE и блокируем save
        notifyClient(tg.id, 'force_close', { reason: 'progress_reset' });
        return res.json({ ok: false, error: 'reset_detected', updatedAt: serverUpdatedAt, resetAt });
      }

      if (serverUpdatedAt > clientUpdatedAt) {
        console.log(`⚠️ [save] Игнорируем устаревшие данные для ${tg.id}`);
        return res.json({ ok: true, updatedAt: serverUpdatedAt, ignored: true });
      }

      // ✅ Защита от перезаписи AdminUpdatedAt
      const adminUpdatedAt = serverData._adminUpdatedAt || 0;
      if (adminUpdatedAt > clientUpdatedAt) {
        console.log(`🛡️ [save] Мёрж с админскими изменениями для ${tg.id}`);
        if (serverData.gram      !== undefined) data.gram      = serverData.gram;
        if (serverData.gold      !== undefined) data.gold      = serverData.gold;
        if (serverData.pixr      !== undefined) data.pixr      = serverData.pixr;
        if (serverData.inventory !== undefined) data.inventory = serverData.inventory;
        data._adminUpdatedAt = adminUpdatedAt;
      }
    }

    data.updatedAt = Date.now();

    await Save.findOneAndUpdate(
      { tgId: tg.id },
      { 
        $set: {
          username:  tg.username, 
          firstName: tg.firstName,
          charId:    data.charId || null, 
          data:      data,
          level:     Number(data.level) || 1,
          cp:        Number(data.cp)    || 0,
          floor:     Number(data.floor) || 1,
          updatedAt: data.updatedAt,
        }
      },
      { upsert: true, new: false, lean: true }
    );

    // ── Обновляем рейтинг по времени ──
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const dailyTasks = data.dailyTasks || {};
      // Секунд сыграно сегодня согласно клиенту
      const clientTodaySeconds = (dailyTasks.date === todayStr) ? (dailyTasks.seconds || 0) : 0;

      const ptDoc = await PlaytimeRating.findOne({ tgId: tg.id }).lean();

      if (!ptDoc) {
        // Первая запись: totalSeconds = сегодняшние секунды
        // (прошлые дни не восстановить, но хотя бы не теряем сегодня)
        // Защита: не более 86400 секунд (1 сутки) в первой записи
        const safeTodaySeconds = Math.min(clientTodaySeconds, 86400);
        await PlaytimeRating.create({
          tgId:         tg.id,
          username:     tg.username,
          firstName:    tg.firstName,
          charId:       data.charId || null,
          level:        Number(data.level) || 1,
          totalSeconds: safeTodaySeconds,
          todaySeconds: safeTodaySeconds,
          todayDate:    todayStr,
          sessions:     0,
          lastSeenAt:   data.updatedAt,
          updatedAt:    data.updatedAt,
        });
      } else {
        const isSameDay = ptDoc.todayDate === todayStr;
        const prevTodaySeconds = isSameDay ? (ptDoc.todaySeconds || 0) : 0;

        // Сколько новых секунд появилось за этот save
        const rawDelta = Math.max(0, clientTodaySeconds - prevTodaySeconds);
        // Защита от накрутки: дельта не может быть больше времени между сохранениями + 60с буфер
        const timeSinceLastSave = Math.max(0, Math.floor((data.updatedAt - (ptDoc.lastSeenAt || 0)) / 1000));
        const MAX_DELTA = Math.min(rawDelta, timeSinceLastSave + 60);
        const todayDelta = isSameDay ? MAX_DELTA : Math.min(clientTodaySeconds, 86400);

        // Если день сменился — старые todaySeconds уже вошли в total в прошлый раз,
        // поэтому прибавляем только новые секунды нового дня
        const totalDelta = isSameDay ? todayDelta : Math.min(clientTodaySeconds, 86400);

        await PlaytimeRating.findOneAndUpdate(
          { tgId: tg.id },
          {
            $set: {
              username:     tg.username,
              firstName:    tg.firstName,
              charId:       data.charId || null,
              level:        Number(data.level) || 1,
              todaySeconds: clientTodaySeconds,
              todayDate:    todayStr,
              lastSeenAt:   data.updatedAt,
              updatedAt:    data.updatedAt,
            },
            $inc: { totalSeconds: totalDelta },
          }
        );
      }
    } catch (ptErr) {
      console.error('⚠️ [playtime] update error:', ptErr.message);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [save] Сохранено для ${tg.id} (${duration}ms)`);
    res.json({ ok: true, updatedAt: data.updatedAt });

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`❌ [save] ОШИБКА (${duration}ms):`, e.message);
    
    res.status(500).json({ 
      ok: false, 
      error: 'server_error',
    });
  }
});


// ═══════════════════════════════
//  ДЕЛЬТА-СОХРАНЕНИЕ — только изменившиеся поля
// ═══════════════════════════════
app.post('/api/save/delta', async (req, res) => {
  const startTime = Date.now();

  try {
    const tg = authUser(req, res);
    if (!tg) return;

    if (rateLimit(tg.id, 10, 10000)) {
      return res.status(429).json({ ok: false, error: 'rate_limit' });
    }

    const delta = req.body && req.body.delta;
    if (!delta || typeof delta !== 'object') {
      return res.status(400).json({ ok: false, error: 'bad_delta' });
    }

    if (delta.tgId && delta.tgId !== tg.id) {
      return res.status(403).json({ ok: false, error: 'user_mismatch' });
    }

    // Загружаем текущий документ
    const currentDoc = await Save.findOne({ tgId: tg.id }).lean();
    if (!currentDoc || !currentDoc.data) {
      return res.status(404).json({ ok: false, error: 'no_save' });
    }

    const srv = currentDoc.data;
    const clientUpdatedAt = delta.updatedAt || 0;
    const serverUpdatedAt = srv.updatedAt || 0;

    // ✅ FIX #1: Проверка сброса прогресса — зеркало /api/save
    const resetAt = srv._resetAt || 0;
    if (resetAt > clientUpdatedAt) {
      console.log(`🛑 [delta] Блок после сброса для ${tg.id}: resetAt=${resetAt} > clientAt=${clientUpdatedAt}`);
      notifyClient(tg.id, 'force_close', { reason: 'progress_reset' });
      return res.json({ ok: false, error: 'reset_detected', updatedAt: serverUpdatedAt, resetAt });
    }

    // Если сервер свежее клиента — игнорируем дельту
    if (serverUpdatedAt > clientUpdatedAt) {
      console.log(`⚠️ [delta] Игнорируем устаревшую дельту для ${tg.id}`);
      return res.json({ ok: true, updatedAt: serverUpdatedAt, ignored: true });
    }

    // ✅ Мёржим дельту с текущими данными
    const merged = Object.assign({}, srv);
    // Батч-поля (hp/gold/xp меняются в игровом цикле)
    // + Instant-поля (inventory/equipped/upg/... меняются по действию игрока)
    // saveInstant теперь тоже идёт через /api/save/delta — оба типа нужны здесь
    const ALLOWED_DELTA_FIELDS = [
      // батч
      'hp', 'gold', 'xp', 'xpNeeded', 'killCount', 'potions',
      'level', 'floor', 'maxFloor', 'pixr', 'cp', 'charId', 'dailyTasks',
      // instant (структурные изменения)
      'inventory', 'equipped', 'upg', 'skills',
      'potionLv', 'potionThreshold', 'gram', 'bp', 'prem', 'boss',
      'marketUnlocked', 'arenaRating',
      'ore', 'blessStones', 'runes',
      'pvpAttempts', 'pvpAttemptsDate', 'pvpRefreshes', 'pvpRefreshDate',
      'invFilter', 'invIdCounter', 'specialTasksClaimed',
    ];
    ALLOWED_DELTA_FIELDS.forEach(function(field) {
      if (delta[field] !== undefined) merged[field] = delta[field];
    });
    merged.updatedAt = Date.now();
    merged.tgId = tg.id;

    // ✅ Если были админские изменения — клиент не знал, берём серверные значения
    const adminUpdatedAt = srv._adminUpdatedAt || 0;
    const syncToClient = {};
    if (adminUpdatedAt > clientUpdatedAt) {
      console.log(`🛡️ [delta] Мёрж с админскими изменениями для ${tg.id}`);
      if (srv.gram      !== undefined) { merged.gram      = srv.gram;      syncToClient.gram      = srv.gram; }
      if (srv.gold      !== undefined) { merged.gold      = srv.gold;      syncToClient.gold      = srv.gold; }
      if (srv.pixr      !== undefined) { merged.pixr      = srv.pixr;      syncToClient.pixr      = srv.pixr; }
      if (srv.inventory !== undefined) { merged.inventory = srv.inventory; syncToClient.inventory = srv.inventory; }
      merged._adminUpdatedAt = adminUpdatedAt;
    }

    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          data: merged,
          level:     Number(merged.level) || 1,
          cp:        Number(merged.cp)    || 0,
          floor:     Number(merged.floor) || 1,
          updatedAt: merged.updatedAt,
        }
      },
      { upsert: false, new: false, lean: true }
    );

    const duration = Date.now() - startTime;
    console.log(`✅ [delta] Сохранено для ${tg.id} (${duration}ms), полей: ${Object.keys(delta).length}`);

    const response = { ok: true, updatedAt: merged.updatedAt };
    if (Object.keys(syncToClient).length > 0) response.sync = syncToClient;
    res.json(response);

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`❌ [delta] ОШИБКА (${duration}ms):`, e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/character', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  const charId = req.body && req.body.charId;
  if (!charId) {
    return res.status(400).json({ ok: false, error: 'bad_char' });
  }

  // ✅ Валидация charId — допустимы только известные классы
  const VALID_CHAR_IDS = ['fire', 'light', 'water'];
  if (!VALID_CHAR_IDS.includes(charId)) {
    return res.status(400).json({ ok: false, error: 'invalid_char' });
  }
  
  console.log(`🎭 [character] tgId: ${tg.id}, charId: ${charId}`);
  
  try {
    let doc = await Save.findOne({ tgId: tg.id });
    
    if (!doc) {
      doc = await Save.create({
        tgId: tg.id,
        username: tg.username,
        firstName: tg.firstName,
        charId: charId,
        data: { tgId: tg.id, charId: charId },
      });
      console.log(`🆕 [character] Создан новый пользователь: ${tg.id}`);
    } else {
      if (!doc.data || typeof doc.data !== 'object') {
        doc.data = {};
      }
      doc.data.tgId = tg.id;
      doc.data.charId = charId;
      doc.charId = charId;
      await doc.save();
      console.log(`✅ [character] Обновлен персонаж для ${tg.id}: ${charId}`);
    }
    
    res.json({ ok: true });
  } catch (e) { 
    console.error('❌ [character] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' }); 
  }
});

app.get('/api/leaderboard', async (req, res) => {
  if (!req.query.tgId) return res.status(401).json({ ok: false, error: 'missing_id' });
  if (rateLimit('lb_' + req.query.tgId, 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }
  
  try {
    const cached = getLeaderboardCache();
    if (cached) {
      return res.json({ ok: true, top: cached, cached: true });
    }
    
    const top = await Save.find({ charId: { $ne: null } })
      .sort({ cp: -1, level: -1 }).limit(50)
      .select('tgId username firstName level cp floor charId -_id')
      .lean();
    
    setLeaderboardCache(top);
    
    res.json({ ok: true, top, cached: false });
  } catch (e) { 
    console.error('❌ [leaderboard] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' }); 
  }
});

app.post('/api/ref/friends', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  try {
    const doc = await Save.findOne({ tgId: tg.id })
      .select('refMilestones -_id').lean();
    const milestones = (doc && doc.refMilestones) || {};

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId firstName username level charId -_id').lean();

    const { gold: pendingGold } = calcPendingGold(milestones, friends);
    const refLink = `https://t.me/${BOT_USERNAME}?start=${tg.id}`;

    res.json({
      ok: true,
      refLink,
      refCode: tg.id,
      friends: friends.map(f => ({
        name:    f.firstName || f.username || ('Игрок ' + f.tgId.slice(-4)),
        level:   f.level || 1,
        charId:  f.charId,
        nextMilestone: (Math.floor(((milestones[f.tgId] || 0) / REF_MILESTONE_STEP) + 1)) * REF_MILESTONE_STEP,
        paid: milestones[f.tgId] || 0,
      })),
      pendingGold,
    });
  } catch (e) {
    console.error('❌ [ref/friends] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

const _claiming = new Set();
app.post('/api/ref/claim', async (req, res) => {
  const tg = authUser(req, res); 
  if (!tg) return;
  
  if (_claiming.has(tg.id)) {
    return res.status(429).json({ ok: false, error: 'in_progress' });
  }
  
  _claiming.add(tg.id);
  
  try {
    const doc = await Save.findOne({ tgId: tg.id });
    if (!doc) return res.json({ ok: true, goldEarned: 0 });

    const friends = await Save.find({ refBy: tg.id })
      .select('tgId level -_id').lean();

    const { gold, newMilestones } = calcPendingGold(doc.refMilestones || {}, friends);
    if (gold === 0) return res.json({ ok: true, goldEarned: 0 });

    // ✅ FIX #5: Атомарный $inc вместо read-modify-write.
    // Также обновляем data.updatedAt чтобы клиентский saveInstant
    // не перезаписал начисленное золото устаревшим значением.
    const now = Date.now();
    await Save.findOneAndUpdate(
      { tgId: tg.id, refClaimVer: doc.refClaimVer || 0 },
      {
        $inc: { 'data.gold': gold, refClaimVer: 1 },
        $set: {
          refMilestones: newMilestones,
          'data.updatedAt': now,
          updatedAt: now,
        }
      }
    );

    res.json({ ok: true, goldEarned: gold });
  } catch (e) {
    console.error('❌ [ref/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _claiming.delete(tg.id);
  }
});

// ═══════════════════════════════
//  ЗАДАНИЯ
// ═══════════════════════════════

const DAILY_MILESTONES = [
  { id: 0, minutes: 10, rewardType: 'potions', amount: 50   },
  { id: 1, minutes: 20, rewardType: 'gold',    amount: 1000 },
  { id: 2, minutes: 30, rewardType: 'pixr',    amount: 5    },
  { id: 3, minutes: 60, rewardType: 'gold',    amount: 2000 },
];

app.post('/api/tasks', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const [tasks, user] = await Promise.all([
      SpecialTask.find({ active: true }).sort({ createdAt: -1 }).lean(),
      Save.findOne({ tgId: tg.id }).select('data').lean()
    ]);
    const userData = (user && user.data) || {};
    res.json({
      ok: true,
      tasks,
      dailyTasks:          userData.dailyTasks          || { date: '', seconds: 0, claimed: [] },
      specialTasksClaimed: userData.specialTasksClaimed || {},
    });
  } catch (e) {
    console.error('❌ [tasks] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/tasks/daily/claim', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 10 за 60 секунд
  if (rateLimit(tg.id + '_taskclaim', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { milestoneId } = req.body;
  const milestone = DAILY_MILESTONES.find(m => m.id === milestoneId);
  if (!milestone) return res.status(400).json({ ok: false, error: 'invalid_milestone' });
  try {
    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });
    const daily    = user.data.dailyTasks || { date: '', seconds: 0, claimed: [] };
    const todayStr = new Date().toISOString().slice(0, 10);
    if (daily.date !== todayStr)
      return res.status(400).json({ ok: false, error: 'day_reset' });
    if ((daily.claimed || []).includes(milestoneId))
      return res.status(400).json({ ok: false, error: 'already_claimed' });
    if (Math.floor((daily.seconds || 0) / 60) < milestone.minutes)
      return res.status(400).json({ ok: false, error: 'not_enough_time' });
    const rewardField = 'data.' + milestone.rewardType;
    const now = Date.now();

    // ✅ Атомарная защита от двойного клэйма: $addToSet гарантирует уникальность
    // Условие на дату и отсутствие milestoneId в claimed предотвращает race condition
    const result = await Save.findOneAndUpdate(
      {
        tgId: tg.id,
        'data.dailyTasks.date': todayStr,
        'data.dailyTasks.claimed': { $not: { $elemMatch: { $eq: milestoneId } } },
      },
      {
        $inc: { [rewardField]: milestone.amount },
        $addToSet: { 'data.dailyTasks.claimed': milestoneId },
        $set: { 'data.updatedAt': now, updatedAt: now }
      },
      { new: true }
    );
    if (!result) return res.status(400).json({ ok: false, error: 'already_claimed' });
    res.json({ ok: true, reward: { type: milestone.rewardType, amount: milestone.amount } });
  } catch (e) {
    console.error('❌ [tasks/daily/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/tasks/special/claim', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 10 за 60 секунд
  if (rateLimit(tg.id + '_taskclaim', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ ok: false, error: 'missing_taskId' });
  try {
    const [task, user] = await Promise.all([
      SpecialTask.findOne({ taskId, active: true }).lean(),
      Save.findOne({ tgId: tg.id }).lean()
    ]);
    if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });
    if (!user)  return res.status(404).json({ ok: false, error: 'no_save' });
    const claimed = (user.data && user.data.specialTasksClaimed) || {};
    if (claimed[taskId]) return res.status(400).json({ ok: false, error: 'already_claimed' });
    const rewardField = 'data.' + task.rewardType;
    const now = Date.now();

    // ✅ Атомарная защита от двойного клэйма: $exists: false исключает race condition
    const result = await Save.findOneAndUpdate(
      {
        tgId: tg.id,
        [`data.specialTasksClaimed.${taskId}`]: { $exists: false },
      },
      {
        $inc: { [rewardField]: task.rewardAmount },
        $set: {
          [`data.specialTasksClaimed.${taskId}`]: now,
          'data.updatedAt': now,
          updatedAt: now,
        }
      },
      { new: true }
    );
    if (!result) return res.status(400).json({ ok: false, error: 'already_claimed' });
    res.json({ ok: true, reward: { type: task.rewardType, amount: task.rewardAmount } });
  } catch (e) {
    console.error('❌ [tasks/special/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});
// ═══════════════════════════════

// Зеркало констант из data.js / inventory.js
const SRV_ITEM_TYPES = [
  { slot: 'body',   name: 'Нагрудник', stats: ['def', 'hp'],    primary: 'def'  },
  { slot: 'legs',   name: 'Штаны',     stats: ['def', 'dodge'], primary: 'def'  },
  { slot: 'gloves', name: 'Перчатки',  stats: ['atk', 'def'],   primary: 'atk'  },
  { slot: 'boots',  name: 'Боты',      stats: ['spd', 'dodge'], primary: 'spd'  },
  { slot: 'helmet', name: 'Шлем',      stats: ['def', 'hp'],    primary: 'def'  },
  { slot: 'ring',   name: 'Кольцо',    stats: ['atk', 'spd'],   primary: 'atk'  },
  { slot: 'belt',   name: 'Пояс',      stats: ['hp', 'def'],    primary: 'hp'   },
];
const SRV_STAFF_TYPES = [
  { slot: 'weapon', name: 'Посох огня',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'fire',  classLabel: 'Пирокан', classColor: '#ff7030' },
  { slot: 'weapon', name: 'Посох света', stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'light', classLabel: 'Люмос',   classColor: '#ffd040' },
  { slot: 'weapon', name: 'Посох воды',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'water', classLabel: 'Аквас',   classColor: '#40d0ff' },
];
const SRV_RARITIES = [
  { id: 'common',   weight: 55 },
  { id: 'uncommon', weight: 28 },
  { id: 'rare',     weight: 12 },
  { id: 'epic',     weight:  4 },
  { id: 'legend',   weight:  1 },
];
const SRV_FLOOR_MAX_RARITY = { 1:'common', 2:'uncommon', 3:'uncommon', 4:'rare', 5:'rare', 6:'rare', 7:'epic', 8:'epic', 9:'legend', 10:'legend' };
const SRV_FLOOR_MIN_RARITY = { 1:'common', 2:'common',   3:'common',   4:'common', 5:'common', 6:'common', 7:'common', 8:'uncommon', 9:'uncommon', 10:'uncommon' };
const SRV_CRITDMG_BY_RARITY = { common: 0.05, uncommon: 0.08, rare: 0.12, epic: 0.18, legend: 0.25 };
const SRV_STAT_CAP = { crit: 5, dodge: 5 };

function srvItemIcon(slot, rarity, forClass) {
  const sfx = { common:'c', uncommon:'u', rare:'r', epic:'e', legend:'l' }[rarity] || 'c';
  if (slot === 'weapon') {
    const pfx = { water:'ww', fire:'wf', light:'wl' }[forClass] || 'ww';
    return 'images/' + pfx + sfx + '.png';
  }
  const slotPfx = { body:'a', legs:'l', gloves:'p', boots:'b', helmet:'h', ring:'ring', belt:'belt' }[slot];
  return slotPfx ? 'images/' + slotPfx + sfx + '.png' : 'images/ac.png';
}

function srvRollRarity(floor) {
  const rarityOrder = ['common','uncommon','rare','epic','legend'];
  const maxIdx = rarityOrder.indexOf(SRV_FLOOR_MAX_RARITY[floor] || 'legend');
  const minIdx = rarityOrder.indexOf(SRV_FLOOR_MIN_RARITY[floor] || 'common');
  const bonus = (floor - 1) * 0.3;
  const weights = SRV_RARITIES.map((r, i) => {
    if (i > maxIdx || i < minIdx) return 0;
    return Math.max(0.1, r.weight - i * bonus * 0.8 + (i > 1 ? bonus * i * 0.5 : 0));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total, cum = 0;
  for (let i = 0; i < SRV_RARITIES.length; i++) {
    if (weights[i] === 0) continue;
    cum += weights[i];
    if (roll <= cum) return SRV_RARITIES[i].id;
  }
  return SRV_RARITIES[minIdx].id;
}

function srvGenerateItem(floor) {
  const rarity  = srvRollRarity(floor);
  const rarIdx  = ['common','uncommon','rare','epic','legend'].indexOf(rarity);
  const mult    = 1 + rarIdx * 0.55;
  const itemLv  = Math.max(1, floor * 2 + Math.floor(Math.random() * 3) - 1);
  const base    = itemLv * 2.5;

  let type;
  if (Math.random() < 0.25) {
    type = SRV_STAFF_TYPES[Math.floor(Math.random() * SRV_STAFF_TYPES.length)];
  } else {
    type = SRV_ITEM_TYPES[Math.floor(Math.random() * SRV_ITEM_TYPES.length)];
  }

  const stats = {};
  type.stats.forEach(s => {
    if (s === 'critDmg') {
      const cdVal = parseFloat(((SRV_CRITDMG_BY_RARITY[rarity] || 0.05) * (0.85 + Math.random() * 0.3)).toFixed(2));
      if (cdVal > 0) stats[s] = cdVal;
      return;
    }
    const isPrimary = (s === type.primary);
    let val = Math.floor(base * mult * (isPrimary ? 1.0 : 0.45) * (0.85 + Math.random() * 0.3));
    if (SRV_STAT_CAP[s] !== undefined) val = Math.min(val, SRV_STAT_CAP[s]);
    if (val > 0) stats[s] = val;
  });
  // Легендарный — дополнительный стат
  if (rarity === 'legend') {
    const bonus = ['atk','def','hp','spd'].filter(s => !stats[s]);
    if (bonus.length) stats[bonus[Math.floor(Math.random() * bonus.length)]] = Math.floor(base * 0.5);
  }

  return {
    id: Date.now() + Math.floor(Math.random() * 1000000),
    slot: type.slot,
    name: type.name,
    icon: srvItemIcon(type.slot, rarity, type.forClass || null),
    rarity, level: itemLv, stats,
    forClass:   type.forClass   || null,
    classLabel: type.classLabel || null,
    classColor: type.classColor || null,
    _equipped: false,
  };
}

// ── Дроп предмета с монстра ──
app.post('/api/drop', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 30 дропов за 60 секунд
  if (rateLimit(tg.id + '_drop', 30, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const reqFloor = Math.max(1, Math.min(10, parseInt(req.body && req.body.floor) || 1));

  try {
    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });

    // ✅ Проверяем что запрошенный этаж не превышает maxFloor игрока
    const playerMaxFloor = Math.max(1, Math.min(10, user.data.maxFloor || user.data.floor || 1));
    const floor = Math.min(reqFloor, playerMaxFloor);

    const inventory = user.data.inventory || [];
    if (inventory.length >= 40) return res.json({ ok: false, error: 'inv_full' });

    const item = srvGenerateItem(floor);

    const now = Date.now();
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $push: { 'data.inventory': item },
        $set:  { 'data.updatedAt': now, updatedAt: now },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ ok: false, error: 'no_save' });

    console.log(`🎁 [drop] ${tg.id} floor=${floor} item="${item.name}" rarity=${item.rarity}`);
    res.json({ ok: true, item, inventory: updated.data.inventory });
  } catch (e) {
    console.error('❌ [drop] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Дроп руды с монстра ──
const SRV_ORE_NAMES = { core:'Обычная руда', uore:'Необычная руда', rore:'Редкая руда', eore:'Эпическая руда', lore:'Легендарная руда' };
const SRV_VALID_ORES = ['core','uore','rore','eore','lore'];
const DROP_ORE_MAX_QTY_PER_TYPE = 3; // клиент присылает 1-3, не больше
const DROP_ORE_MAX_TYPES = 5;        // не больше 5 типов за раз

app.post('/api/drop/ore', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 30 дропов за 60 секунд
  if (rateLimit(tg.id + '_drop', 30, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const reqFloor   = Math.max(1, Math.min(10, parseInt(req.body && req.body.floor) || 1));
  const clientOres = (req.body && req.body.ores) || {};

  try {
    // ✅ Проверяем maxFloor игрока перед обработкой руды
    const userDoc = await Save.findOne({ tgId: tg.id }, 'data.maxFloor data.floor').lean();
    const playerMaxFloor = userDoc && userDoc.data ? Math.max(1, Math.min(10, userDoc.data.maxFloor || userDoc.data.floor || 1)) : 1;
    const floor = Math.min(reqFloor, playerMaxFloor);

    // Валидируем и очищаем то что прислал клиент
    const ores = {};
    let typeCount = 0;
    for (const oreId of SRV_VALID_ORES) {
      if (!clientOres[oreId]) continue;
      if (typeCount >= DROP_ORE_MAX_TYPES) break;
      const qty = Math.min(Math.max(1, parseInt(clientOres[oreId]) || 0), DROP_ORE_MAX_QTY_PER_TYPE);
      if (qty > 0) { ores[oreId] = qty; typeCount++; }
    }

    if (Object.keys(ores).length === 0) {
      return res.json({ ok: false, error: 'no_ores' });
    }

    // Проверяем что шансы дропа соответствуют этажу — защита от накрутки
    // (lore на 1-7 этаже не может выпасть)
    const ORE_DROP_TABLE_SRV = {
      1:  { core:2,   uore:0,   rore:0,   eore:0,   lore:0   },
      2:  { core:3,   uore:1.5, rore:0,   eore:0,   lore:0   },
      3:  { core:4,   uore:2.5, rore:0,   eore:0,   lore:0   },
      4:  { core:4,   uore:3,   rore:1,   eore:0,   lore:0   },
      5:  { core:4,   uore:3.5, rore:2,   eore:0,   lore:0   },
      6:  { core:4,   uore:4,   rore:2.5, eore:0.5, lore:0   },
      7:  { core:4,   uore:4,   rore:3,   eore:1,   lore:0   },
      8:  { core:4,   uore:4,   rore:3.5, eore:1.5, lore:0.2 },
      9:  { core:4,   uore:4,   rore:4,   eore:2,   lore:0.4 },
      10: { core:4,   uore:4,   rore:4,   eore:2.5, lore:0.6 },
    };
    const table = ORE_DROP_TABLE_SRV[floor] || ORE_DROP_TABLE_SRV[10];
    for (const oreId of Object.keys(ores)) {
      if ((table[oreId] || 0) <= 0) {
        delete ores[oreId];
      }
    }
    if (Object.keys(ores).length === 0) {
      return res.json({ ok: false, error: 'invalid_ores_for_floor' });
    }

    const incUpdate = {};
    for (const [oreId, qty] of Object.entries(ores)) {
      incUpdate['data.ore.' + oreId] = qty;
    }
    const now = Date.now();
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id },
      { $inc: incUpdate, $set: { 'data.updatedAt': now, updatedAt: now } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ ok: false, error: 'no_save' });

    console.log(`⛏️ [drop/ore] ${tg.id} floor=${floor} ores=${JSON.stringify(ores)}`);
    res.json({ ok: true, ore: updated.data.ore || {} });
  } catch (e) {
    console.error('❌ [drop/ore] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  АВАТАРКА
// ═══════════════════════════════
const _avatarCache = new Map();
const AVATAR_CACHE_TTL = 3600 * 1000;

// ── Периодическая очистка avatar-кэша (утечка памяти) ──
setInterval(() => {
  const cutoff = Date.now() - AVATAR_CACHE_TTL;
  _avatarCache.forEach((v, k) => { if (v.ts < cutoff) _avatarCache.delete(k); });
}, AVATAR_CACHE_TTL);

app.get('/api/avatar/:tgId', async (req, res) => {
  const tgId = req.params.tgId;
  if (!tgId || !/^\d+$/.test(tgId)) return res.status(400).json({ ok: false });

  const cached = _avatarCache.get(tgId);
  if (cached && Date.now() - cached.ts < AVATAR_CACHE_TTL) {
    if (!cached.url) return res.status(404).json({ ok: false, error: 'no_photo' });
    return res.redirect(302, cached.url);
  }

  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(503).json({ ok: false, error: 'no_token' });

  try {
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${tgId}&limit=1`
    );
    const photosData = await photosRes.json();

    if (!photosData.ok || !photosData.result.total_count) {
      _avatarCache.set(tgId, { url: null, ts: Date.now() });
      return res.status(404).json({ ok: false, error: 'no_photo' });
    }

    const sizes = photosData.result.photos[0];
    const fileId = sizes[sizes.length - 1].file_id;

    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();

    if (!fileData.ok || !fileData.result.file_path) {
      return res.status(502).json({ ok: false, error: 'no_file_path' });
    }

    const photoUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    _avatarCache.set(tgId, { url: photoUrl, ts: Date.now() });

    res.redirect(302, photoUrl);
  } catch (e) {
    console.error('❌ [avatar] Ошибка:', e.message);
    res.status(502).json({ ok: false, error: 'fetch_error' });
  }
});

// ═══════════════════════════════
//  ТРАНЗАКЦИИ
// ═══════════════════════════════

app.post('/api/wallet/deposit', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 5 запросов за 60 секунд
  if (rateLimit(tg.id + '_deposit', 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { amount } = req.body;
  
  if (!amount || amount < WALLET_CONFIG.minAmount || amount > 10000) {
    return res.status(400).json({ 
      ok: false, 
      error: `Сумма должна быть от ${WALLET_CONFIG.minAmount} до 10000 GRAM` 
    });
  }
  
  try {
    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const memo = tg.id + '_' + Date.now().toString(36);
    
    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'deposit',
      amount: amount,
      status: 'pending',
      wallet: WALLET_CONFIG.address,
      memo: memo,
      createdAt: Date.now()
    });
    
    if (getBot()) {
      const adminMsg = `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Пополнение
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${WALLET_CONFIG.address}\`
**Мемо:** \`${memo}\`

Статус: ⏳ Ожидание подтверждения
      `;
      
      if (process.env.ADMIN_TG_ID) {
        try {
          await getBot()?.sendMessage(process.env.ADMIN_TG_ID, adminMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                  { text: '❌ Отклонить', callback_data: `reject_${tx.id}` }
                ]
              ]
            }
          });
        } catch (e) {
          console.error('❌ [wallet] Ошибка уведомления админа:', e.message);
        }
      }
    }
    
    res.json({
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        memo: tx.memo,
        status: tx.status,
        createdAt: tx.createdAt
      }
    });
  } catch (e) {
    console.error('❌ [wallet] deposit error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/wallet/withdraw', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 5 запросов за 60 секунд
  if (rateLimit(tg.id + '_withdraw', 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { amount, wallet } = req.body;
  
  if (!amount || amount < WALLET_CONFIG.minAmount) {
    return res.status(400).json({ 
      ok: false, 
      error: `Минимальная сумма ${WALLET_CONFIG.minAmount} GRAM` 
    });
  }
  
  if (!wallet || wallet.length < 10) {
    return res.status(400).json({ ok: false, error: 'Укажите корректный адрес кошелька' });
  }

  // ✅ Базовая валидация TON-адреса: допустимы только base64url и bounceable форматы
  if (!/^[A-Za-z0-9_\-+=/]{32,100}$/.test(wallet)) {
    return res.status(400).json({ ok: false, error: 'Некорректный формат адреса кошелька' });
  }
  
  try {
    // ✅ Атомарно резервируем баланс — защита от двойного вывода
    const reserved = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.gram': { $gte: amount } },
      { $inc: { 'data.gram': -amount } },
      { new: false }
    );
    if (!reserved) {
      return res.status(400).json({ ok: false, error: 'Недостаточно GRAM на балансе' });
    }

    const txId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const tx = await Transaction.create({
      id: txId,
      userId: tg.id,
      username: tg.username || tg.firstName || 'Игрок',
      type: 'withdraw',
      amount: amount,
      status: 'pending',
      wallet: wallet,
      memo: tg.id + '_' + Date.now().toString(36),
      createdAt: Date.now()
    });
    
    if (getBot() && process.env.ADMIN_TG_ID) {
      const adminMsg = `
💰 **НОВАЯ ТРАНЗАКЦИЯ**

**Тип:** Вывод
**Пользователь:** @${tg.username || 'нет'} (${tg.id})
**Сумма:** ${amount} GRAM
**Кошелек:** \`${wallet}\`

Статус: ⏳ Ожидание подтверждения
      `;
      
      try {
        await getBot()?.sendMessage(process.env.ADMIN_TG_ID, adminMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Подтвердить', callback_data: `approve_${tx.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${tx.id}` }
              ]
            ]
          }
        });
      } catch (e) {
        console.error('❌ [wallet] Ошибка уведомления админа:', e.message);
      }
    }
    
    res.json({
      ok: true,
      tx: {
        id: tx.id,
        amount: tx.amount,
        wallet: tx.wallet,
        status: tx.status,
        createdAt: tx.createdAt
      }
    });
  } catch (e) {
    console.error('❌ [wallet] withdraw error:', e.message);
    // ✅ Возвращаем зарезервированный баланс при ошибке
    try {
      await Save.updateOne({ tgId: tg.id }, { $inc: { 'data.gram': amount } });
    } catch (_) {}
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.post('/api/wallet/transactions', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  
  try {
    const txs = await Transaction.find({ userId: tg.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    res.json({ ok: true, transactions: txs });
  } catch (e) {
    console.error('❌ [wallet] transactions error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── PIXR → GRAM ──
app.post('/api/wallet/exchange', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 10 обменов за 60 секунд
  if (rateLimit(tg.id + '_exchange', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { amount } = req.body;
  if (!amount || amount < 1 || !Number.isInteger(amount)) {
    return res.status(400).json({ ok: false, error: 'Некорректная сумма PIXR' });
  }

  try {
    // Получаем текущую глобальную статистику
    let gstat = await GlobalStat.findOneAndUpdate(
      { _id: 'global' },
      { $setOnInsert: { pixrExchangedTotal: 0 } },
      { upsert: true, new: true }
    );
    const totalBefore = gstat.pixrExchangedTotal || 0;

    // Определяем цену за 1 GRAM в PIXR с учётом порога
    const rate = totalBefore >= PIXR_EXCHANGE_THRESHOLD ? PIXR_PER_GRAM_EXP : PIXR_PER_GRAM_CHEAP;

    if (amount % rate !== 0) {
      return res.status(400).json({
        ok: false,
        error: `Сумма должна быть кратна ${rate} PIXR`
      });
    }
    if (amount < rate) {
      return res.status(400).json({
        ok: false,
        error: `Минимум ${rate} PIXR для обмена`
      });
    }

    const gramEarned = amount / rate;

    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: amount } },
      { $inc: { 'data.pixr': -amount, 'data.gram': gramEarned } },
      { new: true }
    );

    if (!result) {
      return res.status(400).json({ ok: false, error: 'Недостаточно PIXR' });
    }

    // Обновляем глобальный счётчик
    await GlobalStat.findOneAndUpdate(
      { _id: 'global' },
      { $inc: { pixrExchangedTotal: amount } },
      { upsert: true }
    );

    res.json({
      ok: true,
      pixr: result.data.pixr,
      gram: result.data.gram,
      earned: gramEarned,
      rate,
      totalExchanged: totalBefore + amount
    });
  } catch (e) {
    console.error('❌ [wallet] exchange error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── GRAM → PIXR ──
app.post('/api/wallet/exchange-gram', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 10 обменов за 60 секунд
  if (rateLimit(tg.id + '_exchange', 10, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }

  const { amount } = req.body; // amount в GRAM (целое число)
  if (!amount || amount < 1 || !Number.isInteger(amount)) {
    return res.status(400).json({ ok: false, error: 'Минимум 1 GRAM для обмена' });
  }

  try {
    const pixrEarned = amount * GRAM_PER_PIXR_RATE;

    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.gram': { $gte: amount } },
      { $inc: { 'data.gram': -amount, 'data.pixr': pixrEarned } },
      { new: true }
    );

    if (!result) {
      return res.status(400).json({ ok: false, error: 'Недостаточно GRAM' });
    }

    res.json({
      ok: true,
      pixr: result.data.pixr,
      gram: result.data.gram,
      earned: pixrEarned
    });
  } catch (e) {
    console.error('❌ [wallet] exchange-gram error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Глобальная статистика обмена (для индикатора) ──
app.get('/api/wallet/exchange-stats', async (req, res) => {
  try {
    const gstat = await GlobalStat.findOne({ _id: 'global' }).lean();
    const total = gstat ? (gstat.pixrExchangedTotal || 0) : 0;
    const threshold = PIXR_EXCHANGE_THRESHOLD;
    const currentRate = total >= threshold ? PIXR_PER_GRAM_EXP : PIXR_PER_GRAM_CHEAP;
    res.json({ ok: true, totalExchanged: total, threshold, currentRate, gramPerPixr: GRAM_PER_PIXR_RATE });
  } catch (e) {
    console.error('❌ [wallet] exchange-stats error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  МАРКЕТ
// ═══════════════════════════════

const MARKET_OPEN_COST  = 1;
const MARKET_MAX_LOTS   = 3;
const MARKET_TTL_MS     = 48 * 60 * 60 * 1000; // 48 часов
const MARKET_COMMISSION = 0.10;
const MARKET_MIN_RARITY = ['uncommon', 'rare', 'epic', 'legend']; // common запрещён

// ── Открытие маркета (разовая покупка) ──
app.post('/api/market/open', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });

    // Уже открыт
    if (user.data.marketUnlocked) return res.json({ ok: true, alreadyUnlocked: true });

    // Атомарно списываем PIXR
    const result = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: MARKET_OPEN_COST } },
      {
        $inc: { 'data.pixr': -MARKET_OPEN_COST },
        $set: { 'data.marketUnlocked': true, updatedAt: Date.now() }
      },
      { new: true }
    );
    if (!result) return res.status(400).json({ ok: false, error: 'not_enough_pixr' });

    console.log(`✅ [market] ${tg.id} открыл маркет`);
    res.json({ ok: true, pixr: result.data.pixr });
  } catch (e) {
    console.error('❌ [market/open] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Список активных лотов ──
app.post('/api/market/list', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { rarity, type } = req.body || {};
    const filter = { status: 'active', expiresAt: { $gt: Date.now() } };
    if (rarity && rarity !== 'all') {
      if (rarity === 'book') {
        filter['item.isSkillBook'] = true;
      } else {
        filter['item.rarity'] = rarity;
        filter['item.isSkillBook'] = { $ne: true };
      }
    }
    const listings = await MarketListing.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ ok: true, listings });
  } catch (e) {
    console.error('❌ [market/list] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Мои лоты (активные + проданные к получению) ──
app.post('/api/market/my', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    // Активные лоты + проданные у которых pendingPixr ещё не получен
    const listings = await MarketListing.find({
      sellerId: tg.id,
      $or: [
        { status: 'active' },
        { status: 'sold', claimedAt: null }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ ok: true, listings });
  } catch (e) {
    console.error('❌ [market/my] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Забрать PIXR за проданный лот ──
app.post('/api/market/claim', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ ok: false, error: 'bad_params' });

    // Атомарно: найти свой sold-лот с pendingPixr и пометить как claimed
    const listing = await MarketListing.findOneAndUpdate(
      { listingId, sellerId: tg.id, status: 'sold', claimedAt: null, pendingPixr: { $gt: 0 } },
      { $set: { claimedAt: Date.now() } },
      { new: false }
    );
    if (!listing) return res.status(400).json({ ok: false, error: 'not_found' });

    const earned = listing.pendingPixr;

    // Начисляем PIXR продавцу
    // ✅ FIX #4: обновляем data.updatedAt чтобы последующий saveInstant клиента
    // не перетёр начисленный pixr устаревшим значением из снапшота
    const now = Date.now();
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $inc: { 'data.pixr': earned },
        $set: { 'data.updatedAt': now, updatedAt: now }
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ ok: false, error: 'user_not_found' });

    console.log(`✅ [market/claim] ${tg.id} забрал ${earned} PIXR за лот ${listingId}`);
    res.json({ ok: true, earned, pixr: updated.data.pixr });
  } catch (e) {
    console.error('❌ [market/claim] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── История продаж ──
app.post('/api/market/history', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const listings = await MarketListing.find({
      sellerId: tg.id,
      status: { $in: ['sold', 'cancelled'] }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ ok: true, listings });
  } catch (e) {
    console.error('❌ [market/history] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Выставить предмет ──
const _listingLocks = new Set();
app.post('/api/market/sell', async (req, res) => {
  console.log('📦 [market/sell] BODY:', req.body);
  
  const tg = authUser(req, res);
  if (!tg) {
    console.log('❌ [market/sell] auth failed');
    return res.status(401).json({ ok: false, error: 'auth_failed' });
  }
  
  if (_listingLocks.has(tg.id)) {
    return res.status(429).json({ ok: false, error: 'in_progress' });
  }
  _listingLocks.add(tg.id);
  
  try {
    const { itemId, price } = req.body || {};
    
    console.log(`📦 [market/sell] itemId=${itemId}, price=${price}, tg=${tg.id}`);
    
    // ✅ Проверяем что itemId и price есть
    if (itemId === undefined || itemId === null || !price || price < 1) {
      console.log('❌ [market/sell] bad_params:', { itemId, price });
      return res.status(400).json({ ok: false, error: 'bad_params' });
    }

    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) {
      return res.status(404).json({ ok: false, error: 'no_save' });
    }
    
    if (!user.data.marketUnlocked) {
      return res.status(403).json({ ok: false, error: 'market_locked' });
    }

    const activeCount = await MarketListing.countDocuments({ 
      sellerId: tg.id, 
      status: 'active' 
    });
    if (activeCount >= MARKET_MAX_LOTS) {
      return res.status(400).json({ ok: false, error: 'max_lots' });
    }

    const inventory = user.data.inventory || [];
    // ✅ ИСПРАВЛЕННОЕ СРАВНЕНИЕ
    const itemIdx = inventory.findIndex(i => Number(i.id) === Number(itemId));
    if (itemIdx === -1) {
      console.log(`❌ [market/sell] item not found: ${itemId}`);
      return res.status(400).json({ ok: false, error: 'item_not_found' });
    }

    // Очищаем служебные поля перед сохранением в листинг
    const item = Object.assign({}, inventory[itemIdx]);
    console.log(`✅ [market/sell] item found: ${item.name}, refine=${item.refine || 0}`);

    if (!item.isSkillBook && !MARKET_MIN_RARITY.includes(item.rarity)) {
      return res.status(400).json({ ok: false, error: 'rarity_too_low' });
    }
    if (item._equipped) {
      return res.status(400).json({ ok: false, error: 'item_equipped' });
    }
    delete item._equipped;

    // Удаляем предмет из инвентаря
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.inventory': { $elemMatch: { id: item.id } } },
      { $pull: { 'data.inventory': { id: item.id } }, $set: { updatedAt: Date.now() } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ ok: false, error: 'item_not_found' });
    }

    const now = Date.now();
    const listingId = 'lst_' + now + '_' + Math.random().toString(36).substring(2, 6);
    const listing = await MarketListing.create({
      listingId,
      sellerId:   tg.id,
      sellerName: user.firstName || user.username || 'Игрок',
      item,
      price:      Math.floor(price),
      status:     'active',
      createdAt:  now,
      expiresAt:  now + MARKET_TTL_MS,
    });

    console.log(`✅ [market] ${tg.id} выставил ${item.name} за ${price} PIXR`);
    res.json({ ok: true, listing, inventory: updated.data.inventory });
    
  } catch (e) {
    console.error('❌ [market/sell] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _listingLocks.delete(tg.id);
  }
});

// ── Купить лот ──

// ── Выставить руду на маркет ──
app.post('/api/market/sell-ore', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return res.status(401).json({ ok: false, error: 'auth_failed' });
  if (_listingLocks.has(tg.id)) return res.status(429).json({ ok: false, error: 'in_progress' });
  _listingLocks.add(tg.id);
  try {
    const { oreId, qty, price } = req.body || {};
    if (!oreId || !qty || qty < 1 || !price || price < 1) {
      return res.status(400).json({ ok: false, error: 'bad_params' });
    }

    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });
    if (!user.data.marketUnlocked) return res.status(403).json({ ok: false, error: 'market_locked' });

    const activeCount = await MarketListing.countDocuments({ sellerId: tg.id, status: 'active' });
    if (activeCount >= MARKET_MAX_LOTS) return res.status(400).json({ ok: false, error: 'max_lots' });

    const haveQty = (user.data.ore || {})[oreId] || 0;
    if (haveQty < qty) return res.status(400).json({ ok: false, error: 'not_enough' });

    // Атомарно списываем руду
    const incKey = 'data.ore.' + oreId;
    const updated = await Save.findOneAndUpdate(
      { tgId: tg.id, [incKey]: { $gte: qty } },
      { $inc: { [incKey]: -qty }, $set: { updatedAt: Date.now() } },
      { new: true }
    );
    if (!updated) return res.status(400).json({ ok: false, error: 'not_enough' });

    const ORE_NAMES = { core:'Обычная руда', uore:'Необычная руда', rore:'Редкая руда', eore:'Эпическая руда', lore:'Легендарная руда' };
    const ORE_ICONS = { core:'images/core.png', uore:'images/uore.png', rore:'images/rore.png', eore:'images/eore.png', lore:'images/lore.png' };
    const oreItem = {
      isOre:  true,
      oreId,
      qty:    Math.floor(qty),
      name:   (ORE_NAMES[oreId] || oreId) + ' ×' + qty,
      icon:   ORE_ICONS[oreId] || 'images/core.png',
      rarity: { core:'common', uore:'uncommon', rore:'rare', eore:'epic', lore:'legend' }[oreId] || 'common',
    };

    const now = Date.now();
    const listingId = 'ore_' + now + '_' + Math.random().toString(36).substring(2, 6);
    const listing = await MarketListing.create({
      listingId,
      sellerId:   tg.id,
      sellerName: user.firstName || user.username || 'Игрок',
      item:       oreItem,
      price:      Math.floor(price),
      status:     'active',
      createdAt:  now,
      expiresAt:  now + MARKET_TTL_MS,
    });

    console.log('✅ [market] ' + tg.id + ' выставил руду ' + oreId + '×' + qty + ' за ' + price + ' PIXR');
    res.json({ ok: true, listing });
  } catch (e) {
    console.error('❌ [market/sell-ore] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _listingLocks.delete(tg.id);
  }
});

const _buyLocks = new Set();
app.post('/api/market/buy', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  if (_buyLocks.has(tg.id)) return res.status(429).json({ ok: false, error: 'in_progress' });
  _buyLocks.add(tg.id);
  try {
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ ok: false, error: 'bad_params' });

    const user = await Save.findOne({ tgId: tg.id }).lean();
    if (!user || !user.data) return res.status(404).json({ ok: false, error: 'no_save' });
    if (!user.data.marketUnlocked) return res.status(403).json({ ok: false, error: 'market_locked' });

    // Берём лот
    const listing = await MarketListing.findOne({ listingId, status: 'active' }).lean();
    if (!listing) return res.status(400).json({ ok: false, error: 'listing_not_found' });
    if (listing.expiresAt <= Date.now()) return res.status(400).json({ ok: false, error: 'listing_expired' });
    if (listing.sellerId === tg.id) return res.status(400).json({ ok: false, error: 'own_listing' });

    const price = listing.price;
    const isOre  = !!(listing.item && listing.item.isOre);

    // Атомарно списываем PIXR у покупателя и начисляем предмет/руду
    let buyerUpdate;
    if (isOre) {
      const oreKey = 'data.ore.' + listing.item.oreId;
      buyerUpdate = {
        $inc: { 'data.pixr': -price, [oreKey]: listing.item.qty },
        $set: { updatedAt: Date.now() }
      };
    } else {
      buyerUpdate = {
        $inc: { 'data.pixr': -price },
        $push: { 'data.inventory': listing.item },
        $set: { updatedAt: Date.now() }
      };
    }
    const buyer = await Save.findOneAndUpdate(
      { tgId: tg.id, 'data.pixr': { $gte: price } },
      buyerUpdate,
      { new: true }
    );
    if (!buyer) return res.status(400).json({ ok: false, error: 'not_enough_pixr' });

    const buyerFirstName = user.firstName || (user.data && user.data.firstName) || '';
    const sold = await MarketListing.findOneAndUpdate(
      { listingId, status: 'active' },
      {
        $set: {
          status: 'sold',
          buyerId: tg.id,
          buyerName: buyerFirstName || user.username || 'Игрок',
          soldAt: Date.now(),
        }
      },
      { new: false }
    );
    if (!sold) {
      // Лот уже купили — откатываем у покупателя
      if (isOre) {
        const oreKey = 'data.ore.' + listing.item.oreId;
        await Save.findOneAndUpdate(
          { tgId: tg.id },
          { $inc: { 'data.pixr': price, [oreKey]: -listing.item.qty } }
        );
      } else {
        await Save.findOneAndUpdate(
          { tgId: tg.id },
          {
            $inc: { 'data.pixr': price },
            $pull: { 'data.inventory': { id: listing.item.id } }
          }
        );
      }
      return res.status(400).json({ ok: false, error: 'already_sold' });
    }

    // Начисляем продавцу 90% — НЕ сразу, а как "к получению"
    const sellerEarns = Math.floor(price * (1 - MARKET_COMMISSION));
    // Обновляем листинг: ставим pendingPixr (продавец должен забрать вручную)
    await MarketListing.findOneAndUpdate(
      { listingId },
      { $set: { pendingPixr: sellerEarns } }
    );

    notifyClient(listing.sellerId, 'market_sold', {
      listingId,
      itemName: listing.item.name,
      earned:   sellerEarns,
      pending:  true,
    });

    console.log(`✅ [market] ${tg.id} купил "${listing.item.name}" у ${listing.sellerId} за ${price} PIXR`);
    if (isOre) {
      res.json({ ok: true, item: listing.item, pixr: buyer.data.pixr, ore: buyer.data.ore || {} });
    } else {
      res.json({ ok: true, item: listing.item, pixr: buyer.data.pixr, inventory: buyer.data.inventory });
    }
  } catch (e) {
    console.error('❌ [market/buy] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    _buyLocks.delete(tg.id);
  }
});

// ── Снять лот с продажи ──
app.post('/api/market/cancel', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const { listingId } = req.body || {};
    if (!listingId) return res.status(400).json({ ok: false, error: 'bad_params' });

    // Атомарно — только свой лот, только active
    const cancelled = await MarketListing.findOneAndUpdate(
      { listingId, sellerId: tg.id, status: 'active' },
      { $set: { status: 'cancelled', cancelledAt: Date.now() } },
      { new: false }
    );
    if (!cancelled) return res.status(400).json({ ok: false, error: 'listing_not_found' });

    // Возвращаем предмет/руду в инвентарь
    let updated;
    if (cancelled.item && cancelled.item.isOre) {
      const oreKey = 'data.ore.' + cancelled.item.oreId;
      updated = await Save.findOneAndUpdate(
        { tgId: tg.id },
        { $inc: { [oreKey]: cancelled.item.qty }, $set: { updatedAt: Date.now() } },
        { new: true }
      );
    } else {
      updated = await Save.findOneAndUpdate(
        { tgId: tg.id },
        { $push: { 'data.inventory': cancelled.item }, $set: { updatedAt: Date.now() } },
        { new: true }
      );
    }

    console.log('✅ [market] ' + tg.id + ' снял лот ' + listingId);
    if (cancelled.item && cancelled.item.isOre) {
      res.json({ ok: true, item: cancelled.item, ore: updated.data.ore || {} });
    } else {
      res.json({ ok: true, item: cancelled.item, inventory: updated.data.inventory });
    }
  } catch (e) {
    console.error('❌ [market/cancel] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});



// ═══════════════════════════════
//  PvP АРЕНА
// ═══════════════════════════════

// Базовые статы персонажей (зеркало data.js CHARS.baseStats)
const CHARS_BASE = {
  fire:  { atk: 18, def: 4,  spd: 3,  hp: 85,  crit: 6,  dodge: 3, atkSpd: 1.2, critDmg: 0 },
  light: { atk: 8,  def: 14, spd: 3,  hp: 130, crit: 4,  dodge: 4, atkSpd: 0.8, critDmg: 0 },
  water: { atk: 12, def: 6,  spd: 4,  hp: 95,  crit: 22, dodge: 5, atkSpd: 1.0, critDmg: 0 },
};

// Зеркало UPG_DEFS из data.js
const UPG_DEFS_SRV = [
  { id: 'atk',     stat: 'atk',     bonus: 3    },
  { id: 'def',     stat: 'def',     bonus: 2    },
  { id: 'hp',      stat: 'hp',      bonus: 15   },
  { id: 'spd',     stat: 'spd',     bonus: 1    },
  { id: 'atkSpd',  stat: 'atkSpd',  bonus: 0.15 },
  { id: 'crit',    stat: 'crit',    bonus: 3    },
  { id: 'critDmg', stat: 'critDmg', bonus: 0.15 },
  { id: 'dodge',   stat: 'dodge',   bonus: 2    },
];

// Пересчёт полных статов игрока (база + улучшения + уровень + экипировка)
// Зеркало логики applySnapshot + recalcStats с клиента
function calcFullStats(data) {
  const charId = data.charId;
  const charBase = CHARS_BASE[charId];
  if (!charBase) return data.stats || {};

  // 1. Начинаем с базы персонажа
  const base = Object.assign({}, charBase);

  // 2. Применяем улучшения (upg)
  const upg = data.upg || {};
  UPG_DEFS_SRV.forEach(u => {
    const lv = upg[u.id] || 0;
    if (lv > 0) {
      base[u.stat] = parseFloat(((base[u.stat] || 0) + u.bonus * lv).toFixed(4));
    }
  });

  // 3. Бонусы уровня (как в applySnapshot)
  const lvBonuses = (data.level || 1) - 1;
  if (lvBonuses > 0) {
    base.atk    = (base.atk    || 0) + lvBonuses * 2;
    base.def    = (base.def    || 0) + lvBonuses * 1;
    base.hp     = (base.hp     || 0) + lvBonuses * 10;
    base.atkSpd = parseFloat(((base.atkSpd || 1.0) + lvBonuses * 0.02).toFixed(4));
  }

  // 4. Суммируем бонусы от экипировки
  // inventory хранит полные объекты, equipped хранит id предметов
  const inventory = data.inventory || [];
  const equipped  = data.equipped  || {};
  const EQUIP_SLOTS = ['weapon','body','legs','gloves','belt','ring','boots','helmet'];
  const bonus = { atk: 0, def: 0, hp: 0, spd: 0, crit: 0, dodge: 0, atkSpd: 0, critDmg: 0 };

  EQUIP_SLOTS.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    // Ищем предмет в инвентаре по id (Number-safe сравнение)
    const item = inventory.find(i => Number(i.id) === Number(itemId) || i.id === itemId);
    if (!item || !item.stats) return;
    Object.keys(item.stats).forEach(stat => {
      bonus[stat] = (bonus[stat] || 0) + (item.stats[stat] || 0);
    });
    // ✅ FIX #9: учитываем руны предмета (atk/def/hp)
    if (item.rune && typeof item.rune === 'object') {
      ['atk', 'def', 'hp'].forEach(stat => {
        if (item.rune[stat]) bonus[stat] = (bonus[stat] || 0) + item.rune[stat];
      });
    }
  });

  // 5. Итоговые статы + капы предметных бонусов (зеркало equippedStats клиента)
  bonus.crit    = Math.min(bonus.crit,    10);
  bonus.dodge   = Math.min(bonus.dodge,   10);
  bonus.critDmg = Math.min(bonus.critDmg, 0.5);

  const stats = {};
  ['atk','def','hp','spd','crit','dodge','atkSpd','critDmg'].forEach(s => {
    stats[s] = (base[s] || 0) + (bonus[s] || 0);
  });
  stats.hp    = Math.floor(stats.hp);
  stats.atk   = Math.floor(stats.atk);
  stats.def   = Math.floor(stats.def);
  stats.crit  = Math.floor(stats.crit);
  stats.dodge = Math.floor(stats.dodge);
  stats.atkSpd = parseFloat((stats.atkSpd || 1.0).toFixed(4));
  // critDmg как множитель (зеркало effectiveCritDmg клиента: 1.8 + stats.critDmg)
  stats.effectiveCritDmg = parseFloat((1.8 + (stats.critDmg || 0)).toFixed(4));

  return stats;
}

// Получить 3 случайных противника из рейтинга ±200 очков
app.post('/api/pvp/opponents', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const doc = await Save.findOne({ tgId: tg.id }).lean();
    if (!doc || !doc.data) return res.json({ ok: false, error: 'no_save' });

    const myRating = doc.data.arenaRating || 1000;
    const minR = myRating - 200;
    const maxR = myRating + 200;

    // Берём игроков в диапазоне рейтинга, исключая себя
    const pool = await Save.find({
      tgId: { $ne: tg.id },
      'data.arenaRating': { $gte: minR, $lte: maxR },
      'data.charId': { $ne: null },
    }, 'tgId firstName username charId data.arenaRating data.stats data.baseStats data.upg data.skills data.equipped data.level data.charId').lean();

    // Если мало игроков в диапазоне — добавляем произвольных
    let candidates = pool;
    if (candidates.length < 5) {
      const extra = await Save.find({
        tgId: { $ne: tg.id },
        'data.charId': { $ne: null },
      }, 'tgId firstName username charId data.arenaRating data.stats data.baseStats data.upg data.skills data.equipped data.level data.charId').limit(30).lean();
      const extraFiltered = extra.filter(e => !candidates.find(c => c.tgId === e.tgId));
      candidates = candidates.concat(extraFiltered);
    }

    // Перемешиваем и берём 3
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const chosen = candidates.slice(0, 3).map(p => {
      const d = p.data || {};
      const fullStats = calcFullStats(d);
      return {
        tgId:     p.tgId,
        name:     p.firstName || p.username || 'Игрок',
        charId:   d.charId || p.charId,
        level:    d.level  || 1,
        rating:   d.arenaRating || 1000,
        stats:    fullStats,
        maxHp:    fullStats.hp || 100,
        skills:   d.skills || {},
      };
    });

    res.json({ ok: true, opponents: chosen, myRating });
  } catch (e) {
    console.error('❌ [pvp/opponents]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Серверная симуляция PvP боя (детерминированная по статам) ──
function simulatePvpBattle(myStats, oppStats) {
  const SIM_DURATION = 60; // секунд
  const TICK = 1.0;        // такт симуляции

  let myHp  = Math.max(1, Math.floor(myStats.hp  || 100));
  let oppHp = Math.max(1, Math.floor(oppStats.hp || 100));
  const myAtk  = Math.max(1, myStats.atk   || 10);
  const oppAtk = Math.max(1, oppStats.atk  || 10);
  const myDef  = myStats.def   || 0;
  const oppDef = oppStats.def  || 0;
  const mySpd  = Math.max(0.1, myStats.atkSpd  || 1.0);
  const oppSpd = Math.max(0.1, oppStats.atkSpd || 1.0);
  const myCrit    = Math.min(100, myStats.crit   || 0) / 100;
  const oppCrit   = Math.min(100, oppStats.crit  || 0) / 100;
  const myDodge   = Math.min(100, myStats.dodge  || 0) / 100;
  const oppDodge  = Math.min(100, oppStats.dodge || 0) / 100;
  const myCritDmg  = myStats.effectiveCritDmg  || 1.8;
  const oppCritDmg = oppStats.effectiveCritDmg || 1.8;

  let myTimer  = 1 / mySpd;
  let oppTimer = 1 / oppSpd;
  let elapsed  = 0;
  let myDmgDealt = 0, oppDmgDealt = 0;

  while (elapsed < SIM_DURATION && myHp > 0 && oppHp > 0) {
    elapsed += TICK;
    myTimer  -= TICK;
    oppTimer -= TICK;

    if (myTimer <= 0) {
      if (Math.random() >= oppDodge) {
        const isCrit = Math.random() < myCrit;
        const raw = Math.max(1, myAtk - oppDef * 0.3);
        const dmg = Math.floor(raw * (isCrit ? myCritDmg : 1));
        oppHp -= dmg;
        myDmgDealt += dmg;
      }
      myTimer = 1 / mySpd;
    }

    if (oppTimer <= 0 && oppHp > 0) {
      if (Math.random() >= myDodge) {
        const isCrit = Math.random() < oppCrit;
        const raw = Math.max(1, oppAtk - myDef * 0.3);
        const dmg = Math.floor(raw * (isCrit ? oppCritDmg : 1));
        myHp -= dmg;
        oppDmgDealt += dmg;
      }
      oppTimer = 1 / oppSpd;
    }
  }

  // Определяем победителя: по HP (кто выжил), при ничьей — по нанесённому урону
  let won;
  if (myHp > 0 && oppHp <= 0)       won = true;
  else if (oppHp > 0 && myHp <= 0)  won = false;
  else won = myDmgDealt >= oppDmgDealt; // оба живы после 60с — побеждает нанёсший больше

  return { won, myDmgDealt, oppDmgDealt };
}

// Сохранить результат PvP боя
app.post('/api/pvp/result', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;

  // ✅ Rate limit: не более 15 запросов за 60 секунд
  if (rateLimit(tg.id + '_pvp', 15, 60000)) {
    return res.status(429).json({ ok: false, error: 'rate_limit' });
  }
  try {
    const { opponentId } = req.body;
    if (!opponentId) return res.json({ ok: false, error: 'bad_params' });

    const [myDoc, oppDoc] = await Promise.all([
      Save.findOne({ tgId: tg.id }).lean(),
      Save.findOne({ tgId: opponentId }).lean(),
    ]);
    if (!myDoc || !myDoc.data) return res.json({ ok: false, error: 'no_save' });
    if (!oppDoc || !oppDoc.data) return res.json({ ok: false, error: 'opponent_not_found' });

    // Проверка попыток (10 в день, сброс в полночь UTC)
    const todayStr = new Date().toISOString().slice(0, 10);
    const data = myDoc.data;
    const pvpDate = data.pvpAttemptsDate || '';
    let pvpAttempts = (pvpDate === todayStr) ? (data.pvpAttempts || 0) : 0;

    if (pvpAttempts >= 10) {
      return res.json({ ok: false, error: 'no_attempts' });
    }

    // ✅ Server-side симуляция боя — не доверяем полю `won` от клиента
    const myFullStats  = calcFullStats(myDoc.data);
    const oppFullStats = calcFullStats(oppDoc.data);
    const { won, myDmgDealt, oppDmgDealt } = simulatePvpBattle(myFullStats, oppFullStats);

    const myRating  = data.arenaRating || 1000;
    const oppRating = (oppDoc.data.arenaRating) || 1000;

    // Очки: победа над сильнее = +10, над слабее = +5; поражение = -5
    let ratingChange = 0;
    if (won) {
      ratingChange = (oppRating >= myRating) ? 10 : 5;
    } else {
      ratingChange = -5;
    }

    const newMyRating = Math.max(0, myRating + ratingChange);
    // Рейтинг защитника не меняется (одностороннее PvP)
    const now = Date.now();

    // Обновляем рейтинг атакующего
    await Save.findOneAndUpdate(
      { tgId: tg.id },
      {
        $set: {
          'data.arenaRating':      newMyRating,
          'data.pvpAttempts':      pvpAttempts + 1,
          'data.pvpAttemptsDate':  todayStr,
          'data.updatedAt':        now,
          updatedAt:               now,
        }
      }
    );

    // Сохраняем историю боя
    const battleId  = tg.id + '_' + opponentId + '_' + now;
    const oppName   = (oppDoc.firstName || oppDoc.username) || 'Игрок';
    const oppChar   = (oppDoc.data && oppDoc.data.charId) || null;

    await PvpBattle.create({
      battleId,
      attackerId:   tg.id,
      defenderId:   opponentId,
      attackerName: tg.firstName || tg.username || 'Игрок',
      defenderName: oppName,
      attackerChar: data.charId || null,
      defenderChar: oppChar,
      winnerId:     won ? tg.id : opponentId,
      ratingChange,
      attackerRatingBefore: myRating,
      defenderRatingBefore: oppRating,
      attackerDmgDealt: myDmgDealt,   // ✅ серверное значение
      defenderDmgDealt: oppDmgDealt,  // ✅ серверное значение
      createdAt: now,
    }).catch(() => {}); // Игнорируем ошибки дубликата

    res.json({
      ok: true,
      won,
      ratingChange,
      newRating: newMyRating,
      attemptsLeft: 10 - (pvpAttempts + 1),
    });
  } catch (e) {
    console.error('❌ [pvp/result]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Топ-50 по рейтингу арены
app.post('/api/pvp/rating', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const top = await Save.find(
      { 'data.arenaRating': { $exists: true }, 'data.charId': { $ne: null } },
      'tgId firstName username charId data.arenaRating data.level data.charId'
    ).sort({ 'data.arenaRating': -1 }).limit(50).lean();

    const players = top.map(p => ({
      tgId:   p.tgId,
      name:   p.firstName || p.username || 'Игрок',
      charId: (p.data && p.data.charId) || p.charId,
      level:  (p.data && p.data.level) || 1,
      rating: (p.data && p.data.arenaRating) || 1000,
    }));

    const myDoc = await Save.findOne({ tgId: tg.id }, 'data.arenaRating').lean();
    const myRating = (myDoc && myDoc.data && myDoc.data.arenaRating) || 1000;

    res.json({ ok: true, players, myRating, tgId: tg.id });
  } catch (e) {
    console.error('❌ [pvp/rating]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// История боёв (20 последних)
app.post('/api/pvp/history', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const battles = await PvpBattle.find({
      $or: [{ attackerId: tg.id }, { defenderId: tg.id }]
    }).sort({ createdAt: -1 }).limit(20).lean();

    res.json({ ok: true, battles, tgId: tg.id });
  } catch (e) {
    console.error('❌ [pvp/history]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ═══════════════════════════════
//  РЕЙТИНГ ПО ВРЕМЕНИ В ИГРЕ
// ═══════════════════════════════

// Топ-50 по общему времени (для игроков)
app.post('/api/playtime/rating', async (req, res) => {
  const tg = authUser(req, res);
  if (!tg) return;
  try {
    const top = await PlaytimeRating.find(
      { charId: { $ne: null } },
      'tgId firstName username charId level totalSeconds todaySeconds lastSeenAt'
    ).sort({ totalSeconds: -1 }).limit(50).lean();

    const players = top.map(p => ({
      tgId:         p.tgId,
      name:         p.firstName || p.username || 'Игрок',
      charId:       p.charId,
      level:        p.level || 1,
      totalSeconds: p.totalSeconds || 0,
      todaySeconds: p.todaySeconds || 0,
      lastSeenAt:   p.lastSeenAt || 0,
    }));

    const myDoc = await PlaytimeRating.findOne({ tgId: tg.id }, 'totalSeconds todaySeconds').lean();
    res.json({
      ok: true, players,
      myTotal: (myDoc && myDoc.totalSeconds) || 0,
      myToday: (myDoc && myDoc.todaySeconds) || 0,
      tgId: tg.id,
    });
  } catch (e) {
    console.error('❌ [playtime/rating]', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ── Счётчик сессий при входе в игру ──
app.post('/bot/transaction/:txId/:action', async (req, res) => {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== BOT_TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const { txId, action } = req.params;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'invalid_action' });
  }

  try {
    // ✅ Атомарно меняем статус — защита от двойного одобрения
    const tx = await Transaction.findOneAndUpdate(
      { id: txId, status: 'pending' },
      { $set: { status: action === 'approve' ? 'approved' : 'rejected',
                [action === 'approve' ? 'approvedAt' : 'rejectedAt']: Date.now() } },
      { new: false }
    );
    if (!tx) {
      const existing = await Transaction.findOne({ id: txId }).lean();
      if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.status(400).json({ ok: false, error: 'already_processed' });
    }

    if (action === 'approve') {
      const gramDelta = tx.type === 'deposit' ? tx.amount : -tx.amount;
      
      console.log(`💰 [bot] Начисление ${gramDelta} GRAM пользователю ${tx.userId} (tx: ${txId})`);
      
      const newUpdatedAt = Date.now();
      
      const result = await Save.findOneAndUpdate(
        { tgId: tx.userId },
        { 
          $inc: { 'data.gram': gramDelta },
          $set: { 
            'data.updatedAt': newUpdatedAt,
            updatedAt: newUpdatedAt 
          }
        },
        { new: true }
      );
      
      console.log(`💰 [bot] Новый баланс пользователя ${tx.userId}: ${result?.data?.gram || 0} GRAM`);
      
      notifyClient(tx.userId, 'reload', { 
        reason: 'balance_updated',
        gram: result?.data?.gram || 0
      });

      // ── Реферальный бонус: 5% от депозита GRAM рефереру ──
      if (tx.type === 'deposit' && tx.amount > 0) {
        try {
          const depositor = await Save.findOne({ tgId: tx.userId }, 'refBy firstName username').lean();
          if (depositor && depositor.refBy) {
            const bonus = Math.round(tx.amount * REF_DEPOSIT_BONUS * 1000) / 1000;
            if (bonus > 0) {
              const refUpdatedAt = Date.now();
              const refResult = await Save.findOneAndUpdate(
                { tgId: depositor.refBy },
                {
                  $inc: { 'data.gram': bonus },
                  $set: { 'data.updatedAt': refUpdatedAt, updatedAt: refUpdatedAt }
                },
                { new: true }
              );
              console.log(`🎁 [bot] Реф. бонус ${bonus} GRAM → ${depositor.refBy} (от депозита ${tx.amount} GRAM пользователя ${tx.userId})`);
              notifyClient(depositor.refBy, 'reload', {
                reason: 'ref_bonus',
                gram: refResult?.data?.gram || 0
              });
              if (getBot()) {
                const depositorName = depositor.firstName || depositor.username || tx.userId;
                try {
                  await getBot()?.sendMessage(
                    depositor.refBy,
                    `🎁 *Реферальный бонус!*\n\nВаш друг *${depositorName}* пополнил баланс на *${tx.amount} GRAM*\nВы получили *+${bonus} GRAM* (5%) на счёт!`,
                    { parse_mode: 'Markdown' }
                  );
                } catch (e) {}
              }
            }
          }
        } catch (refErr) {
          console.error('❌ [bot] Ошибка начисления реф. бонуса:', refErr.message);
        }
      }
    }

    try { await AdminLog.create({ admin: 'bot', action: action + '_transaction', target: tx.userId, details: { txId, amount: tx.amount }, timestamp: Date.now() }); } catch (_) {}

    if (getBot()) {
      const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
      const msg = `💰 *Транзакция ${statusText}*\n\n*Тип:* ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}\n*Сумма:* ${tx.amount} GRAM\n${action === 'approve' ? '✅ Баланс обновлён!' : '❌ Средства не зачислены.'}\n\n🔄 *Для обновления баланса перезапустите игру или нажмите "Обновить" в кошельке.*`;
      try { await getBot()?.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' }); } catch (e) {}
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ [bot-tx] error:', e.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});



// ═══════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ МОДУЛЕЙ
// ═══════════════════════════════
initBot(app, { Save, Transaction, notifyClient, REF_DEPOSIT_BONUS, AdminLog });

registerAdminRoutes(app, {
  Save, Transaction, AdminLog, SpecialTask, PlaytimeRating,
  notifyClient, getBot, REF_DEPOSIT_BONUS,
});

// ═══════════════════════════════
//  Запуск
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server on :${PORT}`);
  console.log(`📊 MongoDB: 5GB, Pool: 50`);
});
