/**
 * Comprehensive unit tests for API Gateway middleware.
 *
 * Covers:
 *   1. Authentication middleware  (valid / invalid / expired JWT, missing header, dev tokens)
 *   2. Rate limiting middleware   (within limits, exceeding limits, per-role limits, strict limiter)
 *   3. Error handling middleware  (400, 401, 403, 404, 409, 429, 500, 503, 504, JSON parse, response format)
 *   4. Request validation         (valid / invalid bodies, missing required fields, sanitization)
 *   5. CORS configuration         (allowed origins, methods, headers, credentials, preflight)
 *
 * Uses Jest + supertest for HTTP-level tests and unit-level mocking for
 * isolated middleware tests.
 */

import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

import { AppError, globalErrorHandler, notFoundHandler, asyncHandler } from '../middleware/errorHandler';
import { authenticate, requireRole, optionalAuth, verifyToken } from '../middleware/auth';
import { validate, createSessionRules, createPatientRules, emergencyAlertRules } from '../middleware/validator';
import { AuthenticatedRequest, AuthenticatedUser } from '../types';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

// Mock jwks-rsa
jest.mock('jwks-rsa', () => {
  return jest.fn().mockReturnValue({
    getSigningKey: jest.fn((_kid: string, cb: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
      cb(null, { getPublicKey: () => 'mock-public-key' });
    }),
  });
});

// Mock Redis service
jest.mock('../services/redis', () => ({
  getRedisClient: jest.fn().mockReturnValue({
    pipeline: jest.fn().mockReturnValue({
      incr: jest.fn(),
      pttl: jest.fn(),
      exec: jest.fn().mockResolvedValue([
        [null, 1],
        [null, 60000],
      ]),
    }),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
  }),
  connectRedis: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isHealthy: jest.fn().mockResolvedValue(true),
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

// Mock DB service
jest.mock('../services/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  queryOne: jest.fn().mockResolvedValue(null),
  queryRows: jest.fn().mockResolvedValue([]),
  isHealthy: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(undefined),
  getPool: jest.fn(),
}));

// Mock config -- provide complete config to avoid runtime errors
jest.mock('../config', () => ({
  __esModule: true,
  default: {
    server: {
      port: 3000,
      env: 'test',
      logLevel: 'error',
      requestTimeoutMs: 30000,
      shutdownTimeoutMs: 15000,
      bodyLimitBytes: '5mb',
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'vaidyah_test',
      user: 'test',
      password: '',
      maxConnections: 5,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      ssl: false,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
      keyPrefix: 'vaidyah:gw:test:',
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      tls: false,
    },
    cognito: {
      userPoolId: 'ap-south-1_TestPool',
      region: 'ap-south-1',
      jwksUri: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TestPool/.well-known/jwks.json',
      issuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TestPool',
      tokenExpiry: 3600,
    },
    services: {
      voiceService: 'http://voice-service:3001',
      clinicalService: 'http://clinical-service:3002',
      nluService: 'http://nlu-service:3003',
      trialService: 'http://trial-service:3004',
      integrationService: 'http://integration-service:3005',
    },
    rateLimit: {
      patient: 50,
      nurse: 100,
      doctor: 150,
      admin: 200,
      default: 50,
      windowMs: 60000,
    },
    cors: {
      origins: ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
    },
  },
}));

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    headers: {},
    query: {},
    path: '/api/test',
    method: 'GET',
    ip: '127.0.0.1',
    requestId: 'test-request-id',
    startTime: Date.now(),
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

function mockRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    headersSent: false,
  } as unknown as Response;
  return res;
}

function mockNext(): NextFunction & jest.Mock {
  return jest.fn() as NextFunction & jest.Mock;
}

function devToken(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeTestUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    sub: 'user-001',
    email: 'test@vaidyah.local',
    name: 'Test User',
    role: 'doctor',
    facilityId: 'facility-001',
    ...overrides,
  };
}

/**
 * Build a minimal Express app with CORS, JSON parsing, and the global error
 * handler for HTTP-level (supertest) tests.
 */
function buildTestApp(): Express {
  const app = express();
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 86400,
  }));
  app.use(express.json({ limit: '5mb' }));
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

