import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { createHash } from 'crypto';
import config from './config';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: config.database.maxPoolSize,
      idleTimeoutMillis: config.database.idleTimeout,
      connectionTimeoutMillis: config.database.connectionTimeout,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
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
 * Execute a parameterized query against the database.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`[DB] Slow query (${duration}ms)`, { queryFingerprint: createHash('sha256').update(text).digest('hex').slice(0, 12) });
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
export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Get a client from the pool for transaction usage.
 * Always release the client in a finally block.
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Execute multiple statements inside a transaction.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[DB] Rollback failed:', rollbackErr, 'Original error:', error);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if the database is reachable.
 */
export async function healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await query('SELECT 1');
    return { healthy: true, latencyMs: Date.now() - start };
  } catch {
    return { healthy: false, latencyMs: Date.now() - start };
  }
}

/**
 * Close the pool gracefully.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    console.log('[DB] Closing connection pool...');
    await pool.end();
    pool = null;
    console.log('[DB] Connection pool closed');
  }
}

export default {
  getPool,
  query,
  queryOne,
  queryMany,
  getClient,
  withTransaction,
  healthCheck,
  closePool,
};
