import { TelegramUser } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: TelegramUser;
      startTime?: number;
    }
  }
}
