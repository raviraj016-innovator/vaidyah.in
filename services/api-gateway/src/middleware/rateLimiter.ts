import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import config from '../config';
import { getRedisClient } from '../services/redis';
import { AuthenticatedRequest } from '../types';
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
    try {
      const redis = getRedisClient();
      const key = this.key(id);

      // Atomic INCR + conditional PEXPIRE via Lua script to prevent race conditions
      const RATE_LIMIT_SCRIPT = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        local ttl = redis.call('PTTL', KEYS[1])
        return {current, ttl}
      `;

      const result = await redis.eval(
        RATE_LIMIT_SCRIPT,
        1,
        key,
        String(this.windowMs),
      ) as [number, number];

      const totalHits = result[0];
      const pttl = result[1];

      const resetTime = new Date(Date.now() + (pttl > 0 ? pttl : this.windowMs));
      return { totalHits, resetTime };
    } catch (err) {
      // Fail-open: allow request through when Redis is unavailable
      console.warn('[RateLimiter] Redis increment failed, allowing request:', (err as Error).message);
      return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(id: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = this.key(id);
      await redis.decr(key);
    } catch {
      // Fail-open: ignore decrement errors
    }
  }

  async resetKey(id: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(this.key(id));
    } catch {
      // Fail-open: ignore reset errors
    }
  }
}

// ─── Per-Role Rate Limiting ─────────────────────────────────────────────────

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
 * Returns the max requests for the global (pre-auth) limiter.
 * This is a generous DDoS safety net (200/min). Role-specific limits
 * are enforced by createRoleBasedRateLimiter() after authentication.
 */
function maxForUser(_req: Request): number {
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

  // Type assertions needed: monorepo hoists @types/express v4 (used by express-rate-limit)
  // while api-gateway uses @types/express v5 locally — types are structurally incompatible.
  _limiterInstance = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: maxForUser as any,
    keyGenerator: keyGenerator as any,
    standardHeaders: true,    // Return `RateLimit-*` headers
    legacyHeaders: false,     // Disable `X-RateLimit-*` headers
    ...(store ? { store: store as never } : {}),
    handler: ((_req: Request, _res: Response, next: NextFunction) => {
      next(AppError.tooManyRequests('Rate limit exceeded. Please try again later.'));
    }) as any,
    skip: ((req: Request) => {
      // Always allow health checks through
      return req.path === '/health' || req.path === '/ready';
    }) as any,
  });

  return _limiterInstance;
}

// ─── Role-Based Limiter (post-auth) ─────────────────────────────────────────

/**
 * Rate limiter that runs AFTER authentication middleware.
 * Enforces per-role limits (patient:50, nurse:100, doctor:150, admin:200).
 */
export function createRoleBasedRateLimiter(): RateLimitRequestHandler {
  let store: RedisRateLimitStore | undefined;
  try {
    store = new RedisRateLimitStore('role', config.rateLimit.windowMs);
  } catch {
    // fallback to memory
  }

  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: ((req: Request) => {
      const authReq = req as AuthenticatedRequest;
      const role = authReq.user?.role;
      if (role && role in config.rateLimit) {
        return config.rateLimit[role as keyof typeof config.rateLimit] as number;
      }
      return config.rateLimit.default;
    }) as any,
    keyGenerator: ((req: Request) => {
      const authReq = req as AuthenticatedRequest;
      if (authReq.user) {
        return `user:${authReq.user.sub}`;
      }
      return `ip:${req.ip ?? 'unknown'}`;
    }) as any,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store: store as never } : {}),
    handler: ((_req: Request, _res: Response, next: NextFunction) => {
      next(AppError.tooManyRequests('Role rate limit exceeded. Please try again later.'));
    }) as any,
  });
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
    keyGenerator: keyGenerator as any,
    standardHeaders: true,
    legacyHeaders: false,
    ...(store ? { store: store as never } : {}),
    handler: ((_req: Request, _res: Response, next: NextFunction) => {
      next(AppError.tooManyRequests('Strict rate limit exceeded.'));
    }) as any,
  });
}
