import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { verifyToken } from '../middleware/auth';
import {
  AuthenticatedUser,
  WsInboundMessage,
  WsOutboundMessage,
  WsAudioChunk,
} from '../types';

// ─── Connected Client Tracking ──────────────────────────────────────────────

interface WsClient {
  id: string;
  ws: WebSocket;
  user: AuthenticatedUser | null;
  sessionId: string | null;
  authenticated: boolean;
  upstreamWs: WebSocket | null;   // Connection to voice-service
  lastPing: number;
}

const clients = new Map<string, WsClient>();

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTH_TIMEOUT_MS = 10000;          // 10s to authenticate after connecting
const PING_INTERVAL_MS = 30000;         // 30s heartbeat
const MAX_PAYLOAD_BYTES = 256 * 1024;   // 256 KB per message (audio chunks)

// ─── Setup ──────────────────────────────────────────────────────────────────

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws/voice',
    maxPayload: MAX_PAYLOAD_BYTES,
    perMessageDeflate: false, // Disable compression for audio (already encoded)
  });

  console.log('[WS] WebSocket server attached at /ws/voice');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    handleConnection(ws, req);
  });

  wss.on('error', (err) => {
    console.error('[WS] Server error:', err.message);
  });

  // Periodic heartbeat to detect dead connections
  const pingInterval = setInterval(() => {
    for (const [clientId, client] of clients.entries()) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        cleanupClient(clientId);
        continue;
      }
      // If no pong received since last ping, terminate
      if (Date.now() - client.lastPing > PING_INTERVAL_MS * 2) {
        console.warn(`[WS] Client ${clientId} unresponsive, terminating`);
        client.ws.terminate();
        cleanupClient(clientId);
        continue;
      }
      client.ws.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on('close', () => {
    clearInterval(pingInterval);
    // Clean up all clients
    for (const clientId of clients.keys()) {
      cleanupClient(clientId);
    }
  });

  return wss;
}

// ─── Connection Handler ─────────────────────────────────────────────────────

