/**
 * Error classes and global Express error handler.
 * Provides structured error responses with appropriate HTTP status codes.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiResponse } from '../types';

// ─── Custom Error Classes ────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(serviceName: string) {
    super(
      `Downstream service '${serviceName}' is unavailable`,
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
}

export class ClinicalDataError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'CLINICAL_DATA_ERROR', true, details);
  }
}

// ─── Global Error Handler Middleware ─────────────────────────────────────────

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 internal server error
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;

    if (!err.isOperational) {
      console.error('[ERROR] Non-operational error:', err);
    }
  } else {
    // Unexpected errors - log full stack trace
    console.error('[ERROR] Unhandled error:', err);
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details: config.isDev ? details ?? err.stack : details,
    },
  };

  res.status(statusCode).json(response);
}

// ─── Async Route Wrapper ─────────────────────────────────────────────────────

/**
 * Wraps an async route handler to catch errors and forward them to
 * the global error handler via next().
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
