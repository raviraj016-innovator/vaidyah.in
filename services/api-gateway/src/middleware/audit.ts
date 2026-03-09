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
 * Matches the actual schema from init.sql:
 *
 * CREATE TABLE audit_log (
 *   id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id         UUID REFERENCES users(id),
 *   action          VARCHAR(100) NOT NULL,
 *   resource_type   VARCHAR(50) NOT NULL,
 *   resource_id     UUID,
 *   details         JSONB DEFAULT '{}',
 *   ip_address      INET,
 *   created_at      TIMESTAMPTZ DEFAULT NOW()
 * );
 */
async function persistAuditEntry(entry: AuditEntry): Promise<void> {
  // user_id is UUID FK to users — pass NULL for anonymous/non-UUID subjects
  const userIdParam = entry.userId && entry.userId !== 'anonymous' && isUuid(entry.userId)
    ? entry.userId
    : null;

  // resource_id must be a valid UUID or NULL
  const resourceIdParam = entry.resourceId && isUuid(entry.resourceId)
    ? entry.resourceId
    : null;

  const details = {
    userRole: entry.userRole,
    method: entry.requestMethod,
    path: entry.requestPath,
    statusCode: entry.statusCode,
    phiAccessed: entry.phiAccessed,
    userAgent: entry.userAgent,
  };

  const sql = `
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
    VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6::inet)
  `;

  await dbQuery(sql, [
    userIdParam,
    entry.action,
    entry.resource,
    resourceIdParam,
    JSON.stringify(details),
    entry.ipAddress,
  ]);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
