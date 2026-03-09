import http from 'http';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import config from './config';
import { AuthenticatedRequest, ApiResponse } from './types';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimiter';
import { connectRedis, closeRedis, isHealthy as isRedisHealthy } from './services/redis';
import { isHealthy as isDbHealthy, closePool } from './services/db';
import { setupWebSocket, closeAllConnections } from './services/websocket';
import {
  sessionRouter,
  patientRouter,
  triageRouter,
  emergencyRouter,
  trialsRouter,
} from './routes';
import { authRouter } from './routes/auth';
import { dashboardRouter, analyticsRouter, systemRouter, nurseDashboardRouter } from './routes/dashboard';
import {
  usersRouter,
  centersRouter,
  patientsManagementRouter,
  consultationsRouter,
  notificationsRouter,
  sessionExtRouter,
  emergencyExtRouter,
  trialExtRouter,
  patientHealthRouter,
  patientProfileRouter,
} from './routes/management';
import { telemedicineRouter } from './routes/telemedicine';
import { integrationRouter } from './routes/integration';
import { nluRouter } from './routes/nlu';
import { initializeAwsServices } from './services/aws-init';
import { setupGraphQL } from './graphql';

// ─── Express Application ─────────────────────────────────────────────────────

const app = express();

// Trust proxy only when behind a known reverse proxy (Kubernetes ingress / ALB).
// In production, trust only the first hop (the load balancer).
app.set('trust proxy', config.server.env === 'production' ? 'loopback, linklocal, uniquelocal' : 1);
app.disable('x-powered-by');

// ─── Global Middleware ───────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: config.cors.origins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
  exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 86400,
}));
app.use(express.json({ limit: config.server.bodyLimitBytes }));
app.use(express.urlencoded({ extended: false, limit: config.server.bodyLimitBytes }));

if (config.server.env !== 'test') {
  app.use(morgan(config.server.env === 'production' ? 'combined' : 'dev'));
}

app.use((req: Request, res: Response, next) => {
  const authReq = req as AuthenticatedRequest;
  authReq.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  authReq.startTime = Date.now();
  res.setHeader('X-Request-ID', authReq.requestId);
  next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- monorepo @types/express v4/v5 mismatch
app.use(createRateLimiter() as any);

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    isDbHealthy(),
    isRedisHealthy(),
  ]);

  const allOk = dbOk && redisOk;
  const statusCode = allOk ? 200 : 503;

  // Public health endpoint returns minimal info only.
  // Detailed diagnostics require admin authentication (see /api/v1/admin/health).
  const body: ApiResponse<{
    status: string;
    timestamp: string;
  }> = {
    success: allOk,
    data: {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
    },
  };

  res.status(statusCode).json(body);
});

// ─── Readiness Check ──────────────────────────────────────────────────────

app.get('/ready', async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([
    isDbHealthy(),
    isRedisHealthy(),
  ]);

  const ready = dbOk && redisOk;

  const body: ApiResponse<{
    ready: boolean;
    timestamp: string;
  }> = {
    success: ready,
    data: {
      ready,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(ready ? 200 : 503).json(body);
});

// ─── API v1 Routes ───────────────────────────────────────────────────────────

// Auth routes (no /api/v1 prefix — frontend calls /auth/*)
app.use('/auth', authRouter);

// Core session & clinical routes
app.use('/api/v1/sessions', sessionRouter);
app.use('/api/v1/sessions', sessionExtRouter);
app.use('/api/v1/patients', patientRouter);
app.use('/api/v1/patients', patientsManagementRouter);
app.use('/api/v1/triage', triageRouter);
app.use('/api/v1/emergency', emergencyRouter);
app.use('/api/v1/emergency', emergencyExtRouter);
app.use('/api/v1/trials', trialsRouter);
app.use('/api/v1/trials', trialExtRouter);

// Dashboard, analytics, system
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/v1/system', systemRouter);
app.use('/api/v1/nurse/dashboard', nurseDashboardRouter);

// Management CRUD
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/centers', centersRouter);
app.use('/api/v1/consultations', consultationsRouter);
app.use('/api/v1/notifications', notificationsRouter);

// Integration (ABDM, Wearables, WhatsApp)
app.use('/api/v1/integration', integrationRouter);

// Patient health & profile
app.use('/api/v1/patient/health', patientHealthRouter);
app.use('/api/v1/patient/profile', patientProfileRouter);

// Telemedicine (video consultation + real-time transcription)
app.use('/api/v1/telemedicine', telemedicineRouter);

// NLU (natural language understanding — symptom extraction, translation, SOAP)
app.use('/api/v1/nlu', nluRouter);

// ─── Fallthrough ─────────────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(globalErrorHandler);

// ─── HTTP Server + WebSocket ─────────────────────────────────────────────────

const server = http.createServer(app);
const wss = setupWebSocket(server);

// ─── Start ───────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await connectRedis();

  const dbReady = await isDbHealthy();
  if (!dbReady) {
    console.warn('[App] Database is not reachable at startup; will retry on first query');
  }

  // Initialize AWS services (KMS, SNS, EventBridge, CloudWatch, X-Ray, etc.)
  await initializeAwsServices();

  // Initialize GraphQL (Apollo Server + WebSocket subscriptions)
  await setupGraphQL(app, server);

  server.listen(config.server.port, () => {
    console.log(
      `[App] API Gateway listening on port ${config.server.port} (${config.server.env})`,
    );
  });
}

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[App] Received ${signal}, starting graceful shutdown...`);

  closeAllConnections();
  wss.close();

  const forceExit = setTimeout(() => {
    console.error('[App] Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, config.server.shutdownTimeoutMs);

  // Wait for in-flight HTTP requests to complete before closing DB/Redis
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('[App] HTTP server closed');
  } catch (err) {
    console.error('[App] Error closing HTTP server:', (err as Error).message);
  }

  try {
    await Promise.all([
      closePool(),
      closeRedis(),
    ]);
    console.log('[App] All connections closed cleanly');
  } catch (err) {
    console.error('[App] Error during shutdown:', (err as Error).message);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[App] Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[App] Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

start().catch((err) => {
  console.error('[App] Failed to start:', err);
  process.exit(1);
});

export { app, server };
