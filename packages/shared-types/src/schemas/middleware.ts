import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware factory that validates request.body against a Zod schema.
 * Returns 400 with validation errors on failure.
 */
export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }
  return errors;
}
