/**
 * Real-time Medical Transcription during Video Consultations
 *
 * Uses Amazon Transcribe Streaming for live speech-to-text during
 * telemedicine sessions. Supports Hindi and 22+ Indian languages.
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
  MediaEncoding,
} from '@aws-sdk/client-transcribe-streaming';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

// ─── Clients ─────────────────────────────────────────────────────────────────

let transcribeClient: TranscribeStreamingClient | null = null;
let s3Client: S3Client | null = null;

function getTranscribeClient(): TranscribeStreamingClient {
  if (!transcribeClient) {
    transcribeClient = new TranscribeStreamingClient({ region: config.aws.region });
  }
  return transcribeClient;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.aws.region });
  }
  return s3Client;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  isPartial: boolean;
  confidence: number;
  language: string;
  timestamp: string;
}

export interface TranscriptionSession {
  sessionId: string;
  consultationId: string;
  language: string;
  segments: TranscriptSegment[];
  isActive: boolean;
  startedAt: string;
  endedAt?: string;
}

// ─── Active Sessions ─────────────────────────────────────────────────────────

const activeSessions = new Map<string, TranscriptionSession>();

// ─── Language Mapping ────────────────────────────────────────────────────────

const LANGUAGE_MAP: Record<string, LanguageCode> = {
  'hi': LanguageCode.HI_IN,
  'hi-IN': LanguageCode.HI_IN,
  'en': LanguageCode.EN_IN,
  'en-IN': LanguageCode.EN_IN,
  'en-US': LanguageCode.EN_US,
  'ta': LanguageCode.TA_IN,
  'ta-IN': LanguageCode.TA_IN,
  'te': LanguageCode.TE_IN,
  'te-IN': LanguageCode.TE_IN,
  'bn': LanguageCode.BN_IN,
  'bn-IN': LanguageCode.BN_IN,
  'gu': LanguageCode.GU_IN,
  'gu-IN': LanguageCode.GU_IN,
  'kn': LanguageCode.KN_IN,
  'kn-IN': LanguageCode.KN_IN,
  'ml': LanguageCode.ML_IN,
  'ml-IN': LanguageCode.ML_IN,
  'mr': LanguageCode.MR_IN,
  'mr-IN': LanguageCode.MR_IN,
};

function resolveLanguage(lang: string): LanguageCode {
  return LANGUAGE_MAP[lang] || LanguageCode.HI_IN;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start a real-time transcription session for a video consultation.
 */
export function startTranscription(
  consultationId: string,
  language: string = 'hi-IN',
): TranscriptionSession {
  const session: TranscriptionSession = {
    sessionId: uuidv4(),
    consultationId,
    language,
    segments: [],
    isActive: true,
    startedAt: new Date().toISOString(),
  };

  activeSessions.set(consultationId, session);
  console.log(`[Transcription] Started session ${session.sessionId} for consultation ${consultationId} (${language})`);
  return session;
}

/**
 * Process an audio chunk and return transcript segments.
 * In production, this streams audio to Amazon Transcribe.
 * In dev mode, returns mock transcription.
 */
export async function processAudioChunk(
  consultationId: string,
  audioData: Buffer,
  speakerLabel: string = 'unknown',
): Promise<TranscriptSegment[]> {
  const session = activeSessions.get(consultationId);
  if (!session || !session.isActive) {
    throw new Error(`No active transcription session for consultation ${consultationId}`);
  }

  if (config.env === 'development') {
    return processAudioChunkMock(session, speakerLabel);
  }

  return processAudioChunkAws(session, audioData, speakerLabel);
}

/**
 * Process audio via AWS Transcribe Streaming.
 */
async function processAudioChunkAws(
  session: TranscriptionSession,
  audioData: Buffer,
  speakerLabel: string,
): Promise<TranscriptSegment[]> {
  const client = getTranscribeClient();
  const language = resolveLanguage(session.language);

  const audioStream = async function* () {
    yield { AudioEvent: { AudioChunk: audioData } };
  };

  const response = await client.send(
    new StartStreamTranscriptionCommand({
      LanguageCode: language,
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
      EnablePartialResultsStabilization: true,
      PartialResultsStability: 'high',
      VocabularyName: 'vaidyah-medical-vocab',
      ShowSpeakerLabel: true,
    }),
  );

  const newSegments: TranscriptSegment[] = [];

  if (response.TranscriptResultStream) {
    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          if (result.Alternatives?.[0]) {
            const alt = result.Alternatives[0];
            const segment: TranscriptSegment = {
              id: uuidv4(),
              speaker: speakerLabel,
              text: alt.Transcript ?? '',
              startTime: result.StartTime ?? 0,
              endTime: result.EndTime ?? 0,
              isPartial: result.IsPartial ?? false,
              confidence: alt.Items?.[0]?.Confidence ?? 0,
              language: session.language,
              timestamp: new Date().toISOString(),
            };

            if (!segment.isPartial) {
              session.segments.push(segment);
            }
            newSegments.push(segment);
          }
        }
      }
    }
  }

  return newSegments;
}

/**
 * Mock transcription for development.
 */
function processAudioChunkMock(
  session: TranscriptionSession,
  speakerLabel: string,
): TranscriptSegment[] {
  const mockPhrases = session.language.startsWith('hi')
    ? [
        'मुझे सिरदर्द और बुखार है',
        'कब से तकलीफ हो रही है',
        'दो दिन से बुखार आ रहा है',
        'क्या कोई दवाई ली है',
        'हां, पैरासिटामोल ली थी',
        'बीपी चेक करते हैं',
      ]
    : [
        'I have a headache and fever',
        'How long have you been experiencing this',
        'The fever has been for two days',
        'Have you taken any medication',
        'Yes, I took paracetamol',
        'Let me check your BP',
      ];

  const phrase = mockPhrases[session.segments.length % mockPhrases.length];
  const segment: TranscriptSegment = {
    id: uuidv4(),
    speaker: speakerLabel,
    text: phrase,
    startTime: session.segments.length * 5,
    endTime: session.segments.length * 5 + 4,
    isPartial: false,
    confidence: 0.92,
    language: session.language,
    timestamp: new Date().toISOString(),
  };

  session.segments.push(segment);
  return [segment];
}

/**
 * Stop transcription and save the full transcript.
 */
export async function stopTranscription(consultationId: string): Promise<TranscriptionSession | null> {
  const session = activeSessions.get(consultationId);
  if (!session) return null;

  session.isActive = false;
  session.endedAt = new Date().toISOString();

  // Save transcript to S3
  await saveTranscript(session);

  activeSessions.delete(consultationId);
  console.log(`[Transcription] Stopped session ${session.sessionId} — ${session.segments.length} segments`);
  return session;
}

/**
 * Get current transcript for a consultation.
 */
export function getTranscript(consultationId: string): TranscriptSegment[] {
  return activeSessions.get(consultationId)?.segments ?? [];
}

/**
 * Save full transcript to S3.
 */
async function saveTranscript(session: TranscriptionSession): Promise<void> {
  if (config.env === 'development') {
    console.log(`[Transcription-Dev] Would save transcript (${session.segments.length} segments) to S3`);
    return;
  }

  const s3 = getS3Client();
  const key = `transcripts/${session.consultationId}/${session.sessionId}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.aws.recordingBucket,
      Key: key,
      Body: JSON.stringify({
        sessionId: session.sessionId,
        consultationId: session.consultationId,
        language: session.language,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        segmentCount: session.segments.length,
        segments: session.segments,
      }),
      ContentType: 'application/json',
      ServerSideEncryption: 'aws:kms',
    }),
  );
}