function handleConnection(ws: WebSocket, req: IncomingMessage): void {
  const clientId = uuidv4();
  const client: WsClient = {
    id: clientId,
    ws,
    user: null,
    sessionId: null,
    authenticated: false,
    upstreamWs: null,
    lastPing: Date.now(),
  };

  clients.set(clientId, client);
  console.log(`[WS] Client connected: ${clientId} (total: ${clients.size})`);

  // Check for token in query params for immediate auth
  const urlStr = req.url ?? '/';
  const url = new URL(urlStr, `http://${req.headers.host ?? 'localhost'}`);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    authenticateClient(client, queryToken, url.searchParams.get('sessionId') ?? undefined);
  }

  // Auth timeout: disconnect if not authenticated within window
  const authTimer = setTimeout(() => {
    if (!client.authenticated) {
      sendMessage(ws, {
        type: 'error',
        code: 'AUTH_TIMEOUT',
        message: 'Authentication required within 10 seconds',
      });
      ws.close(4001, 'Authentication timeout');
      cleanupClient(clientId);
    }
  }, AUTH_TIMEOUT_MS);

  ws.on('pong', () => {
    client.lastPing = Date.now();
  });

  ws.on('message', (data: Buffer | string) => {
    handleMessage(client, data);
  });

  ws.on('close', (code, reason) => {
    clearTimeout(authTimer);
    console.log(`[WS] Client disconnected: ${clientId} (code=${code}, reason=${reason.toString()})`);
    cleanupClient(clientId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Client error ${clientId}:`, err.message);
    cleanupClient(clientId);
  });
}

// ─── Message Router ─────────────────────────────────────────────────────────

function handleMessage(client: WsClient, raw: Buffer | string): void {
  let message: WsInboundMessage;

  try {
    const str = typeof raw === 'string' ? raw : raw.toString('utf8');
    message = JSON.parse(str) as WsInboundMessage;
  } catch {
    sendMessage(client.ws, {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Message must be valid JSON',
    });
    return;
  }

  switch (message.type) {
    case 'auth':
      authenticateClient(client, message.token, message.sessionId);
      break;

    case 'audio':
      if (!client.authenticated) {
        sendMessage(client.ws, {
          type: 'error',
          code: 'NOT_AUTHENTICATED',
          message: 'Send auth message first',
        });
        return;
      }
      forwardAudioChunk(client, message);
      break;

    case 'start':
    case 'stop':
    case 'pause':
    case 'resume':
      if (!client.authenticated) {
        sendMessage(client.ws, {
          type: 'error',
          code: 'NOT_AUTHENTICATED',
          message: 'Send auth message first',
        });
        return;
      }
      forwardControlMessage(client, message);
      break;

    case 'ping':
      sendMessage(client.ws, { type: 'ack', event: 'pong' });
      break;

    default:
      sendMessage(client.ws, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE_TYPE',
        message: `Unknown message type: ${(message as { type: string }).type}`,
      });
  }
}

// ─── Authentication ─────────────────────────────────────────────────────────

async function authenticateClient(
  client: WsClient,
  token: string,
  sessionId?: string,
): Promise<void> {
  try {
    // In development without Cognito, handle dev tokens
    let user: AuthenticatedUser;
    if (config.server.env === 'development' && !config.cognito.userPoolId) {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      user = {
        sub: decoded.sub ?? 'dev-user',
        email: decoded.email ?? 'dev@vaidyah.local',
        name: decoded.name ?? 'Dev User',
        role: decoded.role ?? 'nurse',
        facilityId: decoded.facilityId,
      };
    } else {
      user = await verifyToken(token);
    }

    client.user = user;
    client.authenticated = true;
    client.sessionId = sessionId ?? null;

    console.log(`[WS] Client ${client.id} authenticated as ${user.sub} (${user.role})`);

    sendMessage(client.ws, {
      type: 'ack',
      event: 'authenticated',
      sessionId: sessionId,
    });

    // Establish upstream connection to voice-service
    if (sessionId) {
      connectToVoiceService(client, sessionId);
    }
  } catch (err) {
    sendMessage(client.ws, {
      type: 'error',
      code: 'AUTH_FAILED',
      message: (err as Error).message,
    });
    client.ws.close(4003, 'Authentication failed');
    cleanupClient(client.id);
  }
}

// ─── Voice Service Upstream Connection ──────────────────────────────────────

function connectToVoiceService(client: WsClient, sessionId: string): void {
  const voiceWsUrl = config.services.voiceService
    .replace('http://', 'ws://')
    .replace('https://', 'wss://');

  const url = `${voiceWsUrl}/ws/stream?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(client.user?.sub ?? '')}`;

  try {
    const upstream = new WebSocket(url);

    upstream.on('open', () => {
      console.log(`[WS] Upstream voice connection established for session ${sessionId}`);
      client.upstreamWs = upstream;
    });

    upstream.on('message', (data: Buffer | string) => {
      // Forward voice-service responses (transcripts, events) back to the client
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });

    upstream.on('close', (code, reason) => {
      console.log(
        `[WS] Upstream voice connection closed for session ${sessionId} (code=${code}, reason=${reason.toString()})`,
      );
      client.upstreamWs = null;
    });

    upstream.on('error', (err) => {
      console.error(
        `[WS] Upstream voice connection error for session ${sessionId}:`,
        err.message,
      );
      sendMessage(client.ws, {
        type: 'error',
        code: 'UPSTREAM_ERROR',
        message: 'Voice service connection error',
      });
      client.upstreamWs = null;
    });
  } catch (err) {
    console.error(`[WS] Failed to connect to voice service:`, (err as Error).message);
    sendMessage(client.ws, {
      type: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Voice service is unavailable',
    });
  }
}

// ─── Forward Audio ──────────────────────────────────────────────────────────

function forwardAudioChunk(client: WsClient, chunk: WsAudioChunk): void {
  if (!client.upstreamWs || client.upstreamWs.readyState !== WebSocket.OPEN) {
    // If upstream is not connected, try to reconnect
    if (client.sessionId) {
      connectToVoiceService(client, client.sessionId);
    }
    sendMessage(client.ws, {
      type: 'error',
      code: 'UPSTREAM_NOT_READY',
      message: 'Voice service connection not ready, reconnecting...',
    });
    return;
  }

  // Forward the audio chunk as-is to the voice service
  client.upstreamWs.send(JSON.stringify(chunk));
}

function forwardControlMessage(
  client: WsClient,
  message: { type: string; sessionId: string },
): void {
  if (!client.upstreamWs || client.upstreamWs.readyState !== WebSocket.OPEN) {
    sendMessage(client.ws, {
      type: 'error',
      code: 'UPSTREAM_NOT_READY',
      message: 'Voice service connection not ready',
    });
    return;
  }

  client.upstreamWs.send(JSON.stringify(message));
  sendMessage(client.ws, { type: 'ack', event: message.type, sessionId: message.sessionId });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sendMessage(ws: WebSocket, message: WsOutboundMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function cleanupClient(clientId: string): void {
  const client = clients.get(clientId);
  if (!client) return;

  // Close upstream voice connection
  if (client.upstreamWs) {
    try {
      client.upstreamWs.close();
    } catch {
      // already closed
    }
    client.upstreamWs = null;
  }

  clients.delete(clientId);
}

// ─── Monitoring ─────────────────────────────────────────────────────────────

export function getConnectedClientCount(): number {
  return clients.size;
}

export function getSessionClients(sessionId: string): number {
  let count = 0;
  for (const client of clients.values()) {
    if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
      count++;
    }
  }
  return count;
}

// ─── Shutdown ───────────────────────────────────────────────────────────────

export function closeAllConnections(): void {
  console.log(`[WS] Closing ${clients.size} client connections...`);
  for (const [clientId, client] of clients.entries()) {
    sendMessage(client.ws, {
      type: 'error',
      code: 'SERVER_SHUTDOWN',
      message: 'Server is shutting down',
    });
    client.ws.close(1001, 'Server shutdown');
    cleanupClient(clientId);
  }
}
