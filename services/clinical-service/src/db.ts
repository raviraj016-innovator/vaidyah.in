/**
 * PostgreSQL database pool and query helpers.
 * Uses pg Pool with typed query support.
 */

import { createHash } from 'crypto';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './config';

let pool: Pool | null = null;

/**
 * Initialize and return the database pool.
 * Uses singleton pattern to ensure a single pool instance.
 */
export function getPool(): Pool {
  if (!pool) {
    const sslConfig = config.isProd
      ? { ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false } as const }
      : {};

    pool = new Pool({
      connectionString: config.database.url,
      min: config.database.poolMin,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      ...sslConfig,
    });

    pool.on('error', (err: Error) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });

    pool.on('connect', () => {
      console.log('[DB] New client connected to pool');
    });
  }

  return pool;
}

/**
 * Execute a parameterized query against the pool.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  if (config.isDev) {
    console.log('[DB] Query executed', {
      queryFingerprint: createHash('sha256').update(text).digest('hex').slice(0, 12),
      rows: result.rowCount,
      duration_ms: duration,
    });
  }

  return result;
}

/**
 * Execute a query and return the first row, or null if no rows.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/**
 * Execute a query and return all rows.
 */
export async function queryAll<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Get a client from the pool for transaction use.
 * Caller must release the client when done.
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Execute a function within a database transaction.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await getClient();
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[DB] ROLLBACK failed:', rollbackErr);
      }
    }
    throw err;
  } finally {
    client?.release();
  }
}

/**
 * Gracefully shut down the database pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    console.log('[DB] Closing connection pool...');
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}
