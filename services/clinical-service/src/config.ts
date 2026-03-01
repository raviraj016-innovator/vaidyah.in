/**
 * Typed configuration loaded from environment variables.
 * All config values are validated at startup.
 */

import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function intEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${raw}`);
  }
  return parsed;
}

export const config = {
  /** Runtime environment */
  env: optionalEnv('NODE_ENV', 'development'),
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: optionalEnv('NODE_ENV', 'development') === 'production',

  /** Server */
  port: intEnv('PORT', 3001),
  host: optionalEnv('HOST', '0.0.0.0'),

  /** Database */
  database: {
    url: requireEnv('DATABASE_URL', 'postgresql://vaidyah:vaidyah_dev_pwd@localhost:5432/vaidyah'),
    poolMin: intEnv('DB_POOL_MIN', 2),
    poolMax: intEnv('DB_POOL_MAX', 10),
    idleTimeoutMs: intEnv('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMs: intEnv('DB_CONNECTION_TIMEOUT_MS', 5000),
  },

  /** Downstream services */
  services: {
    nluServiceUrl: optionalEnv('NLU_SERVICE_URL', 'http://localhost:8002'),
    apiGatewayUrl: optionalEnv('API_GATEWAY_URL', 'http://localhost:3000'),
    voiceServiceUrl: optionalEnv('VOICE_SERVICE_URL', 'http://localhost:8001'),
  },

  /** AWS Cognito (for JWT validation) */
  cognito: {
    userPoolId: optionalEnv('COGNITO_USER_POOL_ID', ''),
    region: optionalEnv('AWS_REGION', 'ap-south-1'),
    clientId: optionalEnv('COGNITO_CLIENT_ID', ''),
  },

  /** JWT fallback for dev */
  jwt: {
    secret: optionalEnv('JWT_SECRET', 'your-jwt-secret-change-in-production'),
  },

  /** Emergency services */
  emergency: {
    ambulanceServiceUrl: optionalEnv('AMBULANCE_SERVICE_URL', ''),
    smsGatewayUrl: optionalEnv('SMS_GATEWAY_URL', ''),
    smsApiKey: optionalEnv('SMS_API_KEY', ''),
    whatsappApiUrl: optionalEnv('WHATSAPP_API_URL', ''),
    whatsappApiToken: optionalEnv('WHATSAPP_API_TOKEN', ''),
    /** National emergency number - 108 (India ambulance) */
    nationalEmergencyNumber: '108',
  },

  /** Logging */
  log: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    format: optionalEnv('LOG_FORMAT', 'json'),
  },

  /** Request limits */
  limits: {
    maxSymptomsPerCheck: intEnv('MAX_SYMPTOMS_PER_CHECK', 30),
    requestTimeoutMs: intEnv('REQUEST_TIMEOUT_MS', 30000),
    nluTimeoutMs: intEnv('NLU_TIMEOUT_MS', 60000),
  },
} as const;

export type Config = typeof config;
