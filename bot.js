/*
  ══════════════════════════════════════════════════════
  bot.js — Telegram Bot (webhook + handlers)
  Импортируется из server.js через initBot(app)
  ══════════════════════════════════════════════════════
*/

const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN   = process.env.BOT_TOKEN;
const WEBAPP_URL  = process.env.WEBAPP_URL  || 'https://your-domain.railway.app';
const API_URL     = process.env.API_URL     || 'https://tets-production-4fdc.up.railway.app/';
const BOT_USERNAME = process.env.BOT_USERNAME || 'YourBotUsername';

let bot = null;

// ── Получение профиля игрока ──
function getPlayerProfile(Save, userId) {
  return Save.findOne({ tgId: String(userId) }).lean()
    .then((doc) => {
      if (!doc) return { username: 'Новичок', level: 1, cp: 0, floor: 1, killCount: 0, gold: 0, pixr: 0, gram: 0 };
      const data = doc.data || {};
      return {
        username:  doc.firstName || doc.username || 'Игрок',
        level:     doc.level     || 1,
        cp:        doc.cp        || 0,
        floor:     doc.floor     || 1,
        killCount: data.killCount || 0,
        gold:      data.gold     || 0,
        pixr:      data.pixr     || 0,
        gram:      data.gram     || 0,
      };
    })
    .catch(() => ({ username: 'Ошибка', level: 0, cp: 0, floor: 0, killCount: 0, gold: 0, pixr: 0, gram: 0 }));
}

