/**
 * JWT authentication middleware for the Integration service.
 * Validates tokens issued by AWS Cognito (RS256) in production.
 * In development with ALLOW_DEV_AUTH, accepts HS256 tokens.
 */

import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../config';
import { AuthenticatedUser } from '../types';
import { UnauthorizedError } from './errorHandler';

const VALID_ROLES: readonly string[] = ['patient', 'nurse', 'doctor', 'admin', 'system'];
function isValidRole(role: unknown): role is AuthenticatedUser['role'] {
  return typeof role === 'string' && VALID_ROLES.includes(role);
}

/** JWKS client for Cognito token verification (lazily initialized). */
let jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!jwksClient) {
    const issuer = `https://cognito-idp.${config.cognito.region}.amazonaws.com/${config.cognito.userPoolId}`;
    jwksClient = jwksRsa({
      jwksUri: `${issuer}/.well-known/jwks.json`,
      cache: true,
      cacheMaxAge: 600_000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return jwksClient;
}

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err: Error | null, key?: jwksRsa.SigningKey) => {
      if (err) {
        reject(new UnauthorizedError('Unable to retrieve signing key'));
        return;
      }
      if (!key) {
        reject(new UnauthorizedError('Signing key not found'));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}

function extractUser(payload: jwt.JwtPayload): AuthenticatedUser {
  if (!payload.sub) {
    throw new UnauthorizedError('Token missing required "sub" claim');
  }

  const role = (() => {
    const customRole = payload['custom:role'] as string;
    if (isValidRole(customRole)) return customRole;
    const directRole = payload.role as string;
    if (isValidRole(directRole)) return directRole;
    throw new UnauthorizedError('Token missing valid role claim');
  })();

  return {
    userId: payload.sub,
    role,
    permissions: payload.permissions || [],
  };
}

async function verifyToken(token: string): Promise<AuthenticatedUser> {
  const isProd = config.server.nodeEnv === 'production';

  if (isProd && config.cognito.userPoolId) {
    // Production: Verify against Cognito JWKS (RS256)
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedError('Invalid token format');
    }

    const signingKey = await getSigningKey(decoded.header.kid);
    const expectedIssuer = `https://cognito-idp.${config.cognito.region}.amazonaws.com/${config.cognito.userPoolId}`;

    const verifyOptions: jwt.VerifyOptions = {
      issuer: expectedIssuer,
      algorithms: ['RS256'],
    };

    if (config.cognito.clientId) {
      verifyOptions.audience = config.cognito.clientId;
    } else if (isProd) {
      throw new UnauthorizedError('COGNITO_CLIENT_ID must be configured in production');
    }

    const payload = jwt.verify(token, signingKey, verifyOptions) as jwt.JwtPayload;
    return extractUser(payload);
  }

  // Fallback: Verify with JWT_SECRET (HS256) when Cognito is not configured
  if (config.jwt.secret) {
    const payload = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    return extractUser(payload);
  }

  throw new UnauthorizedError(
    'Authentication not configured: set COGNITO_USER_POOL_ID or JWT_SECRET'
  );
}

/**
 * Authentication middleware.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.substring(7);

  verifyToken(token)
    .then((user) => {
      req.user = user;
      (req as any).requestId = (req as any).requestId ?? randomUUID();
      next();
    })
    .catch((err) => {
      if (err instanceof UnauthorizedError) {
        next(err);
      } else {
        next(new UnauthorizedError('Invalid or expired token'));
      }
    });
}

/**
 * Authorization middleware factory.
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
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  verifyToken(token)
    .then((user) => {
      req.user = user;
    })
    .catch(() => {
      // Token invalid, proceed without user context
    })
    .finally(() => {
      next();
    });
}
