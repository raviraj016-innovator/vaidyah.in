/**
 * JWT authentication middleware.
 * Validates tokens issued by AWS Cognito or the dev JWT secret.
 * In production, verifies against the Cognito JWKS endpoint.
 * In development, verifies tokens signed with the JWT_SECRET.
 */

import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../config';
import { AuthenticatedUser, AuthenticatedRequest, UserRole } from '../types';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

const VALID_ROLES: readonly string[] = ['patient', 'nurse', 'doctor', 'admin', 'system'];
function isValidRole(role: unknown): role is UserRole {
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

/**
 * Retrieve the signing key from the JWKS endpoint for a given key ID.
 */
function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(kid, (err, key) => {
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

/**
 * Extract user claims from a verified JWT payload.
 */
function extractUser(payload: jwt.JwtPayload): AuthenticatedUser {
  if (!payload.sub) {
    throw new UnauthorizedError('Token missing required "sub" claim');
  }
  return {
    sub: payload.sub,
    email: (payload.email as string) ?? '',
    name: (payload.name as string) ?? (payload['cognito:username'] as string) ?? '',
    role: (() => {
      const customRole = payload['custom:role'] as string;
      if (isValidRole(customRole)) return customRole as UserRole;
      const directRole = payload.role as string;
      if (isValidRole(directRole)) return directRole as UserRole;
      throw new UnauthorizedError('Token missing valid role claim');
    })(),
    facilityId: (payload['custom:facilityId'] as string) ?? (payload.facilityId as string) ?? undefined,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Verify and decode the JWT from the Authorization header.
 * Production: Verifies signature against Cognito JWKS.
 * Development: Verifies signature using the JWT_SECRET.
 */
async function verifyToken(token: string): Promise<AuthenticatedUser> {
  if (config.isProd && config.cognito.userPoolId) {
    // Production: Verify against Cognito JWKS
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
    } else if (config.isProd) {
      throw new UnauthorizedError('COGNITO_CLIENT_ID must be configured in production for audience validation');
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
 * Authentication middleware - extracts and verifies JWT from Authorization header.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.substring(7);

  verifyToken(token)
    .then((user) => {
      const authReq = req as AuthenticatedRequest;
      authReq.user = user;
      authReq.requestId = authReq.requestId ?? randomUUID();
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
 * Authorization middleware - checks if the user has one of the required roles.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      next(new ForbiddenError(`Role '${user.role}' is not authorized for this action`));
      return;
    }

    next();
  };
}
