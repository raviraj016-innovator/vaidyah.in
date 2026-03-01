import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config';
import { getRedisClient } from '../services/redis';
import { AuthenticatedRequest, UserRole } from '../types';
import { AppError } from './errorHandler';

// ─── Redis-backed Rate Limit Store ──────────────────────────────────────────

/**
 * Custom store that persists rate-limit counters in Redis, so limits
 * are shared across all gateway replicas.
 */
class RedisRateLimitStore {
  private prefix: string;
  private windowMs: number;

  constructor(prefix: string, windowMs: number) {
    this.prefix = `${config.redis.keyPrefix}rl:${prefix}:`;
    this.windowMs = windowMs;
  }

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }

  async increment(id: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redis = getRedisClient();
    const key = this.key(id);
    const windowSeconds = Math.ceil(this.windowMs / 1000);

    // INCR + conditional EXPIRE in a pipeline for atomicity
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.pttl(key);
    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Redis pipeline returned null');
    }

    const totalHits = results[0]?.[1] as number;
    const pttl = results[1]?.[1] as number;

    // If TTL is not set (-1 or -2), set it now
    if (pttl < 0) {
      await redis.expire(key, windowSeconds);
    }

    const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs));
    return { totalHits, resetTime };
  }

  async decrement(id: string): Promise<void> {
    const redis = getRedisClient();
    const key = this.key(id);
    await redis.decr(key);
  }

  async resetKey(id: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(this.key(id));
  }
}

// ─── Per-Role Rate Limiting ─────────────────────────────────────────────────

const roleLimits: Record<UserRole, number> = {
  patient: config.rateLimit.patient,
  nurse: config.rateLimit.nurse,
  doctor: config.rateLimit.doctor,
  admin: config.rateLimit.admin,
  system: config.rateLimit.admin, // system accounts get admin-level limits
};

/**
 * Resolves the rate-limit key: authenticated users are keyed by their
 * user ID + role; anonymous users are keyed by IP.
 */
function keyGenerator(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user) {
    return `user:${authReq.user.sub}`;
  }
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    req.ip ??
    'unknown';
  return `ip:${ip}`;
}

/**
 * Returns the max requests for the current user's role.
 */
function maxForUser(req: Request): number {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role) {
    return roleLimits[authReq.user.role] ?? config.rateLimit.default;
  }
  return config.rateLimit.default;
}

// ─── Create Rate Limiter Middleware ─────────────────────────────────────────

let _limiterInstance: RateLimitRequestHandler | null = null;

/**
 * Returns a single shared rate-limiter instance for the gateway.
 * Uses Redis when available, falls back to in-memory.
 */
export function createRateLimiter(): RateLimitRequestHandler {
  if (_limiterInstance) return _limiterInstance;

  let store: RedisRateLimitStore | undefined;
  try {
    store = new RedisRateLimitStore('api', config.rateLimit.windowMs);
  } catch {
    console.warn('[RateLimiter] Redis store unavailable, falling back to memory store');
  }

  _limiterInstance = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: maxForUser,
    keyGenerator,
    standardHeaders: true,    // Return `RateLimit-*` headers
    legacyHeaders: false,     // Disable `X-RateLimit-*` headers
    ...(store ? { store: store as never } : {}),
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(AppError.tooManyRequests('Rate limit exceeded. Please try again later.'));
    },
    skip: (req: Request) => {
      // Always allow health checks through
      return req.path === '/health' || req.path === '/ready';
    },
  });

  return _limiterInstance;
}

// ─── Strict Limiter for Sensitive Endpoints ─────────────────────────────────

/**
 * A stricter limiter for sensitive endpoints (e.g., emergency alerts).
 * 10 requests per minute regardless of role.
 */
export function createStrictRateLimiter(
  maxPerMinute: number = 10,
  prefix: string = 'strict',
): RateLimitRequestHandler {
  let store: RedisRateLimitStore | undefined;
  try {
    store = new RedisRateLimitStore(prefix, 60000);
  } catch {
    // fallback to memory
  }

  return rateLimit({
    windowMs: 60000,
    max: maxPerMinute,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store: store as never } : {}),
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(AppError.tooManyRequests('Strict rate limit exceeded.'));
    },
  });
}
