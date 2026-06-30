/*
  ══════════════════════════════════════════════════════
  admin.js — Админ-панель роуты
  Импортируется из server.js через registerAdminRoutes(app, deps)
  ══════════════════════════════════════════════════════
*/

const path   = require('path');
const crypto = require('crypto');

// ── Конфиг ──
const ADMIN_CREDENTIALS = {
  admin: {
    password: process.env.ADMIN_PASSWORD,
    role: 'superadmin'
  }
};

// ── Защита от брутфорса на /admin/login ──
const _loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS    = 15 * 60 * 1000; // 15 минут

function checkLoginRateLimit(ip) {
  const now = Date.now();
  let entry = _loginAttempts.get(ip);
  if (!entry || now > entry.reset) {
    entry = { n: 0, reset: now + LOGIN_WINDOW_MS };
    _loginAttempts.set(ip, entry);
  }
  entry.n++;
  return entry.n > LOGIN_MAX_ATTEMPTS;
}

setInterval(() => {
  const now = Date.now();
  _loginAttempts.forEach((v, k) => { if (now > v.reset) _loginAttempts.delete(k); });
}, LOGIN_WINDOW_MS);

// ── Сессии ──
const adminSessions = new Map();

function generateSessionId() {
  return crypto.randomBytes(24).toString('hex');
}

function createSession(login, role) {
  const sessionId = generateSessionId();
  adminSessions.set(sessionId, { login, role, expires: Date.now() + 24 * 60 * 60 * 1000 });
  return sessionId;
}

function getSession(sessionId) {
  const session = adminSessions.get(sessionId);
  if (!session) return null;
  if (session.expires < Date.now()) { adminSessions.delete(sessionId); return null; }
  return session;
}

function requireAdmin(req, res, next) {
  const session = getSession(req.headers['x-admin-session'] || req.query.session);
  if (!session) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.admin = session;
  next();
}

// Очистка протухших сессий
setInterval(() => {
  const now = Date.now();
  adminSessions.forEach((s, k) => { if (s.expires < now) adminSessions.delete(k); });
}, 60 * 60 * 1000);

