import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../types';

// ─── Custom Application Error ───────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', true, details);
  }

  static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED', true);
  }

  static forbidden(message: string = 'Insufficient permissions'): AppError {
    return new AppError(message, 403, 'FORBIDDEN', true);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND', true);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT', true);
  }

  static tooManyRequests(message: string = 'Rate limit exceeded'): AppError {
    return new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', true);
  }

  static serviceUnavailable(service: string): AppError {
    return new AppError(
      `Service unavailable: ${service}`,
      503,
      'SERVICE_UNAVAILABLE',
      true,
    );
  }

  static gatewayTimeout(service: string): AppError {
    return new AppError(
      `Upstream service timeout: ${service}`,
      504,
      'GATEWAY_TIMEOUT',
      true,
    );
  }
}

// ─── Async Handler Wrapper ──────────────────────────────────────────────────

/**
 * Wraps an async route handler so rejected promises are forwarded to
 * Express error-handling middleware automatically.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Global Error Handler ───────────────────────────────────────────────────

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const errorId = uuidv4();

  // Determine status and response shape
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // JSON parse error
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired authentication token';
  }

  // Log the error (full stack for 5xx, message-only for 4xx)
  if (statusCode >= 500) {
    console.error(`[ERROR ${errorId}]`, {
      statusCode,
      code,
      message: err.message,
      stack: err.stack,
    });
  } else {
    console.warn(`[WARN ${errorId}]`, {
      statusCode,
      code,
      message: err.message,
    });
  }

  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV !== 'production' && details ? { details } : {}),
    },
    meta: {
      requestId: errorId,
    },
  };

  res.status(statusCode).json(body);
}

// ─── 404 Handler ────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.path}`));
}
