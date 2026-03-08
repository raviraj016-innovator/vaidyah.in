import { Response, NextFunction } from 'express';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import config from '../config';
import { AuthenticatedRequest, AuthenticatedUser, UserRole } from '../types';
import { AppError } from './errorHandler';

// ─── JWKS Client ────────────────────────────────────────────────────────────

let jwksClientInstance: jwksClient.JwksClient | null = null;

function getJwksClient(): jwksClient.JwksClient {
  if (!jwksClientInstance) {
    if (!config.cognito.jwksUri) {
      throw new Error('COGNITO_USER_POOL_ID is not configured; cannot build JWKS URI');
    }
    jwksClientInstance = jwksClient({
      jwksUri: config.cognito.jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return jwksClientInstance;
}

/**
 * Callback used by jsonwebtoken to retrieve the signing key from the JWKS
 * endpoint based on the `kid` in the JWT header.
 */
function getSigningKey(header: JwtHeader, callback: SigningKeyCallback): void {
  const client = getJwksClient();
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    if (!key) {
      callback(new Error('Signing key not found'));
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// ─── Token Extraction ───────────────────────────────────────────────────────

function extractToken(req: AuthenticatedRequest): string | null {
  // Bearer token from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

// ─── Verify Token Helper (also used by WebSocket) ───────────────────────────

export function verifyToken(token: string): Promise<AuthenticatedUser> {
  return new Promise((resolve, reject) => {
    const options: jwt.VerifyOptions = {
      algorithms: ['RS256'],
      ...(config.cognito.issuer ? { issuer: config.cognito.issuer } : {}),
      ...(config.cognito.audience ? { audience: config.cognito.audience } : {}),
    };

    jwt.verify(token, getSigningKey, options, (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          reject(AppError.unauthorized('Token has expired'));
        } else if (err.name === 'JsonWebTokenError') {
          reject(AppError.unauthorized('Invalid token'));
        } else {
          reject(AppError.unauthorized('Token verification failed'));
        }
        return;
      }

      const payload = decoded as Record<string, unknown>;
      const user: AuthenticatedUser = {
        sub: (payload.sub as string) ?? '',
        email: (payload.email as string) ?? '',
        name:
          (payload.name as string) ??
          (payload['cognito:username'] as string) ??
          '',
        role: mapCognitoRole(payload),
        facilityId: (payload['custom:facilityId'] as string) ?? undefined,
        iat: payload.iat as number | undefined,
        exp: payload.exp as number | undefined,
      };

      if (!user.sub) {
        reject(AppError.unauthorized('Token missing subject claim'));
        return;
      }

      resolve(user);
    });
  });
}

/**
 * Map Cognito custom attributes / groups to a UserRole.
 */
function mapCognitoRole(payload: Record<string, unknown>): UserRole {
  // Check custom:role attribute first
  const customRole = payload['custom:role'] as string | undefined;
  if (customRole && isValidRole(customRole)) {
    return customRole;
  }

  // Check cognito:groups
  const groups = payload['cognito:groups'] as string[] | undefined;
  if (Array.isArray(groups)) {
    if (groups.includes('admin')) return 'admin';
    if (groups.includes('doctor')) return 'doctor';
    if (groups.includes('nurse')) return 'nurse';
    if (groups.includes('patient')) return 'patient';
  }

  return 'patient'; // default role
}

function isValidRole(role: string): role is UserRole {
  return ['patient', 'nurse', 'doctor', 'admin', 'system'].includes(role);
}

// ─── Authentication Middleware ──────────────────────────────────────────────

/**
 * Verifies the JWT from the Authorization header and
 * attaches the authenticated user to `req.user`.
 */
export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);

  if (!token) {
    next(AppError.unauthorized('No authentication token provided'));
    return;
  }

  // When Cognito is not configured, verify JWTs signed with JWT_SECRET (HS256)
  if (!config.cognito.userPoolId) {
    verifyDevJwt(token, req, next);
    return;
  }

  verifyToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

const DEV_JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!DEV_JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

/**
 * Development-only: verify JWTs signed with the local dev secret (HS256)
 * when no Cognito pool is configured.
 */
function verifyDevJwt(
  token: string,
  req: AuthenticatedRequest,
  next: NextFunction,
): void {
  try {
    const decoded = jwt.verify(token, DEV_JWT_SECRET, {
      algorithms: ['HS256'],
    }) as Record<string, unknown>;

    const user: AuthenticatedUser = {
      sub: (decoded.sub as string) ?? '',
      email: (decoded.email as string) ?? '',
      name: (decoded.name as string) ?? '',
      role: mapCognitoRole(decoded),
      facilityId: (decoded['custom:facilityId'] as string) ?? undefined,
      iat: decoded.iat as number | undefined,
      exp: decoded.exp as number | undefined,
    };

    if (!user.sub) {
      next(AppError.unauthorized('Token missing subject claim'));
      return;
    }

    req.user = user;
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired dev JWT'));
  }
}

// ─── Role-Based Access Control ──────────────────────────────────────────────

/**
 * Returns middleware that ensures the authenticated user has one of the
 * specified roles.
 *
 * Usage:
 *   router.post('/admin-only', authenticate, requireRole('admin'), handler);
 *   router.get('/clinical', authenticate, requireRole('nurse', 'doctor', 'admin'), handler);
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        AppError.forbidden(
          `Role "${req.user.role}" is not authorized. Required: ${allowedRoles.join(', ')}`,
        ),
      );
      return;
    }

    next();
  };
}

// ─── Optional Auth (does not reject unauthenticated requests) ───────────────

export function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  if (config.server.env === 'development' && process.env.NODE_ENV !== 'production' && !config.cognito.userPoolId) {
    verifyDevJwt(token, req, next);
    return;
  }

  verifyToken(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((err) => {
      // Token was provided but invalid -- reject with 401
      next(err);
    });
}
