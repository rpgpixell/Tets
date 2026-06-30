import mongoose from 'mongoose';
import { config } from '../config/index';
import { logger } from '../utils/logger';

let isConnected = false;

/**
 * Connect to MongoDB
 */
export async function connectDB(): Promise<void> {
  if (isConnected) {
    logger.info('[DB] Already connected');
    return;
  }

  try {
    logger.info('[DB] Connecting to MongoDB...');

    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: config.mongodb.serverSelectionTimeoutMS,
      socketTimeoutMS: config.mongodb.socketTimeoutMS,
      maxPoolSize: config.mongodb.poolSize,
      minPoolSize: 10,
      maxIdleTimeMS: config.mongodb.maxIdleTimeMS,
    });

    isConnected = true;

    const dbName = mongoose.connection.db?.databaseName || 'unknown';
    logger.info('[DB] Connected successfully', {
      database: dbName,
      uri: config.mongodb.uri.replace(/:[^:]*@/, ':***@'),
    });
  } catch (err) {
    logger.error('[DB] Connection failed', { error: err });
    process.exit(1);
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('[DB] Disconnected');
  } catch (err) {
    logger.error('[DB] Disconnect error', { error: err });
  }
}

/**
 * Get connection status
 */
export function isDBConnected(): boolean {
  return isConnected;
}
