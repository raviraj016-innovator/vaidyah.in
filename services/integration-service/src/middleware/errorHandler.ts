import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ServiceResponse } from '../types';

/**
 * Custom application error with HTTP status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class ExternalServiceError extends AppError {
  public readonly serviceName: string;

  constructor(serviceName: string, message: string, statusCode: number = 502) {
    super(`${serviceName}: ${message}`, statusCode, true);
    this.serviceName = serviceName;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded. Please try again later.', 429);
    this.retryAfter = retryAfter;
  }
}

/**
 * Format Zod validation errors into a human-readable structure.
 */
function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  return formatted;
}

/**
 * Global error handling middleware.
 * Must be registered after all routes.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  if (err instanceof AppError && err.isOperational) {
    console.error(`[ERROR] ${err.statusCode} - ${err.message}`);
  } else {
    console.error('[ERROR] Unhandled error:', (err as Error).message);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ServiceResponse = {
      success: false,
      error: 'Validation failed',
      data: formatZodError(err),
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
    return;
  }

  // Handle known application errors
  if (err instanceof AppError) {
    const response: ServiceResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };

    if (err instanceof RateLimitError) {
      res.setHeader('Retry-After', err.retryAfter.toString());
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    const response: ServiceResponse = {
      success: false,
      error: 'Invalid JSON in request body',
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
    return;
  }

  // Generic unhandled error
  const response: ServiceResponse = {
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  };

  res.status(500).json(response);
}

/**
 * 404 handler for unknown routes.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  const response: ServiceResponse = {
    success: false,
    error: 'Not found',
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(response);
}
