import { Router, Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { authMiddleware } from '../middleware/auth';
import { perUserLimiter } from '../middleware/security';
import { createTransaction, getUserTransactions } from '../services/TransactionService';
import { validateWalletMiddleware, validateAmountMiddleware } from '../middleware/validation';
import { validateWallet, validateAmount } from '../utils/validation';
import { config } from '../config/index';

const router = Router();

/**
 * POST /api/wallet/deposit
 * Create deposit transaction
 */
router.post(
  '/deposit',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { amount, wallet } = req.body;

    // Validate
    if (!validateAmount(amount, config.features.bossCooldownHours, 10000)) {
      throw new AppError(400, 'Invalid amount', 'INVALID_AMOUNT');
    }

    if (!validateWallet(wallet)) {
      throw new AppError(400, 'Invalid wallet address', 'INVALID_WALLET');
    }

    // Create transaction
    const tx = await createTransaction(tgId, req.user!.username || '', 'deposit', amount, wallet);

    res.json({
      ok: true,
      transaction: {
        id: tx.id,
        status: tx.status,
        amount: tx.amount,
        createdAt: tx.createdAt,
      },
    });
  }),
);

/**
 * POST /api/wallet/withdraw
 * Create withdraw transaction
 */
router.post(
  '/withdraw',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const { amount, wallet } = req.body;

    // Validate
    if (!validateAmount(amount, 1, 10000)) {
      throw new AppError(400, 'Invalid amount', 'INVALID_AMOUNT');
    }

    if (!validateWallet(wallet)) {
      throw new AppError(400, 'Invalid wallet address', 'INVALID_WALLET');
    }

    // Create transaction
    const tx = await createTransaction(tgId, req.user!.username || '', 'withdraw', amount, wallet);

    res.json({
      ok: true,
      transaction: {
        id: tx.id,
        status: tx.status,
        amount: tx.amount,
        createdAt: tx.createdAt,
      },
    });
  }),
);

/**
 * GET /api/wallet/transactions
 * Get user's transactions
 */
router.get(
  '/transactions',
  authMiddleware,
  perUserLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const tgId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const transactions = await getUserTransactions(tgId, limit);

    res.json({
      ok: true,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        createdAt: tx.createdAt,
        approvedAt: tx.approvedAt,
      })),
    });
  }),
);

/**
 * GET /api/wallet/info
 * Get wallet info
 */
router.get(
  '/info',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      ok: true,
      wallet: {
        address: config.WALLET_ADDRESS,
        minDeposit: 1,
        maxDeposit: 10000,
      },
    });
  }),
);

export default router;
