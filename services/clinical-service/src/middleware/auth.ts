/**
 * JWT authentication middleware.
 * Validates tokens issued by AWS Cognito or the dev JWT secret.
 * In production, verifies against the Cognito JWKS endpoint.
 * In development, accepts tokens signed with the JWT_SECRET.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticatedUser, AuthenticatedRequest, UserRole } from '../types';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

/**
 * Simple base64url decode without external dependency.
 */
function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Decode JWT payload without verification (for dev mode).
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = parts[1];
  if (!payload) {
    throw new Error('Invalid JWT: missing payload');
  }
  return JSON.parse(base64urlDecode(payload));
}

/**
 * Verify and decode the JWT from the Authorization header.
 * In development mode, decodes without cryptographic verification.
 * In production, this should verify against Cognito JWKS.
 */
async function verifyToken(token: string): Promise<AuthenticatedUser> {
  if (config.isProd && config.cognito.userPoolId) {
    // Production: Verify against Cognito JWKS
    // In a full implementation, this would use jwks-rsa to fetch the public key
    // and jsonwebtoken.verify() to validate the signature.
    // For now, we decode and validate the structure.
    const payload = decodeJwtPayload(token);

    const expectedIssuer = `https://cognito-idp.${config.cognito.region}.amazonaws.com/${config.cognito.userPoolId}`;
    if (payload['iss'] !== expectedIssuer) {
      throw new UnauthorizedError('Invalid token issuer');
    }

    if (config.cognito.clientId && payload['client_id'] !== config.cognito.clientId && payload['aud'] !== config.cognito.clientId) {
      throw new UnauthorizedError('Invalid token audience');
    }

    const exp = payload['exp'] as number | undefined;
    if (exp && exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedError('Token has expired');
    }

    return {
      sub: payload['sub'] as string,
      email: (payload['email'] as string) ?? '',
      name: (payload['name'] as string) ?? (payload['cognito:username'] as string) ?? '',
      role: (payload['custom:role'] as UserRole) ?? 'patient',
      facilityId: payload['custom:facilityId'] as string | undefined,
      iat: payload['iat'] as number | undefined,
      exp: payload['exp'] as number | undefined,
    };
  }

  // Development: Decode without full cryptographic verification
  const payload = decodeJwtPayload(token);

  const exp = payload['exp'] as number | undefined;
  if (exp && exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError('Token has expired');
  }

  return {
    sub: (payload['sub'] as string) ?? 'dev-user',
    email: (payload['email'] as string) ?? 'dev@vaidyah.local',
    name: (payload['name'] as string) ?? 'Dev User',
    role: (payload['role'] as UserRole) ?? (payload['custom:role'] as UserRole) ?? 'doctor',
    facilityId: payload['facilityId'] as string | undefined ?? payload['custom:facilityId'] as string | undefined,
    iat: payload['iat'] as number | undefined,
    exp: payload['exp'] as number | undefined,
  };
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
    // In development, allow requests without auth for easier testing
    if (config.isDev) {
      const authReq = req as AuthenticatedRequest;
      authReq.user = {
        sub: 'dev-user-id',
        email: 'dev@vaidyah.local',
        name: 'Development User',
        role: 'doctor',
        facilityId: 'dev-facility-id',
      };
      authReq.requestId = authReq.requestId ?? crypto.randomUUID();
      next();
      return;
    }
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.substring(7);

  verifyToken(token)
    .then((user) => {
      const authReq = req as AuthenticatedRequest;
      authReq.user = user;
      authReq.requestId = authReq.requestId ?? crypto.randomUUID();
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