function initBot(app, { Save, Transaction, Save: SaveModel, notifyClient, logAdminAction, REF_DEPOSIT_BONUS, AdminLog }) {
  if (!BOT_TOKEN) {
    console.error('❌ [bot] BOT_TOKEN не задан!');
    return null;
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });

    const webhookUrl = (process.env.WEBHOOK_URL || API_URL) + '/webhook/' + BOT_TOKEN;
    bot.setWebHook(webhookUrl)
      .then(() => console.log('✅ [bot] Webhook установлен: ' + webhookUrl.replace(BOT_TOKEN, '<TOKEN>')))
      .catch((err) => console.error('❌ [bot] Ошибка установки webhook:', err.message));

    // ── Webhook маршрут ──
    app.post('/webhook/' + BOT_TOKEN, (req, res) => {
      try { bot.processUpdate(req.body); } catch (e) { console.error('❌ [bot] processUpdate error:', e.message); }
      res.sendStatus(200);
    });

    // ── /start ──
    bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
      try {
        const chatId     = msg.chat.id;
        const userId     = msg.from.id;
        const username   = msg.from.username || msg.from.first_name || 'Игрок';
        const startParam = (match && match[1]) ? match[1].trim() : null;

        const hour = new Date().getHours();
        let greeting = '☀️ Добрый день';
        if (hour < 12) greeting = '🌅 Доброе утро';
        else if (hour < 22) greeting = '🌇 Добрый вечер';
        else greeting = '🌙 Доброй ночи';

        let webappUrl = WEBAPP_URL;
        if (startParam) webappUrl += '?startapp=' + startParam;

        const message =
          greeting + ', *' + username + '*! 👋\n\n' +
          '🔥 **PIXEL RPG** — эпическая RPG!\n\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          '🎮 **В игре тебя ждут:**\n' +
          '  ✦ 10 этажей с монстрами\n' +
          '  ✦ 3 класса персонажей\n' +
          '  ✦ Улучшения и навыки\n' +
          '  ✦ Редкие предметы\n' +
          '  ✦ Боевой пропуск\n' +
          '  ✦ Реферальная система\n\n' +
          '━━━━━━━━━━━━━━━━━━━\n' +
          '👤 **Твой ID:** `' + userId + '`\n' +
          (startParam ? '🔗 **Пригласил:** `' + startParam + '`\n' : '') +
          '\nНажми на кнопку ниже, чтобы начать!';

        bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 ИГРАТЬ', web_app: { url: webappUrl } }],
              [
                { text: '👥 Пригласить друзей', callback_data: 'ref' },
                { text: '📊 Статистика',        callback_data: 'profile' }
              ]
            ]
          }
        });
      } catch (e) { console.error('❌ [bot] /start error:', e.message); }
    });

    // ── /help ──
    bot.onText(/\/help/, (msg) => {
      bot.sendMessage(msg.chat.id,
        '📖 **Команды:**\n\n' +
        '/start — Начать игру\n' +
        '/help — Справка\n' +
        '/ref — Реферальная ссылка\n' +
        '/profile — Мой профиль',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /ref ──
    bot.onText(/\/ref/, (msg) => {
      const refLink = 'https://t.me/' + BOT_USERNAME + '?start=' + msg.from.id;
      bot.sendMessage(msg.chat.id,
        '👥 **Твоя реферальная ссылка:**\n\n`' + refLink + '`',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /profile ──
    bot.onText(/\/profile/, (msg) => {
      getPlayerProfile(Save, msg.from.id).then((profile) => {
        bot.sendMessage(msg.chat.id,
          '📊 **Твой профиль:**\n\n' +
          '👤 Имя: '     + profile.username  + '\n' +
          '🎯 Уровень: ' + profile.level     + '\n' +
          '⚔️ CP: '      + profile.cp        + '\n' +
          '🏰 Этаж: '    + profile.floor     + '\n' +
          '👾 Убийств: ' + profile.killCount + '\n' +
          '🪙 Золото: '  + profile.gold      + '\n' +
          '💎 PIXR: '    + profile.pixr      + '\n' +
          '⭐ GRAM: '    + profile.gram,
          { parse_mode: 'Markdown' }
        );
      });
    });

    // ── Callback query ──
    bot.on('callback_query', (query) => {
      try {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const data   = query.data;

        bot.answerCallbackQuery(query.id).catch(() => {});

        if (data === 'ref') {
          const refLink = 'https://t.me/' + BOT_USERNAME + '?start=' + userId;
          bot.sendMessage(chatId, '👥 **Твоя реферальная ссылка:**\n\n`' + refLink + '`', { parse_mode: 'Markdown' });
          return;
        }

        if (data === 'profile') {
          getPlayerProfile(Save, userId).then((profile) => {
            bot.sendMessage(chatId,
              '📊 **Твой профиль:**\n\n' +
              '👤 Имя: '     + profile.username  + '\n' +
              '🎯 Уровень: ' + profile.level     + '\n' +
              '⚔️ CP: '      + profile.cp        + '\n' +
              '🏰 Этаж: '    + profile.floor     + '\n' +
              '👾 Убийств: ' + profile.killCount + '\n' +
              '🪙 Золото: '  + profile.gold      + '\n' +
              '💎 PIXR: '    + profile.pixr      + '\n' +
              '⭐ GRAM: '    + profile.gram,
              { parse_mode: 'Markdown' }
            );
          });
          return;
        }

        if (data.startsWith('approve_') || data.startsWith('reject_')) {
          const action = data.startsWith('approve_') ? 'approve' : 'reject';
          const txId   = data.replace(/^(approve|reject)_/, '');
          const msgId  = query.message.message_id;

          bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '⏳ Обработка...', callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: msgId }
          ).catch(() => {});

          const _fetch = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
          _fetch(API_URL + '/bot/transaction/' + txId + '/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-bot-secret': BOT_TOKEN },
            body: JSON.stringify({})
          })
          .then(r => r.json())
          .then((result) => {
            if (result.ok) {
              const doneText = action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено';
              bot.editMessageReplyMarkup(
                { inline_keyboard: [[{ text: doneText, callback_data: 'done_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(() => {});
              bot.answerCallbackQuery(query.id, { text: doneText }).catch(() => {});
            } else {
              const already = result.error === 'already_processed';
              bot.editMessageReplyMarkup(
                already
                  ? { inline_keyboard: [[{ text: '⚠️ Уже обработана', callback_data: 'done_' + txId }]] }
                  : { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(() => {});
              bot.answerCallbackQuery(query.id, {
                text: already ? '⚠️ Транзакция уже обработана' : '❌ Ошибка: ' + (result.error || 'unknown'),
                show_alert: true
              }).catch(() => {});
            }
          })
          .catch((err) => {
            console.error('❌ [bot] Ошибка обработки транзакции:', err.message);
            bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
              { chat_id: chatId, message_id: msgId }
            ).catch(() => {});
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка сервера' }).catch(() => {});
          });
          return;
        }

        if (data.startsWith('done_') || data === 'noop') {
          bot.answerCallbackQuery(query.id, { text: 'Транзакция уже обработана' }).catch(() => {});
        }
      } catch (e) { console.error('❌ [bot] callback_query error:', e.message); }
    });

    console.log('✅ [bot] Все обработчики зарегистрированы');
    return bot;

  } catch (e) {
    console.error('❌ [bot] Ошибка инициализации:', e.message);
    return null;
  }
}

function getBot() { return bot; }

module.exports = { initBot, getBot };
