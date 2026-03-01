import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AuthenticatedUser } from '../types';

interface JwtPayload {
  sub: string;
  role: 'doctor' | 'patient' | 'admin' | 'system';
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * JWT authentication middleware.
 * Validates the Bearer token from the Authorization header and attaches
 * the decoded user to req.user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authorization header is required',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: 'Authorization header must use Bearer scheme',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as JwtPayload;

    const user: AuthenticatedUser = {
      userId: decoded.sub,
      role: decoded.role,
      permissions: decoded.permissions || [],
    };

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token has expired',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication error',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Authorization middleware factory.
 * Checks that the authenticated user has at least one of the required roles.
 */
export function authorize(...allowedRoles: AuthenticatedUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Permission check middleware factory.
 * Checks that the authenticated user has the specified permission.
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.user.role === 'admin') {
      // Admins bypass permission checks
      next();
      return;
    }

    if (!req.user.permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: `Missing required permission: ${permission}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware.
 * Attaches user if a valid token is present, but does not fail if absent.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(parts[1], config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as JwtPayload;

    req.user = {
      userId: decoded.sub,
      role: decoded.role,
      permissions: decoded.permissions || [],
    };
  } catch {
    // Token invalid, proceed without user context
  }

  next();
}
