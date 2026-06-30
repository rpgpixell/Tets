import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Загружаем .env файл
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════
// ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════════

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
};

const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ? parseInt(value, 10) : (defaultValue || 0);
};

const getEnvBool = (key: string, defaultValue = false): boolean => {
  const value = process.env[key];
  return value === '1' || value === 'true' || defaultValue;
};

// ═══════════════════════════════════════════════════════
// CONFIG OBJECT
// ═══════════════════════════════════════════════════════

export const config = {
  // Environment
  env: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3000),
  isDev: getEnv('NODE_ENV', 'development') === 'development',
  isProd: getEnv('NODE_ENV', 'development') === 'production',

  // Database
  mongodb: {
    uri: getEnv('MONGODB_URI'),
    poolSize: getEnvNumber('MONGODB_POOL_SIZE', 50),
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 15000,
    maxIdleTimeMS: 10000,
  },

  // Telegram
  telegram: {
    botToken: getEnv('BOT_TOKEN'),
    botUsername: getEnv('BOT_USERNAME'),
    adminTgId: getEnv('ADMIN_TG_ID'),
  },

  // Security
  security: {
    allowInsecure: getEnvBool('ALLOW_INSECURE'),
    apiSecretKey: getEnv('API_SECRET_KEY', 'default-secret-key'),
    jwtSecret: getEnv('JWT_SECRET', 'default-jwt-secret'),
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  },

  // Features
  features: {
    maxPlayersPerFloor: getEnvNumber('MAX_PLAYERS_PER_FLOOR', 100),
    bossCooldownHours: getEnvNumber('BOSS_COOLDOWN_HOURS', 24),
    marketListingTtlHours: getEnvNumber('MARKET_LISTING_TTL_HOURS', 48),
  },

  // Logging
  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    sentryDsn: process.env.SENTRY_DSN,
  },
};

// Validate config
if (!config.mongodb.uri) {
  throw new Error('MONGODB_URI is not configured');
}

if (!config.telegram.botToken) {
  throw new Error('BOT_TOKEN is not configured');
}

export default config;
