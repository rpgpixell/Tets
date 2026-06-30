import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AppError } from './errorHandler';
import { config } from '../config/index';
import { logger } from '../utils/logger';
import { TelegramUser, AuthResult } from '../types/index';
import { validateTelegramId } from '../utils/validation';

/**
 * Verify Telegram Web App initData signature
 */
export function verifyTelegram(initData: string): AuthResult {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'No initData provided' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');

  if (!hash) {
    return { ok: false, error: 'No hash in initData' };
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // Skip verification in development if allowed
  if (config.security.allowInsecure) {
    logger.warn('[Auth] Running in insecure mode - signature verification skipped');
    let user = null;
    try {
      user = JSON.parse(params.get('user') || 'null');
    } catch (e) {
      return { ok: false, error: 'Invalid user JSON' };
    }

    if (!user || !user.id) {
      return { ok: false, error: 'No user ID' };
    }

    return {
      ok: true,
      user: {
        id: String(user.id),
        username: user.username || '',
        firstName: user.first_name || '',
      },
    };
  }

  // Production: Verify signature
  const botToken = config.telegram.botToken;
  if (!botToken) {
    return { ok: false, error: 'Bot token not configured' };
  }

  try {
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      logger.warn('[Auth] Hash mismatch - potential tampering attempt');
      return { ok: false, error: 'Hash verification failed' };
    }
  } catch (err) {
    logger.error('[Auth] Signature verification error', { error: err });
    return { ok: false, error: 'Signature verification error' };
  }

  // Check auth date (48 hours)
  try {
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 48 * 60 * 60; // 48 hours

    if (now - authDate > maxAge) {
      logger.warn('[Auth] Auth data too old', { authDate, now, age: now - authDate });
      return { ok: false, error: 'Auth data expired' };
    }
  } catch (err) {
    return { ok: false, error: 'Invalid auth date' };
  }

  // Parse user
  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch (e) {
    return { ok: false, error: 'Invalid user JSON' };
  }

  if (!user || !user.id) {
    return { ok: false, error: 'No user ID in auth data' };
  }

  if (!validateTelegramId(user.id)) {
    return { ok: false, error: 'Invalid Telegram ID' };
  }

  return {
    ok: true,
    user: {
      id: String(user.id),
      username: user.username || '',
      firstName: user.first_name || '',
    },
  };
}

/**
 * Middleware: Authenticate Telegram user
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const initData = req.body?.initData || req.headers['x-init-data'];

    if (!initData) {
      throw new AppError(401, 'No authentication data provided', 'NO_AUTH_DATA');
    }

    const result = verifyTelegram(initData as string);

    if (!result.ok || !result.user) {
      throw new AppError(401, result.error || 'Authentication failed', 'AUTH_FAILED');
    }

    req.user = result.user;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(401, 'Authentication error', 'AUTH_ERROR');
  }
}
