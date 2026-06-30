import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index';
import { logger } from '../utils/logger';
import { getUserData, saveGameData, getOrCreateUser } from '../services/UserService';

class BotManager {
  private bot: TelegramBot;
  private adminId: string;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, {
      polling: true,
      polling: {
        interval: 1000,
        autoStart: true,
      },
    });
    this.adminId = config.telegram.adminTgId;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      try {
        const chatId = msg.chat.id;
        const userId = msg.from?.id?.toString() || '';

        await getOrCreateUser(
          userId,
          msg.from?.username || '',
          msg.from?.first_name || '',
        );

        const webAppUrl = `${process.env.WEBAPP_URL || 'https://example.com'}`;

        const keyboard = {
          inline_keyboard: [
            [
              {
                text: '🎮 Play Game',
                web_app: { url: webAppUrl },
              },
            ],
            [
              {
                text: '👥 Invite Friend',
                switch_inline_query: `https://t.me/${config.telegram.botUsername}?startapp=ref_${userId}`,
              },
            ],
          ],
        };

        await this.bot.sendMessage(
          chatId,
          `🎮 **Welcome to Pixel RPG!**\n\n` +
            `Click the button below to start playing.\n\n` +
            `📊 Join thousands of players and become a legend!`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          },
        );

        logger.info('[Bot] /start command', { userId });
      } catch (err) {
        logger.error('[Bot] Error in /start', { error: err });
      }
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      try {
        const chatId = msg.chat.id;

        await this.bot.sendMessage(
          chatId,
          `📖 **Available Commands:**\n\n` +
            `/start - Start playing\n` +
            `/stats - Your statistics\n` +
            `/top - Leaderboard\n` +
            `/profile - Your profile\n` +
            `/help - This message`,
          {
            parse_mode: 'Markdown',
          },
        );
      } catch (err) {
        logger.error('[Bot] Error in /help', { error: err });
      }
    });

    // Stats command
    this.bot.onText(/\/stats/, async (msg) => {
      try {
        const chatId = msg.chat.id;
        const userId = msg.from?.id?.toString() || '';

        const user = await getUserData(userId);

        if (!user?.data) {
          await this.bot.sendMessage(chatId, '❌ No game data found. Use /start first.');
          return;
        }

        const statsText =
          `📊 **Your Stats**\n\n` +
          `Level: ${user.data.level}\n` +
          `CP: ${user.data.cp}\n` +
          `HP: ${user.data.hp}/${user.data.maxHp}\n` +
          `Gold: ${user.data.gold}\n` +
          `Floor: ${user.data.floor}/10\n` +
          `Arena Rating: ${user.data.arenaRating || 0}`;

        await this.bot.sendMessage(chatId, statsText, {
          parse_mode: 'Markdown',
        });

        logger.info('[Bot] /stats command', { userId });
      } catch (err) {
        logger.error('[Bot] Error in /stats', { error: err });
      }
    });

    // Top command (leaderboard)
    this.bot.onText(/\/top/, async (msg) => {
      try {
        const chatId = msg.chat.id;

        const { getLeaderboard } = await import('../services/UserService');
        const top = await getLeaderboard(10);

        let text = `🏆 **Top 10 Players**\n\n`;
        top.forEach((player, idx) => {
          text += `${idx + 1}. ${player.firstName || player.username} - CP: ${player.cp}\n`;
        });

        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
        });
      } catch (err) {
        logger.error('[Bot] Error in /top', { error: err });
      }
    });

    // Admin: broadcast
    this.bot.onText(/\/broadcast (.+)/, async (msg, match) => {
      try {
        const chatId = msg.chat.id;
        const userId = msg.from?.id?.toString() || '';

        // Check admin
        if (userId !== this.adminId) {
          await this.bot.sendMessage(chatId, '❌ Admin only');
          return;
        }

        const message = match?.[1] || '';
        // In production: broadcast to all users
        logger.info('[Bot] Broadcast command', { message });
        await this.bot.sendMessage(chatId, '✅ Broadcast queued');
      } catch (err) {
        logger.error('[Bot] Error in /broadcast', { error: err });
      }
    });

    // Error handling
    this.bot.on('polling_error', (err) => {
      logger.error('[Bot] Polling error', { error: err });
    });
  }

  public getBot(): TelegramBot {
    return this.bot;
  }

  public async sendNotification(userId: string, text: string): Promise<void> {
    try {
      await this.bot.sendMessage(userId, text, {
        parse_mode: 'Markdown',
      });
    } catch (err) {
      logger.error('[Bot] Error sending notification', { error: err, userId });
    }
  }

  public async stop(): Promise<void> {
    this.bot.stopPolling();
    logger.info('[Bot] Stopped');
  }
}

let botManager: BotManager | null = null;

export function initBot(): BotManager {
  if (!botManager) {
    botManager = new BotManager();
    logger.info('[Bot] Initialized');
  }
  return botManager;
}

export function getBot(): BotManager | null {
  return botManager;
}

export default BotManager;