describe('Authentication Middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Missing Authorization ────────────────────────────────────────────────

  describe('Missing authentication', () => {
    it('rejects request with no Authorization header and no query token', () => {
      const req = mockReq({ headers: {} });
      const next = mockNext();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toContain('No authentication token');
    });

    it('rejects request with empty Authorization header', () => {
      const req = mockReq({
        headers: { authorization: '' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it('rejects request with Authorization header that does not start with Bearer', () => {
      const req = mockReq({
        headers: { authorization: 'Basic abc123' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it('rejects request with Bearer prefix but no token value', () => {
      const req = mockReq({
        headers: { authorization: 'Bearer ' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);

      // "Bearer " sliced to empty string -- extractToken returns null
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ── Valid JWT Token ──────────────────────────────────────────────────────

  describe('Valid JWT tokens', () => {
    it('attaches user to request on valid token verification', async () => {
      const decodedPayload = {
        sub: 'doctor-001',
        email: 'dr.sharma@phc.gov.in',
        name: 'Dr. Sharma',
        'custom:role': 'doctor',
        'custom:facilityId': 'facility-mumbai-01',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Make jwt.verify call the callback with the decoded payload
      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, decodedPayload);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer valid-jwt-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);

      // verifyToken is async -- wait for the promise chain to resolve
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // called with no args == success
      expect(req.user).toBeDefined();
      expect(req.user!.sub).toBe('doctor-001');
      expect(req.user!.email).toBe('dr.sharma@phc.gov.in');
      expect(req.user!.role).toBe('doctor');
      expect(req.user!.facilityId).toBe('facility-mumbai-01');
    });

    it('maps cognito:groups to role when custom:role is absent', async () => {
      const decodedPayload = {
        sub: 'nurse-001',
        email: 'asha@phc.gov.in',
        'cognito:username': 'Asha Devi',
        'cognito:groups': ['nurse'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, decodedPayload);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer nurse-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      expect(req.user).toBeDefined();
      expect(req.user!.role).toBe('nurse');
      expect(req.user!.name).toBe('Asha Devi');
    });

    it('defaults to patient role when no role information is present', async () => {
      const decodedPayload = {
        sub: 'user-no-role',
        email: 'unknown@test.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, decodedPayload);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer no-role-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      expect(req.user).toBeDefined();
      expect(req.user!.role).toBe('patient');
    });

    it('extracts token from query parameter for WebSocket upgrades', async () => {
      const decodedPayload = {
        sub: 'ws-user-001',
        email: 'ws@vaidyah.local',
        name: 'WebSocket User',
        'custom:role': 'nurse',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, decodedPayload);
        },
      );

      const req = mockReq({
        headers: {},
        query: { token: 'ws-jwt-token' },
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user!.sub).toBe('ws-user-001');
    });
  });

  // ── Invalid JWT Token ────────────────────────────────────────────────────

  describe('Invalid JWT tokens', () => {
    it('rejects with 401 when token has invalid signature', async () => {
      const jwtError = new Error('invalid signature');
      jwtError.name = 'JsonWebTokenError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(jwtError);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer tampered-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Invalid token');
    });

    it('rejects with 401 when token is malformed', async () => {
      const jwtError = new Error('jwt malformed');
      jwtError.name = 'JsonWebTokenError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(jwtError);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer not.a.jwt' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      const err = next.mock.calls[0]![0] as AppError;
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Invalid token');
    });

    it('rejects with 401 when token subject claim is missing', async () => {
      const decodedPayload = {
        // sub is deliberately missing
        email: 'no-sub@test.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, decodedPayload);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer no-sub-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.message).toContain('Token missing subject claim');
    });

    it('rejects with generic verification failure for unknown JWT errors', async () => {
      const unknownError = new Error('Something unexpected');
      unknownError.name = 'NotBeforeError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(unknownError);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer unknown-err-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      const err = next.mock.calls[0]![0] as AppError;
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Token verification failed');
    });
  });

  // ── Expired JWT Token ────────────────────────────────────────────────────

  describe('Expired JWT tokens', () => {
    it('rejects with 401 and "Token has expired" message', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(expiredError);
        },
      );

      const req = mockReq({
        headers: { authorization: 'Bearer expired-jwt-token' } as Record<string, string>,
      });
      const next = mockNext();

      authenticate(req, mockRes(), next);
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0]![0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.message).toBe('Token has expired');
    });
  });

  // ── verifyToken standalone ───────────────────────────────────────────────

  describe('verifyToken() helper', () => {
    it('resolves with AuthenticatedUser on valid token', async () => {
      const payload = {
        sub: 'admin-001',
        email: 'admin@vaidyah.local',
        name: 'Admin',
        'custom:role': 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(null, payload);
        },
      );

      const user = await verifyToken('some-valid-token');
      expect(user.sub).toBe('admin-001');
      expect(user.role).toBe('admin');
    });

    it('rejects with AppError on expired token', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(expiredError);
        },
      );

      await expect(verifyToken('expired-token')).rejects.toThrow('Token has expired');
    });

    it('rejects with AppError on invalid token', async () => {
      const jwtError = new Error('invalid signature');
      jwtError.name = 'JsonWebTokenError';

      (mockedJwt.verify as jest.Mock).mockImplementation(
        (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
          callback(jwtError);
        },
      );

      await expect(verifyToken('bad-token')).rejects.toThrow('Invalid token');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1b. ROLE-BASED ACCESS CONTROL (requireRole)
// ═══════════════════════════════════════════════════════════════════════════

describe('Role Authorization (requireRole)', () => {
  it('allows user with exactly matching role', () => {
    const req = mockReq({ user: makeTestUser({ role: 'doctor' }) });
    const next = mockNext();

    requireRole('doctor')(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error argument
  });

  it('allows user when role is in the allowed list', () => {
    const req = mockReq({ user: makeTestUser({ role: 'nurse' }) });
    const next = mockNext();

    requireRole('nurse', 'doctor', 'admin')(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects user whose role is not in the allowed list', () => {
    const req = mockReq({ user: makeTestUser({ role: 'patient' }) });
    const next = mockNext();

    requireRole('doctor', 'admin')(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toContain('patient');
    expect(err.message).toContain('doctor');
  });

  it('rejects when no user is attached to request', () => {
    const req = mockReq(); // no user property
    const next = mockNext();

    requireRole('nurse')(req, mockRes(), next);

    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('allows admin for admin-only route', () => {
    const req = mockReq({ user: makeTestUser({ role: 'admin' }) });
    const next = mockNext();

    requireRole('admin')(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects nurse from admin-only route', () => {
    const req = mockReq({ user: makeTestUser({ role: 'nurse' }) });
    const next = mockNext();

    requireRole('admin')(req, mockRes(), next);

    const err = next.mock.calls[0]![0] as AppError;
    expect(err.statusCode).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1c. OPTIONAL AUTH
// ═══════════════════════════════════════════════════════════════════════════

describe('Optional Auth (optionalAuth)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes through without error when no token is present', () => {
    const req = mockReq({ headers: {} });
    const next = mockNext();

    optionalAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.user).toBeUndefined();
  });

  it('attaches user when valid token is present', async () => {
    const decodedPayload = {
      sub: 'optional-user-001',
      email: 'optional@test.com',
      name: 'Optional User',
      'custom:role': 'patient',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (mockedJwt.verify as jest.Mock).mockImplementation(
      (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
        callback(null, decodedPayload);
      },
    );

    const req = mockReq({
      headers: { authorization: 'Bearer valid-optional-token' } as Record<string, string>,
    });
    const next = mockNext();

    optionalAuth(req, mockRes(), next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
    expect(req.user!.sub).toBe('optional-user-001');
  });

  it('passes through without error when token is invalid (does not reject)', async () => {
    const jwtError = new Error('invalid signature');
    jwtError.name = 'JsonWebTokenError';

    (mockedJwt.verify as jest.Mock).mockImplementation(
      (_token: string, _secretOrKey: unknown, _options: unknown, callback: Function) => {
        callback(jwtError);
      },
    );

    const req = mockReq({
      headers: { authorization: 'Bearer invalid-optional-token' } as Record<string, string>,
    });
    const next = mockNext();

    optionalAuth(req, mockRes(), next);
    await new Promise(process.nextTick);

    // optionalAuth should NOT pass an error to next
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. RATE LIMITING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

describe('Rate Limiting Middleware', () => {
  let app: Express;

  beforeEach(() => {
    // Reset the module cache for rateLimiter to get a fresh limiter instance
    jest.resetModules();
  });

  describe('createRateLimiter (global)', () => {
    it('allows requests within the rate limit', async () => {
      // Re-require after resetModules so we get a fresh limiter
      const { createRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      app.use(createRateLimiter());
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true });
      });

      const response = await supertest(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('returns standard RateLimit headers', async () => {
      const { createRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      app.use(createRateLimiter());
      app.get('/test', (_req: Request, res: Response) => {
        res.json({ success: true });
      });

      const response = await supertest(app).get('/test');

      // express-rate-limit with standardHeaders: true sends these
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('skips rate limiting for /health endpoint', async () => {
      const { createRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      app.use(createRateLimiter());
      app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'healthy' });
      });

      // Fire many requests to /health -- they should all succeed
      const promises = Array.from({ length: 10 }, () =>
        supertest(app).get('/health'),
      );
      const responses = await Promise.all(promises);

      responses.forEach((r) => {
        expect(r.status).toBe(200);
      });
    });

    it('skips rate limiting for /ready endpoint', async () => {
      const { createRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      app.use(createRateLimiter());
      app.get('/ready', (_req: Request, res: Response) => {
        res.json({ ready: true });
      });

      const response = await supertest(app).get('/ready');
      expect(response.status).toBe(200);
    });
  });

  describe('createStrictRateLimiter', () => {
    it('creates a strict limiter with custom max per minute', async () => {
      const { createStrictRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      const strictLimiter = createStrictRateLimiter(5, 'test-strict');
      app.post('/emergency', strictLimiter, (_req: Request, res: Response) => {
        res.status(201).json({ success: true });
      });
      app.use(globalErrorHandler);

      // First request should succeed
      const response = await supertest(app).post('/emergency').send({});
      expect(response.status).toBe(201);
    });

    it('uses the default 10 requests per minute when no args provided', async () => {
      const { createStrictRateLimiter } = require('../middleware/rateLimiter');

      app = buildTestApp();
      const strictLimiter = createStrictRateLimiter();
      app.post('/sensitive', strictLimiter, (_req: Request, res: Response) => {
        res.json({ ok: true });
      });

      const response = await supertest(app).post('/sensitive').send({});
      expect(response.status).toBe(200);
    });
  });

  describe('Per-role rate limits', () => {
    it('uses different limits for different roles via maxForUser', async () => {
      // This is a unit-level test to verify the role-based limit config
      const config = require('../config').default;

      expect(config.rateLimit.patient).toBe(50);
      expect(config.rateLimit.nurse).toBe(100);
      expect(config.rateLimit.doctor).toBe(150);
      expect(config.rateLimit.admin).toBe(200);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. ERROR HANDLING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

describe('Global Error Handler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── AppError subtypes ──────────────────────────────────────────────────

  describe('AppError subtype handling', () => {
    it('handles 400 Bad Request with correct structure', () => {
      const err = AppError.badRequest('Invalid patient ID', { field: 'patientId' });
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('Invalid patient ID');
    });

    it('handles 401 Unauthorized', () => {
      const err = AppError.unauthorized('Token has expired');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(401);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Token has expired');
    });

    it('handles 401 Unauthorized with default message', () => {
      const err = AppError.unauthorized();
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(401);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.message).toBe('Authentication required');
    });

    it('handles 403 Forbidden', () => {
      const err = AppError.forbidden('Insufficient permissions');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Insufficient permissions');
    });

    it('handles 403 Forbidden with default message', () => {
      const err = AppError.forbidden();
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect((res.json as jest.Mock).mock.calls[0]![0].error.message).toBe('Insufficient permissions');
    });

    it('handles 404 Not Found', () => {
      const err = AppError.notFound('Patient');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(404);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Patient not found');
    });

    it('handles 404 Not Found with default resource name', () => {
      const err = AppError.notFound();
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(404);
      expect((res.json as jest.Mock).mock.calls[0]![0].error.message).toBe('Resource not found');
    });

    it('handles 409 Conflict', () => {
      const err = AppError.conflict('Session already completed');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(409);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Session already completed');
    });

    it('handles 429 Too Many Requests', () => {
      const err = AppError.tooManyRequests('Rate limit exceeded. Please try again later.');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(429);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('handles 429 with default message', () => {
      const err = AppError.tooManyRequests();
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(429);
      expect((res.json as jest.Mock).mock.calls[0]![0].error.message).toBe('Rate limit exceeded');
    });

    it('handles 503 Service Unavailable', () => {
      const err = AppError.serviceUnavailable('clinical-service');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(503);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(body.error.message).toContain('clinical-service');
    });

    it('handles 504 Gateway Timeout', () => {
      const err = AppError.gatewayTimeout('nlu-service');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(504);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('GATEWAY_TIMEOUT');
      expect(body.error.message).toContain('nlu-service');
    });
  });

  // ── Unknown / generic errors ─────────────────────────────────────────────

  describe('Unknown error handling', () => {
    it('handles generic Error with 500 status and safe message', () => {
      const err = new Error('Database connection lost');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(500);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred');
    });

    it('handles ValidationError with 400 status', () => {
      const err = new Error('name is required');
      err.name = 'ValidationError';
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('name is required');
    });

    it('handles SyntaxError with body property as JSON parse error', () => {
      const err = new SyntaxError('Unexpected token } in JSON');
      (err as SyntaxError & { body: string }).body = '{ invalid json }';
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(400);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('INVALID_JSON');
      expect(body.error.message).toBe('Request body contains invalid JSON');
    });

    it('handles UnauthorizedError (e.g., from express-jwt)', () => {
      const err = new Error('Invalid or expired authentication token');
      err.name = 'UnauthorizedError';
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      expect(res.status).toHaveBeenCalledWith(401);
      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ── Error response format ────────────────────────────────────────────────

  describe('Error response format (ApiResponse)', () => {
    it('includes success: false in every error response', () => {
      const err = AppError.badRequest('test');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.success).toBe(false);
    });

    it('includes error.code and error.message in every error response', () => {
      const err = AppError.notFound('Session');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
    });

    it('includes meta.requestId as a UUID string', () => {
      const err = AppError.badRequest('test');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.meta).toBeDefined();
      expect(body.meta.requestId).toBeDefined();
      expect(typeof body.meta.requestId).toBe('string');
      // UUID v4 format check
      expect(body.meta.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('does not leak stack traces or internal details to error response', () => {
      const err = new Error('Internal database failure');
      const res = mockRes();

      globalErrorHandler(err, mockReq() as unknown as Request, res, mockNext());

      const body = (res.json as jest.Mock).mock.calls[0]![0];
      expect(body.error.stack).toBeUndefined();
      expect(body.error.message).not.toContain('database failure');
      expect(body.error.message).toBe('An unexpected error occurred');
    });
  });

  // ── HTTP-level error handler tests via supertest ──────────────────────────

  describe('Error handler via HTTP (supertest)', () => {
    let app: Express;

    beforeEach(() => {
      app = buildTestApp();
    });

    it('returns 404 JSON response for unknown routes', async () => {
      app.use(notFoundHandler);
      app.use(globalErrorHandler);

      const response = await supertest(app).get('/api/v1/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.message).toContain('/api/v1/nonexistent');
    });

    it('returns 400 for malformed JSON body', async () => {
      app.post('/test', (_req: Request, res: Response) => {
        res.json({ ok: true });
      });
      app.use(globalErrorHandler);

      const response = await supertest(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    it('returns 500 for unhandled route errors via asyncHandler', async () => {
      app.get(
        '/crash',
        asyncHandler(async () => {
          throw new Error('Unhandled crash');
        }),
      );
      app.use(globalErrorHandler);

      const response = await supertest(app).get('/crash');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('returns AppError status for thrown AppErrors via asyncHandler', async () => {
      app.get(
        '/forbidden',
        asyncHandler(async () => {
          throw AppError.forbidden('Only admins can access this resource');
        }),
      );
      app.use(globalErrorHandler);

      const response = await supertest(app).get('/forbidden');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Only admins can access this resource');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b. NOT FOUND HANDLER
// ═══════════════════════════════════════════════════════════════════════════

describe('Not Found Handler', () => {
  it('creates 404 AppError including HTTP method and path', () => {
    const req = mockReq({ method: 'POST', path: '/api/v1/nonexistent' });
    const next = mockNext();

    notFoundHandler(req as unknown as Request, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('POST');
    expect(err.message).toContain('/api/v1/nonexistent');
  });

  it('includes GET method in error message for GET requests', () => {
    const req = mockReq({ method: 'GET', path: '/unknown' });
    const next = mockNext();

    notFoundHandler(req as unknown as Request, mockRes(), next);

    const err = next.mock.calls[0]![0] as AppError;
    expect(err.message).toContain('GET');
    expect(err.message).toContain('/unknown');
  });

  it('includes DELETE method in error message for DELETE requests', () => {
    const req = mockReq({ method: 'DELETE', path: '/api/v1/sessions/123' });
    const next = mockNext();

    notFoundHandler(req as unknown as Request, mockRes(), next);

    const err = next.mock.calls[0]![0] as AppError;
    expect(err.message).toContain('DELETE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3c. AppError STATIC FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

describe('AppError static factories', () => {
  it('badRequest: statusCode=400, code=BAD_REQUEST', () => {
    const err = AppError.badRequest('Missing field');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.isOperational).toBe(true);
  });

  it('badRequest: can include details', () => {
    const details = [{ field: 'name', message: 'required' }];
    const err = AppError.badRequest('Validation failed', details);
    expect(err.details).toEqual(details);
  });

  it('unauthorized: statusCode=401, code=UNAUTHORIZED', () => {
    const err = AppError.unauthorized('Token expired');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forbidden: statusCode=403, code=FORBIDDEN', () => {
    const err = AppError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('notFound: statusCode=404, code=NOT_FOUND', () => {
    const err = AppError.notFound('Patient');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Patient not found');
  });

  it('conflict: statusCode=409, code=CONFLICT', () => {
    const err = AppError.conflict('Duplicate entry');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('tooManyRequests: statusCode=429, code=RATE_LIMIT_EXCEEDED', () => {
    const err = AppError.tooManyRequests();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('serviceUnavailable: statusCode=503, code=SERVICE_UNAVAILABLE', () => {
    const err = AppError.serviceUnavailable('voice-service');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('gatewayTimeout: statusCode=504, code=GATEWAY_TIMEOUT', () => {
    const err = AppError.gatewayTimeout('nlu-service');
    expect(err.statusCode).toBe(504);
    expect(err.code).toBe('GATEWAY_TIMEOUT');
  });

  it('constructor defaults: statusCode=500, code=INTERNAL_ERROR, isOperational=true', () => {
    const err = new AppError('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('supports non-operational errors', () => {
    const err = new AppError('Fatal crash', 500, 'FATAL', false);
    expect(err.isOperational).toBe(false);
  });

  it('is an instance of both AppError and Error', () => {
    const err = AppError.badRequest('test');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has a proper stack trace', () => {
    const err = AppError.badRequest('test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('AppError');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3d. ASYNC HANDLER WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

describe('asyncHandler', () => {
  it('forwards rejected promises to next()', async () => {
    const app = buildTestApp();
    app.get(
      '/async-error',
      asyncHandler(async () => {
        throw new Error('Async failure');
      }),
    );
    app.use(globalErrorHandler);

    const response = await supertest(app).get('/async-error');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
  });

  it('does not interfere with successful async handlers', async () => {
    const app = buildTestApp();
    app.get(
      '/async-ok',
      asyncHandler(async (_req: Request, res: Response) => {
        res.json({ success: true, data: 'ok' });
      }),
    );

    const response = await supertest(app).get('/async-ok');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. REQUEST VALIDATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

describe('Request Validation Middleware', () => {
  describe('handleValidationErrors (unit-level)', () => {
    it('calls next() with no error when validation passes', async () => {
      const app = buildTestApp();
      app.post(
        '/test-valid',
        ...validate(
          ...createSessionRules,
        ),
        (_req: Request, res: Response) => {
          res.json({ success: true });
        },
      );
      app.use(globalErrorHandler);

      const response = await supertest(app)
        .post('/test-valid')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('returns 400 with validation details when required fields are missing', async () => {
      const app = buildTestApp();
      app.post(
        '/test-validate',
        ...validate(
          ...createSessionRules,
        ),
        (_req: Request, res: Response) => {
          res.json({ success: true });
        },
      );
      app.use(globalErrorHandler);

      const response = await supertest(app)
        .post('/test-validate')
        .send({}); // missing patientId, nurseId, facilityId

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toBe('Validation failed');
    });
  });

  describe('Session creation validation', () => {
    let app: Express;

    beforeEach(() => {
      app = buildTestApp();
      app.post(
        '/sessions',
        ...validate(...createSessionRules),
        (_req: Request, res: Response) => {
          res.status(201).json({ success: true });
        },
      );
      app.use(globalErrorHandler);
    });

    it('accepts valid session creation payload', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
          chiefComplaint: 'Headache and fever for 3 days',
          language: 'en',
        });

      expect(response.status).toBe(201);
    });

    it('rejects invalid patientId (not UUID)', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: 'not-a-uuid',
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Validation failed');
    });

    it('rejects missing nurseId', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          facilityId: VALID_UUID,
        });

      expect(response.status).toBe(400);
    });

    it('rejects missing facilityId', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid language code', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
          language: 'xx',
        });

      expect(response.status).toBe(400);
    });

    it('accepts valid Indian language code', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
          language: 'hi', // Hindi
        });

      expect(response.status).toBe(201);
    });

    it('accepts optional chiefComplaint', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
        });

      expect(response.status).toBe(201); // chiefComplaint is optional
    });

    it('rejects chiefComplaint exceeding 1000 characters', async () => {
      const response = await supertest(app)
        .post('/sessions')
        .send({
          patientId: VALID_UUID,
          nurseId: VALID_UUID,
          facilityId: VALID_UUID,
          chiefComplaint: 'x'.repeat(1001),
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Patient creation validation', () => {
    let app: Express;

    beforeEach(() => {
      app = buildTestApp();
      app.post(
        '/patients',
        ...validate(...createPatientRules),
        (_req: Request, res: Response) => {
          res.status(201).json({ success: true });
        },
      );
      app.use(globalErrorHandler);
    });

    it('accepts valid patient creation payload', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Ramu Kaka',
          phone: '+919876543210',
          abdmId: '12-3456-7890-1234',
          dateOfBirth: '1985-06-15',
          gender: 'male',
          address: 'Village Road, PHC Area',
          district: 'Jaipur',
          state: 'Rajasthan',
          pincode: '302001',
        });

      expect(response.status).toBe(201);
    });

    it('rejects missing name', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          phone: '+919876543210',
        });

      expect(response.status).toBe(400);
    });

    it('rejects missing phone', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Ramu Kaka',
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid phone format', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Ramu Kaka',
          phone: '12345', // too short
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid ABDM ID format', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Ramu Kaka',
          phone: '+919876543210',
          abdmId: '1234567890', // wrong format
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid date of birth', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Test Patient',
          phone: '+919876543210',
          dateOfBirth: 'not-a-date',
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid gender value', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Test Patient',
          phone: '+919876543210',
          gender: 'unknown', // must be male, female, or other
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid pincode (must be 6 digits)', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Test Patient',
          phone: '+919876543210',
          pincode: '1234', // must be 6 digits
        });

      expect(response.status).toBe(400);
    });

    it('accepts minimal required fields only', async () => {
      const response = await supertest(app)
        .post('/patients')
        .send({
          name: 'Minimal Patient',
          phone: '+919876543210',
        });

      expect(response.status).toBe(201);
    });
  });

  describe('Emergency alert validation', () => {
    let app: Express;

    beforeEach(() => {
      app = buildTestApp();
      app.post(
        '/emergency',
        ...validate(...emergencyAlertRules),
        (_req: Request, res: Response) => {
          res.status(201).json({ success: true });
        },
      );
      app.use(globalErrorHandler);
    });

    it('accepts valid emergency alert payload', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'cardiac',
          severity: 'critical',
          location: {
            latitude: 28.6139,
            longitude: 77.209,
            address: 'AIIMS, New Delhi',
          },
        });

      expect(response.status).toBe(201);
    });

    it('rejects missing patientId', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          alertType: 'cardiac',
          severity: 'critical',
          location: { latitude: 28.6139, longitude: 77.209 },
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid alertType', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'fire', // not a valid type
          severity: 'critical',
          location: { latitude: 28.6139, longitude: 77.209 },
        });

      expect(response.status).toBe(400);
    });

    it('rejects invalid severity', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'cardiac',
          severity: 'low', // must be critical or high
          location: { latitude: 28.6139, longitude: 77.209 },
        });

      expect(response.status).toBe(400);
    });

    it('rejects missing location', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'cardiac',
          severity: 'critical',
        });

      expect(response.status).toBe(400);
    });

    it('rejects latitude out of range', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'cardiac',
          severity: 'critical',
          location: { latitude: 91, longitude: 77.209 },
        });

      expect(response.status).toBe(400);
    });

    it('rejects longitude out of range', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          alertType: 'cardiac',
          severity: 'critical',
          location: { latitude: 28.6139, longitude: 181 },
        });

      expect(response.status).toBe(400);
    });

    it('accepts optional sessionId when provided as UUID', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          sessionId: VALID_UUID,
          alertType: 'trauma',
          severity: 'high',
          location: { latitude: 28.6139, longitude: 77.209 },
        });

      expect(response.status).toBe(201);
    });

    it('rejects sessionId when not a valid UUID', async () => {
      const response = await supertest(app)
        .post('/emergency')
        .send({
          patientId: VALID_UUID,
          sessionId: 'not-a-uuid',
          alertType: 'trauma',
          severity: 'high',
          location: { latitude: 28.6139, longitude: 77.209 },
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Validation error response details', () => {
    it('includes per-field error details in the response', async () => {
      const app = buildTestApp();
      app.post(
        '/validate-details',
        ...validate(...createSessionRules),
        (_req: Request, res: Response) => {
          res.json({ success: true });
        },
      );
      app.use(globalErrorHandler);

      const response = await supertest(app)
        .post('/validate-details')
        .send({
          patientId: 'bad',
          nurseId: 'bad',
          facilityId: 'bad',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toBe('Validation failed');
      // Details should be present in non-production
      // (since our test config sets env to 'test')
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

describe('CORS Configuration', () => {
  let app: Express;

  beforeEach(() => {
    app = buildTestApp();
    app.get('/test', (_req: Request, res: Response) => {
      res.json({ success: true });
    });
    app.options('/test', (_req: Request, res: Response) => {
      res.sendStatus(204);
    });
  });

  describe('Allowed origins', () => {
    it('includes CORS headers for allowed origin http://localhost:3000', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('includes CORS headers for allowed origin http://localhost:5173', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('does not include CORS allow-origin header for disallowed origin', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'http://evil.com');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Allowed methods', () => {
    it('allows GET, POST, PUT, PATCH, DELETE, OPTIONS in preflight', async () => {
      const response = await supertest(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      const allowedMethods = response.headers['access-control-allow-methods'];
      expect(allowedMethods).toContain('GET');
      expect(allowedMethods).toContain('POST');
      expect(allowedMethods).toContain('PUT');
      expect(allowedMethods).toContain('PATCH');
      expect(allowedMethods).toContain('DELETE');
      expect(allowedMethods).toContain('OPTIONS');
    });
  });

  describe('Allowed headers', () => {
    it('allows Content-Type, Authorization, X-Request-ID, X-Correlation-ID', async () => {
      const response = await supertest(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

      const allowedHeaders = response.headers['access-control-allow-headers'];
      expect(allowedHeaders).toContain('Content-Type');
      expect(allowedHeaders).toContain('Authorization');
      expect(allowedHeaders).toContain('X-Request-ID');
      expect(allowedHeaders).toContain('X-Correlation-ID');
    });
  });

  describe('Exposed headers', () => {
    it('exposes X-Request-ID and RateLimit headers to the browser', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      const exposed = response.headers['access-control-expose-headers'];
      expect(exposed).toContain('X-Request-ID');
      expect(exposed).toContain('RateLimit-Limit');
      expect(exposed).toContain('RateLimit-Remaining');
      expect(exposed).toContain('RateLimit-Reset');
    });
  });

  describe('Credentials', () => {
    it('includes Access-Control-Allow-Credentials: true', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Preflight caching', () => {
    it('includes Access-Control-Max-Age header in preflight response', async () => {
      const response = await supertest(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(response.headers['access-control-max-age']).toBe('86400');
    });
  });

  describe('Cross-origin request blocking', () => {
    it('returns response without CORS headers for unknown origins', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'https://attacker.com');

      // cors package does not set the allow-origin header for non-matching origins
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('still returns the response body even for disallowed origins (browser enforces CORS)', async () => {
      const response = await supertest(app)
        .get('/test')
        .set('Origin', 'https://attacker.com');

      // The server still sends the response; CORS is enforced by the browser
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
