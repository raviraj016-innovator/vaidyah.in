/**
 * AWS Bedrock — ML Inference via Foundation Models
 *
 * Replaces custom SageMaker endpoints with Amazon Bedrock foundation models
 * (Claude 3 Haiku) for prosody analysis, contradiction detection, and trial
 * matching. Pay-per-token pricing keeps costs under $15/month for small groups.
 *
 * NOTE: File retains the sagemaker.ts name to preserve import paths across
 * the monorepo. All exports are backward-compatible.
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { getAwsConfig, isServiceAvailable } from './config';

// ─── Types (unchanged API surface) ──────────────────────────────────────────

export interface InvokeEndpointParams {
  /** Logical model name (e.g. "bedrock-prosody-analysis") */
  endpointName: string;
  /** Request payload */
  body: Record<string, unknown>;
  /** Content type (default: application/json) */
  contentType?: string;
  /** Accept header (default: application/json) */
  accept?: string;
}

export interface EndpointResult<T = Record<string, unknown>> {
  /** Parsed response body */
  data: T;
  /** Inference latency (ms) */
  latencyMs: number;
  /** Inference ID for tracing */
  inferenceId?: string;
}

export interface ModelEndpointStatus {
  endpointName: string;
  status: 'InService' | 'Creating' | 'Updating' | 'Failed' | 'OutOfService' | 'unknown';
  available: boolean;
}

// ─── Model configuration ─────────────────────────────────────────────────────

const BEDROCK_MODEL_ID =
  process.env.BEDROCK_ML_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

export const MODEL_ENDPOINTS = {
  PROSODY_ANALYSIS: 'bedrock-prosody-analysis',
  CONTRADICTION_DETECT: 'bedrock-contradiction-detect',
  TRIAL_MATCHING: 'bedrock-trial-matching',
} as const;

// ─── Client ──────────────────────────────────────────────────────────────────

let _client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    const cfg = getAwsConfig();
    _client = new BedrockRuntimeClient({ region: cfg.region });
  }
  return _client;
}

