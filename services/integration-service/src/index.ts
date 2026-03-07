import http from 'http';
import app from './app';
import config from './config';
import { healthCheck, closePool } from './db';

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(app);

// ─── Start ────────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  const dbReady = await healthCheck();
  if (!dbReady.healthy) {
    console.warn('[IntegrationService] Database is not reachable at startup; will retry on first query');
  }

  server.listen(config.server.port, config.server.host, () => {
    console.log(
      `[IntegrationService] Listening on ${config.server.host}:${config.server.port} (${config.server.nodeEnv})`,
    );
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[IntegrationService] Received ${signal}, starting graceful shutdown...`);

  const forceExit = setTimeout(() => {
    console.error('[IntegrationService] Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);

  try {
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[IntegrationService] HTTP server closed');
        resolve();
      });
    });
    await closePool();
    console.log('[IntegrationService] All connections closed cleanly');
  } catch (err) {
    console.error('[IntegrationService] Error during shutdown:', (err as Error).message);
  }

  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[IntegrationService] Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[IntegrationService] Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

start().catch((err) => {
  console.error('[IntegrationService] Failed to start:', err);
  process.exit(1);
});

export { app, server };
