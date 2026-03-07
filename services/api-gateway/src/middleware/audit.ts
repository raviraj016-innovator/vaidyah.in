import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuditEntry } from '../types';
import { query as dbQuery } from '../services/db';

// ─── PHI-Sensitive Route Patterns ───────────────────────────────────────────

/**
 * Route patterns that access Protected Health Information.
 * Requests matching these patterns are flagged in the audit log.
 */
const PHI_PATTERNS: RegExp[] = [
  /^\/api\/v1\/patients/,
  /^\/api\/v1\/sessions\/[^/]+\/vitals/,
  /^\/api\/v1\/sessions\/[^/]+\/summary/,
  /^\/api\/v1\/triage/,
  /^\/api\/v1\/trials\/match/,
  /^\/api\/v1\/trials\/matches/,
  /^\/api\/v1\/emergency/,
];

function isPhiAccess(path: string): boolean {
  return PHI_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Extract the resource type and resource ID from the request path.
 */
function extractResource(path: string): { resource: string; resourceId?: string } {
  // e.g. /api/v1/patients/abc-123 -> resource = "patients", resourceId = "abc-123"
  const parts = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
  return {
    resource: parts[0] ?? 'unknown',
    resourceId: parts[1],
  };
}

// ─── Audit Logging Middleware ───────────────────────────────────────────────

/**
 * Logs an audit entry after the response is sent. Captures the status code,
 * authenticated user, resource accessed, and whether PHI was accessed.
 *
 * The audit log is written asynchronously so it does not slow down the
 * request pipeline.
 */
export function auditLogger(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Skip health/readiness and static asset endpoints
  if (req.path === '/health' || req.path === '/ready' || req.path.startsWith('/static')) {
    next();
    return;
  }

  // Capture the finish event to log after response is sent
  res.on('finish', () => {
    const { resource, resourceId } = extractResource(req.path);
    const phiAccessed = isPhiAccess(req.path);

    const entry: AuditEntry = {
      userId: req.user?.sub ?? 'anonymous',
      userRole: req.user?.role ?? 'anonymous',
      action: mapMethodToAction(req.method),
      resource,
      resourceId,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestMethod: req.method,
      requestPath: req.path,
      statusCode: res.statusCode,
      phiAccessed,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget: do not await, do not block
    persistAuditEntry(entry).catch((err) => {
      console.error('[Audit] Failed to persist audit entry:', err.message);
    });
  });

  next();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapMethodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

function getClientIp(req: AuthenticatedRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/**
 * Persist audit entry to the `audit_log` table.
 * The table is expected to be created by a migration:
 *
 * CREATE TABLE IF NOT EXISTS audit_log (
 *   id            BIGSERIAL PRIMARY KEY,
 *   user_id       VARCHAR(128) NOT NULL,
 *   user_role     VARCHAR(32)  NOT NULL,
 *   action        VARCHAR(32)  NOT NULL,
 *   resource      VARCHAR(128) NOT NULL,
 *   resource_id   VARCHAR(128),
 *   ip_address    VARCHAR(64)  NOT NULL,
 *   user_agent    TEXT,
 *   request_method VARCHAR(10) NOT NULL,
 *   request_path  TEXT         NOT NULL,
 *   status_code   INTEGER,
 *   phi_accessed  BOOLEAN      NOT NULL DEFAULT FALSE,
 *   created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_audit_log_user     ON audit_log (user_id);
 * CREATE INDEX idx_audit_log_resource ON audit_log (resource, resource_id);
 * CREATE INDEX idx_audit_log_phi      ON audit_log (phi_accessed) WHERE phi_accessed = TRUE;
 * CREATE INDEX idx_audit_log_time     ON audit_log (created_at);
 */
async function persistAuditEntry(entry: AuditEntry): Promise<void> {
  const sql = `
    INSERT INTO audit_log (
      user_id, user_role, action, resource, resource_id,
      ip_address, user_agent, request_method, request_path,
      status_code, phi_accessed, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;

  await dbQuery(sql, [
    entry.userId,
    entry.userRole,
    entry.action,
    entry.resource,
    entry.resourceId ?? null,
    entry.ipAddress,
    entry.userAgent,
    entry.requestMethod,
    entry.requestPath,
    entry.statusCode ?? null,
    entry.phiAccessed,
    entry.timestamp,
  ]);
}
