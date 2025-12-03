import { Response } from "express";

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
  statusCode: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: Record<string, any>;
  };
  timestamp: string;
}

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RESOURCE_ALREADY_EXISTS: "RESOURCE_ALREADY_EXISTS",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  BAD_REQUEST: "BAD_REQUEST",
  CSRF_MISSING: "CSRF_MISSING",
  CSRF_MISMATCH: "CSRF_MISMATCH",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  message: string,
  code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
  details?: Record<string, any>
): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      message,
      code,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
}

export function sendValidationError(res: Response, message: string, details?: Record<string, any>): void {
  sendErrorResponse(res, 400, message, ErrorCodes.VALIDATION_ERROR, details);
}

export function sendAuthenticationError(res: Response, message = "Authentication required"): void {
  sendErrorResponse(res, 401, message, ErrorCodes.AUTHENTICATION_REQUIRED);
}

export function sendAuthorizationError(res: Response, message = "Access denied"): void {
  sendErrorResponse(res, 403, message, ErrorCodes.AUTHORIZATION_FAILED);
}

export function sendNotFoundError(res: Response, resource = "Resource"): void {
  sendErrorResponse(res, 404, `${resource} not found`, ErrorCodes.RESOURCE_NOT_FOUND);
}

export function sendConflictError(res: Response, message: string): void {
  sendErrorResponse(res, 409, message, ErrorCodes.RESOURCE_ALREADY_EXISTS);
}

export function sendRateLimitError(res: Response, message = "Too many requests"): void {
  sendErrorResponse(res, 429, message, ErrorCodes.RATE_LIMIT_EXCEEDED);
}

export function sendPaymentRequiredError(res: Response, message = "Payment required"): void {
  sendErrorResponse(res, 402, message, ErrorCodes.PAYMENT_REQUIRED);
}

export function sendQuotaExceededError(res: Response, message: string): void {
  sendErrorResponse(res, 403, message, ErrorCodes.QUOTA_EXCEEDED);
}

export function sendInternalError(res: Response, message = "Internal server error"): void {
  sendErrorResponse(res, 500, message, ErrorCodes.INTERNAL_ERROR);
}

export function sendServiceUnavailableError(res: Response, message = "Service temporarily unavailable"): void {
  sendErrorResponse(res, 503, message, ErrorCodes.SERVICE_UNAVAILABLE);
}
