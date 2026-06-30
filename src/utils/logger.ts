import { config } from '../config/index';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LogLevelMap: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LogLevelMap[config.logging.level as LogLevel] || LogLevelMap.info;

const colors = {
  reset: '\x1b[0m',
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, data?: any): void {
  if (LogLevelMap[level] < currentLevel) return;

  const timestamp = formatTimestamp();
  const color = colors[level as keyof typeof colors];
  const prefix = `${color}[${level.toUpperCase()}]${colors.reset} ${timestamp}`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (message: string, data?: any) => log('debug', message, data),
  info: (message: string, data?: any) => log('info', message, data),
  warn: (message: string, data?: any) => log('warn', message, data),
  error: (message: string, data?: any) => log('error', message, data),
};

export default logger;