// ─── Bedrock invocation helper ───────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 512,
): Promise<Record<string, unknown>> {
  const client = getClient();

  const command = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  const response = await client.send(command);
  const bodyStr = response.body
    ? Buffer.from(response.body).toString('utf-8')
    : '{}';
  const result = JSON.parse(bodyStr);
  const text: string = result.content?.[0]?.text ?? '';

  if (!text) return {};

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {};
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Invoke a Bedrock foundation model for ML inference.
 *
 * In development (no BEDROCK_ML_MODEL_ID or AWS credentials), returns a
 * stub response so services can run locally without AWS access.
 */
export async function invokeEndpoint<T = Record<string, unknown>>(
  params: InvokeEndpointParams,
): Promise<EndpointResult<T>> {
  if (!isServiceAvailable('bedrock-ml')) {
    return devFallback<T>(params);
  }

  const start = Date.now();
  let data: Record<string, unknown>;

  if (params.endpointName.includes('prosody')) {
    data = await callClaude(
      PROSODY_SYSTEM_PROMPT,
      JSON.stringify(params.body),
    );
  } else if (params.endpointName.includes('contradiction')) {
    data = await callClaude(
      CONTRADICTION_SYSTEM_PROMPT,
      JSON.stringify(params.body),
    );
  } else if (params.endpointName.includes('trial')) {
    data = await callClaude(
      TRIAL_MATCHING_SYSTEM_PROMPT,
      JSON.stringify(params.body),
    );
  } else {
    data = await callClaude(
      'You are an AI assistant. Respond in JSON format.',
      JSON.stringify(params.body),
    );
  }

  return {
    data: data as T,
    latencyMs: Date.now() - start,
    inferenceId: `bedrock-${Date.now()}`,
  };
}

/**
 * Analyze prosody features using Bedrock Claude.
 * Input: audio features array. Output: emotion probabilities + pain/anxiety scores.
 */
export async function analyzeProsody(audioFeatures: number[][]): Promise<EndpointResult> {
  return invokeEndpoint({
    endpointName: MODEL_ENDPOINTS.PROSODY_ANALYSIS,
    body: { features: audioFeatures },
  });
}

/**
 * Detect contradiction between two statements using Bedrock Claude.
 * Input: two text statements. Output: contradiction probability + explanation.
 */
export async function detectContradiction(
  statement1: string,
  statement2: string,
): Promise<EndpointResult> {
  return invokeEndpoint({
    endpointName: MODEL_ENDPOINTS.CONTRADICTION_DETECT,
    body: { statement1, statement2 },
  });
}

/**
 * Match patient to clinical trial using Bedrock Claude.
 * Input: patient profile + trial criteria. Output: match score + reasons.
 */
export async function matchTrial(
  patientProfile: Record<string, unknown>,
  trialCriteria: Record<string, unknown>,
): Promise<EndpointResult> {
  return invokeEndpoint({
    endpointName: MODEL_ENDPOINTS.TRIAL_MATCHING,
    body: { patient: patientProfile, trial: trialCriteria },
  });
}

// ─── System Prompts ──────────────────────────────────────────────────────────

const PROSODY_SYSTEM_PROMPT = `You are a clinical prosody analysis model. Given audio prosody features (pitch, energy, speaking rate, pauses, jitter, shimmer), output emotional scores.

Return ONLY a JSON object with these fields (all 0.0-1.0):
{
  "emotions": { "calm": N, "pain": N, "anxiety": N, "distress": N, "happy": N, "sad": N, "angry": N, "fear": N },
  "painScore": N,
  "anxietyScore": N,
  "confidence": N
}

Scoring guidelines:
- High pitch variability + fast rate + high energy variability → distress
- Low pitch variability + slow rate + frequent pauses → pain
- Fast rate + hesitations + high pitch + jitter → anxiety
- Low energy + slow rate + long pauses → fatigue/sadness`;

const CONTRADICTION_SYSTEM_PROMPT = `You are a clinical contradiction detection model. Given two medical statements, determine if they contradict each other.

Return ONLY a JSON object:
{
  "contradictionProbability": N (0.0-1.0),
  "isContradiction": boolean,
  "explanation": "brief reason",
  "confidence": N (0.0-1.0)
}

Consider: vital sign mismatches, medication conflicts, symptom timeline inconsistencies, and semantic contradictions.`;

const TRIAL_MATCHING_SYSTEM_PROMPT = `You are a clinical trial matching model. Given a patient profile and trial criteria, score compatibility.

Return ONLY a JSON object:
{
  "matchScore": N (0.0-1.0),
  "eligible": boolean,
  "matchReasons": ["reason1", "reason2", ...],
  "confidence": N (0.0-1.0)
}

Consider: age/gender eligibility, condition overlap, medication conflicts, and trial phase appropriateness.`;

// ─── Dev Fallback ────────────────────────────────────────────────────────────

function devFallback<T>(params: InvokeEndpointParams): EndpointResult<T> {
  console.log(`[Bedrock-Dev] Stub invocation for: ${params.endpointName}`);

  let mockData: Record<string, unknown>;

  if (params.endpointName.includes('prosody')) {
    mockData = {
      emotions: {
        calm: 0.45, pain: 0.12, anxiety: 0.18, distress: 0.08,
        happy: 0.05, sad: 0.07, angry: 0.03, fear: 0.02,
      },
      painScore: 0.12,
      anxietyScore: 0.18,
      confidence: 0.82,
    };
  } else if (params.endpointName.includes('contradiction')) {
    mockData = {
      contradictionProbability: 0.15,
      isContradiction: false,
      explanation: 'No contradiction detected between statements.',
      confidence: 0.88,
    };
  } else if (params.endpointName.includes('trial')) {
    mockData = {
      matchScore: 0.73,
      eligible: true,
      matchReasons: [
        'Age within inclusion range',
        'Primary condition matches',
        'No exclusion criteria met',
      ],
      confidence: 0.79,
    };
  } else {
    mockData = { result: 'dev-stub', input: params.body };
  }

  return {
    data: mockData as T,
    latencyMs: 5 + Math.random() * 15,
    inferenceId: `dev-${Date.now()}`,
  };
}
