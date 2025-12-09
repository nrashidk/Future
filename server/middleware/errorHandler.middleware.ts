import { Request, Response, NextFunction } from "express";

/**
 * Custom application error class
 * Use this for operational errors that should be sent to the client
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common HTTP error factories
 */
export const HttpErrors = {
  badRequest: (message: string) => new AppError(message, 400),
  unauthorized: (message: string = "Unauthorized") => new AppError(message, 401),
  forbidden: (message: string = "Forbidden") => new AppError(message, 403),
  notFound: (message: string = "Resource not found") => new AppError(message, 404),
  conflict: (message: string) => new AppError(message, 409),
  tooManyRequests: (message: string = "Too many requests") => new AppError(message, 429),
  internal: (message: string = "Internal server error") => new AppError(message, 500, false),
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Use this to wrap async route handlers to avoid try-catch boilerplate
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handling middleware
 * Must be registered LAST in the middleware chain
 */
export function globalErrorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log all errors for debugging
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction || !(err instanceof AppError) || !err.isOperational) {
    console.error('[Error]', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      userId: (req as any).user?.userId,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: (err as any).errors,
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired',
    });
  }

  // Default to 500 Internal Server Error for unknown errors
  // Don't leak internal error details in production
  return res.status(500).json({
    message: isProduction ? 'Internal server error' : err.message,
  });
}

/**
 * 404 Not Found handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    message: `Route ${req.method} ${req.url} not found`,
  });
}
