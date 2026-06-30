import { Transaction } from '../db/schemas/index';
import { ITransaction } from '../types/index';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

/**
 * Create transaction
 */
export async function createTransaction(
  userId: string,
  username: string,
  type: 'deposit' | 'withdraw',
  amount: number,
  wallet: string,
): Promise<any> {
  try {
    const txId = `tx_${Date.now()}_${uuid().substring(0, 8)}`;
    const memo = `${userId}_${Date.now().toString(36)}`;

    const tx = await Transaction.create({
      id: txId,
      userId,
      username,
      type,
      amount,
      status: 'pending',
      wallet,
      memo,
      createdAt: Date.now(),
    });

    logger.info('[TransactionService] Transaction created', {
      txId,
      userId,
      type,
      amount,
    });

    return tx.toObject();
  } catch (err) {
    logger.error('[TransactionService] Error creating transaction', { error: err });
    throw err;
  }
}

/**
 * Get user transactions
 */
export async function getUserTransactions(userId: string, limit = 50): Promise<any[]> {
  try {
    return await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch (err) {
    logger.error('[TransactionService] Error fetching transactions', { error: err });
    throw err;
  }
}

/**
 * Get transaction by ID
 */
export async function getTransaction(txId: string): Promise<any | null> {
  try {
    return await Transaction.findOne({ id: txId }).lean();
  } catch (err) {
    logger.error('[TransactionService] Error fetching transaction', { error: err });
    throw err;
  }
}

/**
 * Approve transaction
 */
export async function approveTransaction(txId: string): Promise<any | null> {
  try {
    const now = Date.now();
    const updated = await Transaction.findOneAndUpdate(
      { id: txId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          approvedAt: now,
        },
      },
      { new: true },
    ).lean();

    if (updated) {
      logger.info('[TransactionService] Transaction approved', { txId });
    }

    return updated;
  } catch (err) {
    logger.error('[TransactionService] Error approving transaction', { error: err });
    throw err;
  }
}

/**
 * Reject transaction
 */
export async function rejectTransaction(txId: string, reason: string): Promise<any | null> {
  try {
    const now = Date.now();
    const updated = await Transaction.findOneAndUpdate(
      { id: txId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          rejectedAt: now,
          adminNote: reason,
        },
      },
      { new: true },
    ).lean();

    if (updated) {
      logger.info('[TransactionService] Transaction rejected', { txId, reason });
    }

    return updated;
  } catch (err) {
    logger.error('[TransactionService] Error rejecting transaction', { error: err });
    throw err;
  }
}
