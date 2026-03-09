/**
 * WebSocket Server for Real-time Telemedicine Communication
 *
 * Handles:
 * - Real-time transcript streaming to participants
 * - Meeting signaling events (join, leave, mute/unmute)
 * - Chat messages during consultation
 */

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from './config';
import * as transcriptionSvc from './services/transcription';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  consultationId?: string;
  role?: string;
  isAlive?: boolean;
}

interface WsMessage {
  type: string;
  consultationId?: string;
  data?: unknown;
}

// ─── Room Management ─────────────────────────────────────────────────────────

const rooms = new Map<string, Set<AuthenticatedSocket>>();

function getRoom(consultationId: string): Set<AuthenticatedSocket> {
  if (!rooms.has(consultationId)) {
    rooms.set(consultationId, new Set());
  }
  return rooms.get(consultationId)!;
}

function broadcastToRoom(consultationId: string, message: WsMessage, exclude?: AuthenticatedSocket) {
  const room = rooms.get(consultationId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// ─── WebSocket Server Setup ──────────────────────────────────────────────────

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, callback) => {
      // Extract token from query string
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        callback(false, 401, 'Authentication required');
        return;
      }

      try {
        jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
        callback(true);
      } catch {
        callback(false, 401, 'Invalid token');
      }
    },
  });

  wss.on('connection', (ws: AuthenticatedSocket, req) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as Record<string, unknown>;
      if (typeof decoded.sub !== 'string') {
        ws.close(1008, 'Invalid token claims');
        return;
      }
      ws.userId = decoded.sub;
      ws.role = (decoded['custom:role'] as string) || 'patient';
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as WsMessage;
        handleMessage(ws, message);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      if (ws.consultationId) {
        const room = rooms.get(ws.consultationId);
        if (room) {
          room.delete(ws);
          broadcastToRoom(ws.consultationId, {
            type: 'participant.left',
            consultationId: ws.consultationId,
            data: { userId: ws.userId, role: ws.role },
          });
          if (room.size === 0) rooms.delete(ws.consultationId);
        }
      }
    });

    ws.send(JSON.stringify({
      type: 'connected',
      data: { userId: ws.userId, message: 'Connected to telemedicine service' },
    }));
  });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const authWs = ws as AuthenticatedSocket;
      try {
        if (!authWs.isAlive) {
          authWs.terminate();
          return;
        }
        authWs.isAlive = false;
        authWs.ping();
      } catch (err) {
        console.error('[WebSocket] Heartbeat error:', err);
      }
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[WebSocket] Telemedicine WebSocket server initialized');
  return wss;
}

// ─── Message Handlers ────────────────────────────────────────────────────────

function handleMessage(ws: AuthenticatedSocket, message: WsMessage) {
  switch (message.type) {
    case 'join': {
      const consultationId = message.consultationId;
      if (!consultationId) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'consultationId required' } }));
        return;
      }
      ws.consultationId = consultationId;
      const room = getRoom(consultationId);
      room.add(ws);

      // Notify others
      broadcastToRoom(consultationId, {
        type: 'participant.joined',
        consultationId,
        data: { userId: ws.userId, role: ws.role },
      }, ws);

      // Send current participant list
      const participants = Array.from(room).map((c) => ({
        userId: c.userId,
        role: c.role,
      }));
      ws.send(JSON.stringify({
        type: 'room.state',
        consultationId,
        data: { participants },
      }));
      break;
    }

    case 'leave': {
      if (ws.consultationId) {
        const room = rooms.get(ws.consultationId);
        if (room) {
          room.delete(ws);
          broadcastToRoom(ws.consultationId, {
            type: 'participant.left',
            consultationId: ws.consultationId,
            data: { userId: ws.userId, role: ws.role },
          });
        }
        ws.consultationId = undefined;
      }
      break;
    }

    case 'chat': {
      if (!ws.consultationId) return;
      broadcastToRoom(ws.consultationId, {
        type: 'chat.message',
        consultationId: ws.consultationId,
        data: {
          userId: ws.userId,
          role: ws.role,
          message: (message.data as Record<string, unknown>)?.message,
          timestamp: new Date().toISOString(),
        },
      });
      break;
    }

    case 'transcript': {
      // Real-time transcript segment from transcription service
      if (!ws.consultationId) return;
      broadcastToRoom(ws.consultationId, {
        type: 'transcript.segment',
        consultationId: ws.consultationId,
        data: message.data,
      });
      break;
    }

    case 'signal': {
      // WebRTC signaling (offer, answer, ice-candidate)
      if (!ws.consultationId) return;
      const targetUserId = (message.data as Record<string, unknown>)?.targetUserId;
      if (targetUserId) {
        const room = rooms.get(ws.consultationId);
        if (room) {
          for (const client of room) {
            if (client.userId === targetUserId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'signal',
                consultationId: ws.consultationId,
                data: { ...(message.data as Record<string, unknown>), fromUserId: ws.userId },
              }));
            }
          }
        }
      }
      break;
    }

    case 'vitals.update': {
      // Nurse sends live vitals update during consultation
      if (!ws.consultationId) return;
      broadcastToRoom(ws.consultationId, {
        type: 'vitals.update',
        consultationId: ws.consultationId,
        data: { ...(message.data as Record<string, unknown>), updatedBy: ws.userId },
      });
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'error', data: { message: `Unknown message type: ${message.type}` } }));
  }
}
