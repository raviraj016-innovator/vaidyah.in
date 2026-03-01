import Redis from 'ioredis';
import config from '../config';

// ─── Redis Client Singleton ─────────────────────────────────────────────────

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      connectTimeout: config.redis.connectTimeout,
      retryStrategy(times: number): number | null {
        if (times > 10) {
          console.error('[Redis] Max retries reached, giving up');
          return null; // stop retrying
        }
        const delay = Math.min(times * 200, 5000);
        console.warn(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      lazyConnect: true,
      enableReadyCheck: true,
      ...(config.redis.tls ? { tls: {} } : {}),
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });

    redisClient.on('close', () => {
      console.warn('[Redis] Connection closed');
    });
  }

  return redisClient;
}

// ─── Connect (explicit) ────────────────────────────────────────────────────

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  if (client.status === 'ready') return;

  try {
    await client.connect();
    console.log('[Redis] Connection established');
  } catch (err) {
    console.error('[Redis] Failed to connect:', (err as Error).message);
    // Non-fatal: the gateway can operate in degraded mode without Redis
  }
}

// ─── Cache Helpers ──────────────────────────────────────────────────────────

/**
 * Get a cached value by key.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[Redis] cacheGet error:', (err as Error).message);
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedisClient();
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
  } catch (err) {
    console.warn('[Redis] cacheSet error:', (err as Error).message);
  }
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (err) {
    console.warn('[Redis] cacheDel error:', (err as Error).message);
  }
}

/**
 * Delete all keys matching a pattern (use sparingly).
 */
export async function cacheFlushPattern(pattern: string): Promise<void> {
  try {
    const client = getRedisClient();
    const stream = client.scanStream({ match: `${config.redis.keyPrefix}${pattern}`, count: 100 });
    const pipeline = client.pipeline();
    let count = 0;

    for await (const keys of stream) {
      for (const key of keys as string[]) {
        // Remove the key prefix since ioredis prepends it automatically
        const unprefixed = key.replace(config.redis.keyPrefix, '');
        pipeline.del(unprefixed);
        count++;
      }
    }

    if (count > 0) {
      await pipeline.exec();
    }
  } catch (err) {
    console.warn('[Redis] cacheFlushPattern error:', (err as Error).message);
  }
}

// ─── Health Check ───────────────────────────────────────────────────────────

export async function isHealthy(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// ─── Shutdown ───────────────────────────────────────────────────────────────

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    console.log('[Redis] Disconnecting...');
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Disconnected');
  }
}
