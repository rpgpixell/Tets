import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

/**
 * Global rate limiter (all requests)
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/' || req.path === '/health';
  },
});

/**
 * API endpoint rate limiter (stricter)
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many API requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-user rate limiter (by Telegram ID)
 */
export const perUserLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Save/Delta rate limiter (even stricter)
 */
export const saveLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip || 'unknown',
  message: 'Save too frequently, please wait a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Login/Auth rate limiter (prevent brute force)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * Configure Helmet for security headers
 */
export function getHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: false, // Disable CSP for web app
    frameguard: { action: 'DENY' },
    xssFilter: true,
    noSniff: true,
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });
}

/**
 * CORS middleware with proper configuration
 */
export function getCorsMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (!origin) {
      next();
      return;
    }

    // Check if origin is allowed
    const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);

    if (isAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE,PATCH');
      res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Init-Data');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || 0);
    const userId = req.user?.id || 'anonymous';

    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      userId,
      ip: req.ip,
    });
  });

  next();
}

/**
 * Validate request body size
 */
export function validateBodySize(req: Request, res: Response, next: NextFunction): void {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 1 * 1024 * 1024; // 1MB

  if (contentLength > maxSize) {
    throw new AppError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  }

  next();
}
