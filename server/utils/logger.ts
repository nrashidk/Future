/**
 * Structured logging utility
 * Provides consistent log formatting with context
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  action?: string;
  resource?: string;
  requestId?: string;
  duration?: number;
  [key: string]: any;
}

const isProduction = process.env.NODE_ENV === 'production';

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Logger with structured context support
 */
export const logger = {
  debug(message: string, context?: LogContext) {
    if (!isProduction) {
      console.debug(formatMessage('debug', message, context));
    }
  },

  info(message: string, context?: LogContext) {
    console.log(formatMessage('info', message, context));
  },

  warn(message: string, context?: LogContext) {
    console.warn(formatMessage('warn', message, context));
  },

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      ...(error instanceof Error ? {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      } : { error: String(error) }),
    };
    console.error(formatMessage('error', message, errorContext));
  },

  /**
   * Log an HTTP request with timing
   */
  request(method: string, url: string, statusCode: number, durationMs: number, context?: LogContext) {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this[level](`${method} ${url} ${statusCode}`, { ...context, duration: durationMs });
  },

  /**
   * Log database operations
   */
  db(operation: string, table: string, context?: LogContext) {
    this.debug(`DB: ${operation} on ${table}`, context);
  },

  /**
   * Log security events
   */
  security(event: string, context?: LogContext) {
    this.warn(`SECURITY: ${event}`, context);
  },

  /**
   * Log authentication events
   */
  auth(event: string, userId?: string, context?: LogContext) {
    this.info(`AUTH: ${event}`, { userId, ...context });
  },
};

export default logger;
