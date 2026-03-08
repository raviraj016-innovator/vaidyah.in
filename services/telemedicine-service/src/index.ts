/**
 * Vaidyah Telemedicine Service
 *
 * Video consultation with real-time transcription using
 * LiveKit (WebRTC) and Amazon Transcribe Streaming.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { config } from './config';
import { router } from './routes';
import { setupWebSocket } from './websocket';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use('/', router);

// ─── HTTP + WebSocket Server ─────────────────────────────────────────────────

const server = createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`[Telemedicine] Service running on port ${config.port}`);
  console.log(`[Telemedicine] Environment: ${config.env}`);
  console.log(`[Telemedicine] WebSocket: ws://localhost:${config.port}/ws`);
  console.log(`[Telemedicine] LiveKit: ${config.livekit.apiKey ? 'Configured' : 'Dev mode (mock)'}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[Telemedicine] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[Telemedicine] Server closed');
    process.exit(0);
  });
});
