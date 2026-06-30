import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/index';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const isDev = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    logger.error(`[${err.statusCode}] ${err.message}`, {
      code: err.code,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      ok: false,
      error: err.message,
      code: err.code,
      ...(isDev && { stack: err.stack }),
    } as ApiResponse);
  } else if (err instanceof SyntaxError) {
    logger.error('JSON Parse Error', { message: err.message });
    res.status(400).json({
      ok: false,
      error: 'Invalid JSON in request body',
    } as ApiResponse);
  } else {
    logger.error('Internal Server Error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      ok: false,
      error: 'Internal server error',
      ...(isDev && { message: err.message, stack: err.stack }),
    } as ApiResponse);
  }
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
