import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { createHash } from 'crypto';
import config from '../config';

// ─── Connection Pool ────────────────────────────────────────────────────────

let pool: Pool | null = null;

function getPoolConfig(): PoolConfig {
  const cfg: PoolConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: config.database.maxConnections,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    // Statement timeout to prevent long-running queries
    statement_timeout: 30000,
  };

  if (config.database.ssl) {
    cfg.ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };
  }

  return cfg;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolConfig());

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      console.debug('[DB] New client connected to pool');
    });
  }
  return pool;
}

// ─── Query Helpers ──────────────────────────────────────────────────────────

/**
 * Execute a parameterized query against the pool.
 * Always use parameterized queries ($1, $2, ...) to prevent SQL injection.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const p = getPool();
  const start = Date.now();

  try {
    const result = await p.query<T>(text, params);
    const durationMs = Date.now() - start;

    if (durationMs > 1000) {
      console.warn('[DB] Slow query detected', {
        queryFingerprint: createHash('sha256').update(text).digest('hex').slice(0, 12),
        durationMs,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error('[DB] Query error', {
      queryFingerprint: createHash('sha256').update(text).digest('hex').slice(0, 12),
      durationMs,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Execute a query and return just the rows.
 */
export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Execute a query and return the first row, or null.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Run a set of queries inside a database transaction.
 */
export async function transaction<T>(
  fn: (client: {
    query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;
  }) => Promise<T>,
): Promise<T> {
  const p = getPool();
  const client = await p.connect();

  try {
    await client.query('BEGIN');
    const result = await fn({
      query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
        client.query<R>(text, params),
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Health Check ───────────────────────────────────────────────────────────

/**
 * Returns true if the database is reachable.
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 AS ok');
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// ─── Shutdown ───────────────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  if (pool) {
    console.log('[DB] Closing connection pool...');
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}