function registerAdminRoutes(app, { Save, Transaction, AdminLog, SpecialTask, PlaytimeRating, notifyClient, getBot, REF_DEPOSIT_BONUS }) {

  async function logAdminAction(admin, action, target, details) {
    try { await AdminLog.create({ admin, action, target, details }); }
    catch (e) { console.error('❌ [admin] log error:', e.message); }
  }

  // ── Транзакции ──
  app.get('/admin/api/transactions', requireAdmin, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
      const limit = Math.min(parseInt(req.query.limit) || 50, 500); // ✅ cap на 500
      const txs = await Transaction.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      res.json({ ok: true, transactions: txs });
    } catch (e) { res.status(500).json({ ok: false, error: 'server_error' }); }
  });

  // ── Список пользователей ──
  app.get('/admin/api/users', requireAdmin, async (req, res) => {
    try {
      const page  = parseInt(req.query.page)  || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 200); // ✅ cap на 200
      const rawSearch = req.query.search || '';
      // ✅ Escape специальных regex-символов чтобы исключить ReDoS
      const search = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const filter = search ? {
        $or: [
          { tgId:      { $regex: search, $options: 'i' } },
          { username:  { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } }
        ]
      } : {};

      const [total, users] = await Promise.all([
        Save.countDocuments(filter),
        Save.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
      ]);

      res.json({
        ok: true,
        users: users.map(u => ({
          tgId: u.tgId, username: u.username, firstName: u.firstName,
          charId: u.charId, level: u.level, cp: u.cp, floor: u.floor,
          updatedAt: u.updatedAt, data: u.data || {}
        })),
        total, page, limit, pages: Math.ceil(total / limit)
      });
    } catch (e) { res.status(500).json({ ok: false, error: 'server_error' }); }
  });

  // ── Задания ──
  app.get('/admin/api/tasks', requireAdmin, async (req, res) => {
    try {
      res.json({ ok: true, tasks: await SpecialTask.find().sort({ createdAt: -1 }).lean() });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/admin/api/tasks', requireAdmin, async (req, res) => {
    try {
      const { title, description, link, linkText, rewardType, rewardAmount } = req.body;
      if (!title || !rewardType || !rewardAmount)
        return res.status(400).json({ ok: false, error: 'missing_fields' });
      const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const task = await SpecialTask.create({
        taskId, title,
        description:  description  || '',
        link:         link         || '',
        linkText:     linkText     || 'Перейти',
        rewardType,
        rewardAmount: Number(rewardAmount),
        active: true,
        createdAt: Date.now(),
      });
      await logAdminAction(req.admin.login, 'create_task', taskId, { title, rewardType, rewardAmount });
      res.json({ ok: true, task });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.delete('/admin/api/tasks/:taskId', requireAdmin, async (req, res) => {
    try {
      await SpecialTask.deleteOne({ taskId: req.params.taskId });
      await logAdminAction(req.admin.login, 'delete_task', req.params.taskId, {});
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.patch('/admin/api/tasks/:taskId/toggle', requireAdmin, async (req, res) => {
    try {
      const task = await SpecialTask.findOne({ taskId: req.params.taskId });
      if (!task) return res.status(404).json({ ok: false, error: 'not_found' });
      task.active = !task.active;
      await task.save();
      res.json({ ok: true, active: task.active });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Конкретный пользователь ──
  app.get('/admin/api/user/:tgId', requireAdmin, async (req, res) => {
    try {
      const user = await Save.findOne({ tgId: req.params.tgId }).lean();
      if (!user) return res.status(404).json({ ok: false, error: 'user_not_found' });
      res.json({
        ok: true,
        user: {
          tgId: user.tgId, username: user.username, firstName: user.firstName,
          charId: user.charId, level: user.level, cp: user.cp, floor: user.floor,
          updatedAt: user.updatedAt, refBy: user.refBy,
          refMilestones: user.refMilestones, data: user.data || {}
        }
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/admin/api/user/:tgId/update', requireAdmin, async (req, res) => {
    try {
      const { tgId } = req.params;
      const updates  = req.body;
      const updateData = {};

      if (updates.gold   !== undefined) updateData['data.gold']  = updates.gold;
      if (updates.pixr   !== undefined) updateData['data.pixr']  = updates.pixr;
      if (updates.gram   !== undefined) updateData['data.gram']  = updates.gram;
      if (updates.level  !== undefined) { updateData.level = updates.level; updateData['data.level'] = updates.level; }
      if (updates.floor  !== undefined) { updateData.floor = updates.floor; updateData['data.floor'] = updates.floor; }
      if (updates.charId !== undefined) { updateData.charId = updates.charId; updateData['data.charId'] = updates.charId; }
      const adminTs = Date.now();
      updateData.updatedAt = adminTs;
      updateData['data.updatedAt'] = adminTs;
      updateData['data._adminUpdatedAt'] = adminTs;

      const result = await Save.findOneAndUpdate({ tgId }, { $set: updateData }, { new: true });
      if (!result) return res.status(404).json({ ok: false, error: 'user_not_found' });

      await logAdminAction(req.admin.login, 'update_user', tgId, updates);
      notifyClient(tgId, 'reload', { reason: 'user_updated' });

      res.json({
        ok: true,
        user: { tgId: result.tgId, username: result.username, firstName: result.firstName,
                charId: result.charId, level: result.level, cp: result.cp,
                floor: result.floor, data: result.data }
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/admin/api/user/:tgId/referrals', requireAdmin, async (req, res) => {
    try {
      const referrals = await Save.find({ refBy: req.params.tgId })
        .select('tgId username firstName level cp floor charId data.gold data.pixr')
        .lean();
      res.json({
        ok: true,
        referrals: referrals.map(r => ({
          tgId: r.tgId, username: r.username || r.firstName || 'Игрок',
          level: r.level || 1, cp: r.cp || 0, floor: r.floor || 1,
          charId: r.charId, gold: r.data?.gold || 0, pixr: r.data?.pixr || 0
        }))
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Выдача предмета ──
  app.post('/admin/api/user/:tgId/give-item', requireAdmin, async (req, res) => {
    try {
      const { tgId } = req.params;
      const { slot, name, rarity, level, stats, icon, forClass } = req.body;
      if (!slot || !name || !rarity) return res.status(400).json({ ok: false, error: 'missing_fields' });

      const item = {
        id: Date.now() + Math.floor(Math.random() * 1000000),
        slot, name,
        icon:     icon     || 'images/ac.png',
        rarity,
        level:    level    || 1,
        stats:    stats    || {},
        _equipped: false
      };
      if (forClass) item.forClass = forClass;

      const result = await Save.findOneAndUpdate(
        { tgId },
        { $push: { 'data.inventory': item }, $set: { updatedAt: Date.now() } },
        { new: true }
      );
      if (!result) return res.status(404).json({ ok: false, error: 'user_not_found' });

      await logAdminAction(req.admin.login, 'give_item', tgId, { item });
      notifyClient(tgId, 'reload', { reason: 'item_given' });
      res.json({ ok: true, item });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Сброс прогресса пользователя ──
  app.post('/admin/api/user/:tgId/reset', requireAdmin, async (req, res) => {
    try {
      const { tgId } = req.params;
      const user = await Save.findOne({ tgId }).lean();
      if (!user) return res.status(404).json({ ok: false, error: 'user_not_found' });

      const clearedMilestones = {};
      Object.keys(user.refMilestones || {}).forEach(k => { clearedMilestones[k] = 0; });

      const resetNow = Date.now();
      await Save.updateOne({ tgId }, {
        $set: {
          charId: null, level: 1, cp: 0, floor: 1,
          updatedAt: resetNow, refMilestones: clearedMilestones, refClaimVer: 0,
          data: {
            tgId, charId: null, refBy: user.refBy || null,
            updatedAt: resetNow, _adminUpdatedAt: resetNow, _resetAt: resetNow,
          }
        }
      });

      await logAdminAction(req.admin.login, 'reset_progress', tgId, {
        preserved: ['refBy'], cleared: ['refMilestones_values', 'refClaimVer']
      });
      notifyClient(tgId, 'force_close', { reason: 'progress_reset' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Массовый сброс ──
  app.post('/admin/api/reset-all', requireAdmin, async (req, res) => {
    try {
      if (req.body.confirm !== 'RESET_ALL')
        return res.status(400).json({ ok: false, error: 'confirmation_required' });

      const users = await Save.find({}, 'tgId refBy refMilestones').lean();
      let processed = 0;
      for (const user of users) {
        const clearedMilestones = {};
        Object.keys(user.refMilestones || {}).forEach(k => { clearedMilestones[k] = 0; });
        const resetNow = Date.now();
        await Save.updateOne({ tgId: user.tgId }, {
          $set: {
            charId: null, level: 1, cp: 0, floor: 1,
            updatedAt: resetNow, refMilestones: clearedMilestones, refClaimVer: 0,
            data: {
              tgId: user.tgId, charId: null, refBy: user.refBy || null,
              updatedAt: resetNow, _adminUpdatedAt: resetNow, _resetAt: resetNow,
            }
          }
        });
        notifyClient(user.tgId, 'force_close', { reason: 'progress_reset' });
        processed++;
      }

      await logAdminAction(req.admin.login, 'reset_all_progress', 'ALL', { count: processed });
      res.json({ ok: true, count: processed });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Подтверждение транзакции ──
  app.post('/admin/api/transaction/:txId/:action', requireAdmin, async (req, res) => {
    try {
      const { txId, action } = req.params;
      if (!['approve', 'reject'].includes(action))
        return res.status(400).json({ ok: false, error: 'invalid_action' });

      const tx = await Transaction.findOneAndUpdate(
        { id: txId, status: 'pending' },
        { $set: { status: action === 'approve' ? 'approved' : 'rejected',
                  [action === 'approve' ? 'approvedAt' : 'rejectedAt']: Date.now() } },
        { new: false }
      );
      if (!tx) {
        const existing = await Transaction.findOne({ id: txId }).lean();
        if (!existing) return res.status(404).json({ ok: false, error: 'transaction_not_found' });
        return res.status(400).json({ ok: false, error: 'transaction_already_processed' });
      }

      if (action === 'approve') {
        const gramDelta    = tx.type === 'deposit' ? tx.amount : -tx.amount;
        const newUpdatedAt = Date.now();
        const result = await Save.findOneAndUpdate(
          { tgId: tx.userId },
          { $inc: { 'data.gram': gramDelta }, $set: { 'data.updatedAt': newUpdatedAt, updatedAt: newUpdatedAt } },
          { new: true }
        );
        notifyClient(tx.userId, 'reload', { reason: 'balance_updated', gram: result?.data?.gram || 0 });

        // Реферальный бонус 5% от депозита
        if (tx.type === 'deposit' && tx.amount > 0) {
          try {
            const depositor = await Save.findOne({ tgId: tx.userId }, 'refBy firstName username').lean();
            if (depositor && depositor.refBy) {
              const bonus = Math.round(tx.amount * REF_DEPOSIT_BONUS * 1000) / 1000;
              if (bonus > 0) {
                const refTs = Date.now();
                const refResult = await Save.findOneAndUpdate(
                  { tgId: depositor.refBy },
                  { $inc: { 'data.gram': bonus }, $set: { 'data.updatedAt': refTs, updatedAt: refTs } },
                  { new: true }
                );
                notifyClient(depositor.refBy, 'reload', { reason: 'ref_bonus', gram: refResult?.data?.gram || 0 });
                const bot = getBot();
                if (bot) {
                  const name = depositor.firstName || depositor.username || tx.userId;
                  try {
                    await bot.sendMessage(depositor.refBy,
                      `🎁 *Реферальный бонус!*\n\nВаш друг *${name}* пополнил баланс на *${tx.amount} GRAM*\nВы получили *+${bonus} GRAM* (5%) на счёт!`,
                      { parse_mode: 'Markdown' }
                    );
                  } catch (e) {}
                }
              }
            }
          } catch (e) { console.error('❌ [admin] реф. бонус:', e.message); }
        }
      }

      await logAdminAction(req.admin.login, action + '_transaction', tx.userId, { txId, amount: tx.amount });

      const bot = getBot();
      if (bot) {
        const statusText = action === 'approve' ? '✅ Подтверждена' : '❌ Отклонена';
        const msg = `💰 **Транзакция ${statusText}**\n\n**Тип:** ${tx.type === 'deposit' ? 'Пополнение' : 'Вывод'}\n**Сумма:** ${tx.amount} GRAM\n${action === 'approve' ? '✅ Баланс обновлен!' : '❌ Средства не были зачислены.'}\n\n🔄 *Для обновления баланса перезапустите игру.*`;
        try { await bot.sendMessage(tx.userId, msg, { parse_mode: 'Markdown' }); } catch (e) {}
      }

      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Список предметов ──
  app.get('/admin/api/items/list', requireAdmin, (req, res) => {
    const ITEM_TYPES = [
      { slot: 'body',   name: 'Нагрудник', stats: ['def', 'hp'],    primary: 'def' },
      { slot: 'legs',   name: 'Штаны',     stats: ['def', 'dodge'], primary: 'def' },
      { slot: 'gloves', name: 'Перчатки',  stats: ['atk', 'def'],   primary: 'atk' },
      { slot: 'boots',  name: 'Боты',      stats: ['spd', 'dodge'], primary: 'spd' },
      { slot: 'helmet', name: 'Шлем',      stats: ['def', 'hp'],    primary: 'def' },
      { slot: 'ring',   name: 'Кольцо',    stats: ['atk', 'spd'],   primary: 'atk' },
      { slot: 'belt',   name: 'Пояс',      stats: ['hp', 'def'],    primary: 'hp'  },
    ];
    const STAFF_TYPES = [
      { slot: 'weapon', name: 'Посох огня',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'fire',  classLabel: 'Пирокан' },
      { slot: 'weapon', name: 'Посох света', stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'light', classLabel: 'Люмос'   },
      { slot: 'weapon', name: 'Посох воды',  stats: ['atk', 'crit', 'critDmg'], primary: 'atk', forClass: 'water', classLabel: 'Аквас'   },
    ];
    res.json({ ok: true, items: [...ITEM_TYPES, ...STAFF_TYPES] });
  });

  // ── Статистика ──
  app.get('/admin/api/stats', requireAdmin, async (req, res) => {
    try {
      const now = Date.now();
      const [totalUsers, usersWithChar, floors, active24h, topCP, online] = await Promise.all([
        Save.countDocuments(),
        Save.countDocuments({ charId: { $ne: null } }),
        Save.aggregate([{ $group: { _id: '$floor', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
        Save.countDocuments({ updatedAt: { $gt: now - 24 * 60 * 60 * 1000 } }),
        Save.find({ charId: { $ne: null } }).sort({ cp: -1 }).limit(10).select('username firstName level cp charId').lean(),
        Save.countDocuments({ updatedAt: { $gt: now - 5 * 60 * 1000 } }),
      ]);
      res.json({ ok: true, stats: { totalUsers, usersWithChar, active24h, floors, topCP, online } });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Рейтинг по времени ──
  app.get('/admin/api/playtime', requireAdmin, async (req, res) => {
    try {
      const limit     = Math.min(parseInt(req.query.limit) || 50, 200);
      const sortField = req.query.sort === 'today' ? 'todaySeconds' : req.query.sort === 'sessions' ? 'sessions' : 'totalSeconds';
      const [top, agg] = await Promise.all([
        PlaytimeRating.find().sort({ [sortField]: -1 }).limit(limit).lean(),
        PlaytimeRating.aggregate([{ $group: { _id: null, total: { $sum: '$totalSeconds' } } }]),
      ]);
      res.json({
        ok: true,
        grandTotal: (agg[0] && agg[0].total) || 0,
        players: top.map((p, i) => ({
          rank: i + 1, tgId: p.tgId, name: p.firstName || p.username || 'Игрок',
          username: p.username || '', charId: p.charId, level: p.level || 1,
          totalSeconds: p.totalSeconds || 0, todaySeconds: p.todaySeconds || 0,
          sessions: p.sessions || 0, lastSeenAt: p.lastSeenAt || 0,
        })),
      });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Логи ──
  app.get('/admin/api/logs', requireAdmin, async (req, res) => {
    try {
      res.json({ ok: true, logs: await AdminLog.find().sort({ timestamp: -1 }).limit(100).lean() });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Рассылка ──
  app.post('/admin/api/broadcast', requireAdmin, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || message.length < 1) return res.status(400).json({ ok: false, error: 'empty_message' });
      await logAdminAction(req.admin.login, 'broadcast', 'all', { message: message.substring(0, 100) });
      let sent = 0;
      const bot = getBot();
      if (bot) {
        const users = await Save.find({ charId: { $ne: null } }).select('tgId').lean();
        for (const user of users) {
          try { await bot.sendMessage(user.tgId, message); sent++; } catch (e) {}
        }
      }
      res.json({ ok: true, sent });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── Auth ──
  app.post('/admin/login', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (checkLoginRateLimit(ip)) {
      return res.status(429).json({ ok: false, error: 'too_many_attempts' });
    }
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ ok: false, error: 'missing_credentials' });
    const admin = ADMIN_CREDENTIALS[login];
    if (!admin || admin.password !== password) return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    const sessionId = createSession(login, admin.role);
    res.json({ ok: true, session: sessionId, role: admin.role, login });
  });

  app.get('/admin/check', (req, res) => {
    const session = getSession(req.headers['x-admin-session'] || req.query.session);
    if (!session) return res.json({ ok: false, error: 'unauthorized' });
    res.json({ ok: true, role: session.role, login: session.login });
  });

  app.post('/admin/logout', (req, res) => {
    const sessionId = req.headers['x-admin-session'] || req.body.session;
    if (sessionId) adminSessions.delete(sessionId);
    res.json({ ok: true });
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
  });
}

module.exports = { registerAdminRoutes };
