import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import {
  validateGameData,
  validateDelta,
  validateWallet,
  validateAmount,
  validateFloor,
  validateCharacterId,
  validateItemId,
  sanitizeInput,
} from '../utils/validation';

/**
 * Validate game data in request body
 */
export function validateGameDataMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const data = req.body?.data;

    if (!data) {
      throw new AppError(400, 'No game data provided', 'NO_DATA');
    }

    const result = validateGameData(data);

    if (!result.isValid()) {
      const firstError = result.getFirstError();
      throw new AppError(400, `Invalid game data: ${firstError?.message}`, 'INVALID_DATA');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Game data validation error', 'VALIDATION_ERROR');
  }
}

/**
 * Validate delta update
 */
export function validateDeltaMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const delta = req.body?.delta;

    if (!delta) {
      throw new AppError(400, 'No delta provided', 'NO_DELTA');
    }

    const result = validateDelta(delta);

    if (!result.isValid()) {
      const firstError = result.getFirstError();
      throw new AppError(400, `Invalid delta: ${firstError?.message}`, 'INVALID_DELTA');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Delta validation error', 'VALIDATION_ERROR');
  }
}

/**
 * Validate wallet address
 */
export function validateWalletMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const wallet = req.body?.wallet;

    if (!wallet) {
      throw new AppError(400, 'No wallet address provided', 'NO_WALLET');
    }

    if (!validateWallet(wallet)) {
      throw new AppError(400, 'Invalid wallet address format', 'INVALID_WALLET');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Wallet validation error', 'VALIDATION_ERROR');
  }
}

/**
 * Validate amount parameter
 */
export function validateAmountMiddleware(min = 1, max = Infinity) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const amount = req.body?.amount ?? req.query?.amount;

      if (amount === undefined) {
        throw new AppError(400, 'No amount provided', 'NO_AMOUNT');
      }

      if (!validateAmount(amount, min, max)) {
        throw new AppError(
          400,
          `Amount must be an integer between ${min} and ${max}`,
          'INVALID_AMOUNT',
        );
      }

      next();
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(400, 'Amount validation error', 'VALIDATION_ERROR');
    }
  };
}

/**
 * Validate floor parameter
 */
export function validateFloorMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const floor = req.body?.floor ?? req.query?.floor;

    if (floor !== undefined && !validateFloor(floor)) {
      throw new AppError(400, 'Floor must be between 1 and 10', 'INVALID_FLOOR');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Floor validation error', 'VALIDATION_ERROR');
  }
}

/**
 * Validate character ID
 */
export function validateCharacterIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const charId = req.body?.charId;

    if (!charId) {
      throw new AppError(400, 'No character ID provided', 'NO_CHAR_ID');
    }

    if (!validateCharacterId(charId)) {
      throw new AppError(400, 'Invalid character ID', 'INVALID_CHAR_ID');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Character ID validation error', 'VALIDATION_ERROR');
  }
}

/**
 * Validate item ID and price for market
 */
export function validateMarketItemMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const { itemId, price } = req.body || {};

    if (itemId === undefined || itemId === null) {
      throw new AppError(400, 'No item ID provided', 'NO_ITEM_ID');
    }

    if (!validateItemId(itemId)) {
      throw new AppError(400, 'Invalid item ID', 'INVALID_ITEM_ID');
    }

    if (!price) {
      throw new AppError(400, 'No price provided', 'NO_PRICE');
    }

    if (!validateAmount(price, 1, 1000000)) {
      throw new AppError(400, 'Price must be between 1 and 1000000', 'INVALID_PRICE');
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, 'Market item validation error', 'VALIDATION_ERROR');
  }
}
