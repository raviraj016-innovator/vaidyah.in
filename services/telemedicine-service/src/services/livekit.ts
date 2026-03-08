/**
 * LiveKit Video Consultation Service
 *
 * Creates and manages video rooms for nurse/doctor-patient consultations.
 * Uses LiveKit Server SDK for room management and access token generation.
 * In dev mode without LiveKit configured, returns mock data.
 */

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoomInfo {
  roomName: string;
  sid: string;
  numParticipants: number;
  maxParticipants: number;
  createdAt: number;
}

export interface ParticipantToken {
  token: string;
  identity: string;
  roomName: string;
}

export interface TeleconsultSession {
  roomInfo: RoomInfo;
  participants: Array<{
    identity: string;
    role: string;
    joinToken: string;
  }>;
  consultationId: string;
  createdAt: string;
  status: 'waiting' | 'active' | 'ended';
}

// ─── Client ──────────────────────────────────────────────────────────────────

function getRoomService(): RoomServiceClient {
  return new RoomServiceClient(
    config.livekit.host,
    config.livekit.apiKey,
    config.livekit.apiSecret,
  );
}

const isLiveKitAvailable = (): boolean =>
  !!config.livekit.apiKey && config.livekit.apiKey !== '';

// ─── Token Generation ────────────────────────────────────────────────────────

async function createAccessToken(
  identity: string,
  roomName: string,
  role: string,
): Promise<string> {
  const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: identity,
    metadata: JSON.stringify({ role }),
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // Token expires in 6 hours (enough for a long consultation)
  token.ttl = '6h';

  return await token.toJwt();
}

// ─── Meeting Store (in-memory for dev, DynamoDB in production) ───────────────

const activeMeetings = new Map<string, TeleconsultSession>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new video consultation room.
 */
export async function createMeeting(
  consultationId: string,
  hostUserId: string,
): Promise<TeleconsultSession> {
  const roomName = `vaidyah-${consultationId}`;

  if (!isLiveKitAvailable()) {
    return createMockMeeting(consultationId, hostUserId);
  }

  const roomService = getRoomService();

  // Create the LiveKit room
  const room = await roomService.createRoom({
    name: roomName,
    emptyTimeout: 600, // 10 minutes before empty room is cleaned up
    maxParticipants: 10,
    metadata: JSON.stringify({
      consultationId,
      application: 'vaidyah',
    }),
  });

  // Generate join token for the host
  const hostToken = await createAccessToken(hostUserId, roomName, 'host');

  const session: TeleconsultSession = {
    roomInfo: {
      roomName: room.name,
      sid: room.sid,
      numParticipants: 0,
      maxParticipants: room.maxParticipants,
      createdAt: Number(room.creationTime),
    },
    participants: [
      {
        identity: hostUserId,
        role: 'host',
        joinToken: hostToken,
      },
    ],
    consultationId,
    createdAt: new Date().toISOString(),
    status: 'waiting',
  };

  activeMeetings.set(consultationId, session);
  console.log(`[LiveKit] Created room "${roomName}" for consultation ${consultationId}`);
  return session;
}

/**
 * Add a participant (patient, doctor, nurse, interpreter) to a consultation.
 */
export async function addAttendee(
  consultationId: string,
  userId: string,
  role: 'patient' | 'doctor' | 'nurse' | 'interpreter',
): Promise<{ identity: string; role: string; joinToken: string }> {
  const session = activeMeetings.get(consultationId);
  if (!session) throw new Error(`No active meeting for consultation ${consultationId}`);

  const roomName = session.roomInfo.roomName;

  if (!isLiveKitAvailable()) {
    const participant = {
      identity: userId,
      role,
      joinToken: `dev-livekit-token-${userId}-${Date.now()}`,
    };
    session.participants.push(participant);
    session.status = 'active';
    return participant;
  }

  const token = await createAccessToken(userId, roomName, role);

  const participant = {
    identity: userId,
    role,
    joinToken: token,
  };

  session.participants.push(participant);
  session.status = 'active';
  return participant;
}

/**
 * End a video consultation room.
 */
export async function endMeeting(consultationId: string): Promise<void> {
  const session = activeMeetings.get(consultationId);
  if (!session) return;

  if (isLiveKitAvailable()) {
    const roomService = getRoomService();
    try {
      await roomService.deleteRoom(session.roomInfo.roomName);
    } catch {
      // Room may have already been cleaned up
    }
  }

  session.status = 'ended';
  activeMeetings.delete(consultationId);
  console.log(`[LiveKit] Ended room for consultation ${consultationId}`);
}

/**
 * Get meeting status.
 */
export async function getMeetingStatus(consultationId: string): Promise<TeleconsultSession | null> {
  const session = activeMeetings.get(consultationId) ?? null;

  // If LiveKit is available, refresh participant count
  if (session && isLiveKitAvailable()) {
    try {
      const roomService = getRoomService();
      const participants = await roomService.listParticipants(session.roomInfo.roomName);
      session.roomInfo.numParticipants = participants.length;
    } catch {
      // Room may not exist anymore
    }
  }

  return session;
}

/**
 * List participants of a meeting.
 */
export async function listAttendees(
  consultationId: string,
): Promise<Array<{ identity: string; role: string; joinToken: string }>> {
  const session = activeMeetings.get(consultationId);
  if (!session) return [];
  return session.participants;
}

/**
 * Generate a fresh join token for a participant (e.g., on reconnect).
 */
export async function generateToken(
  consultationId: string,
  userId: string,
  role: string,
): Promise<string | null> {
  const session = activeMeetings.get(consultationId);
  if (!session) return null;

  if (!isLiveKitAvailable()) {
    return `dev-livekit-token-${userId}-${Date.now()}`;
  }

  return await createAccessToken(userId, session.roomInfo.roomName, role);
}

// ─── Mock Meeting (Development) ──────────────────────────────────────────────

function createMockMeeting(
  consultationId: string,
  hostUserId: string,
): TeleconsultSession {
  const roomName = `vaidyah-${consultationId}`;
  const session: TeleconsultSession = {
    roomInfo: {
      roomName,
      sid: uuidv4(),
      numParticipants: 1,
      maxParticipants: 10,
      createdAt: Date.now(),
    },
    participants: [
      {
        identity: hostUserId,
        role: 'host',
        joinToken: `dev-livekit-token-${hostUserId}-${Date.now()}`,
      },
    ],
    consultationId,
    createdAt: new Date().toISOString(),
    status: 'waiting',
  };

  activeMeetings.set(consultationId, session);
  console.log(`[LiveKit-Dev] Created mock room "${roomName}" for consultation ${consultationId}`);
  return session;
}
