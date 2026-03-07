/**
 * Centralized configuration loaded from environment variables with typed defaults.
 * Every config value is validated on startup.
 */

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxConnections: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
  ssl: boolean;
}

interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  keyPrefix: string;
  maxRetriesPerRequest: number;
  connectTimeout: number;
  tls: boolean;
}

interface CognitoConfig {
  userPoolId: string;
  region: string;
  jwksUri: string;
  issuer: string;
  audience: string;
  tokenExpiry: number;
}

interface ServiceEndpointConfig {
  voiceService: string;
  clinicalService: string;
  nluService: string;
  trialService: string;
  integrationService: string;
}

interface RateLimitConfig {
  patient: number;
  nurse: number;
  doctor: number;
  admin: number;
  default: number;
  windowMs: number;
}

interface CorsConfig {
  origins: string[];
  credentials: boolean;
}

interface ServerConfig {
  port: number;
  env: string;
  logLevel: string;
  requestTimeoutMs: number;
  shutdownTimeoutMs: number;
  bodyLimitBytes: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  cognito: CognitoConfig;
  services: ServiceEndpointConfig;
  rateLimit: RateLimitConfig;
  cors: CorsConfig;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: "${raw}"`);
  }
  return parsed;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const isProd = process.env.NODE_ENV === 'production';

function prodRequireEnv(key: string, devFallback: string): string {
  if (isProd) {
    const v = process.env[key];
    if (!v) throw new Error('Missing required env var: ' + key);
    return v;
  }
  return process.env[key] ?? devFallback;
}

const cognitoRegion = envStr('COGNITO_REGION', 'ap-south-1');
const cognitoUserPoolId = isProd
  ? prodRequireEnv('COGNITO_USER_POOL_ID', '')
  : envStr('COGNITO_USER_POOL_ID', '');

const config: AppConfig = {
  server: {
    port: envInt('PORT', 3000),
    env: envStr('NODE_ENV', 'development'),
    logLevel: envStr('LOG_LEVEL', 'info'),
    requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30000),
    shutdownTimeoutMs: envInt('SHUTDOWN_TIMEOUT_MS', 15000),
    bodyLimitBytes: envStr('BODY_LIMIT', '5mb'),
  },

  database: {
    host: envStr('DB_HOST', 'localhost'),
    port: envInt('DB_PORT', 5432),
    database: envStr('DB_NAME', 'vaidyah'),
    user: envStr('DB_USER', 'vaidyah'),
    password: prodRequireEnv('DB_PASSWORD', ''),
    maxConnections: envInt('DB_MAX_CONNECTIONS', 20),
    idleTimeoutMs: envInt('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMs: envInt('DB_CONNECTION_TIMEOUT_MS', 5000),
    ssl: envBool('DB_SSL', isProd),
  },

  redis: {
    host: envStr('REDIS_HOST', 'localhost'),
    port: envInt('REDIS_PORT', 6379),
    password: prodRequireEnv('REDIS_PASSWORD', ''),
    db: envInt('REDIS_DB', 0),
    keyPrefix: envStr('REDIS_KEY_PREFIX', 'vaidyah:gw:'),
    maxRetriesPerRequest: envInt('REDIS_MAX_RETRIES', 3),
    connectTimeout: envInt('REDIS_CONNECT_TIMEOUT', 5000),
    tls: envBool('REDIS_TLS', isProd),
  },

  cognito: {
    userPoolId: cognitoUserPoolId,
    region: cognitoRegion,
    jwksUri: cognitoUserPoolId
      ? `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}/.well-known/jwks.json`
      : '',
    issuer: cognitoUserPoolId
      ? `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}`
      : '',
    audience: isProd ? prodRequireEnv('COGNITO_AUDIENCE', '') : envStr('COGNITO_AUDIENCE', ''),
    tokenExpiry: envInt('TOKEN_EXPIRY_SECONDS', 3600),
  },

  services: {
    voiceService: envStr('VOICE_SERVICE_URL', 'http://voice-service:8001'),
    clinicalService: envStr('CLINICAL_SERVICE_URL', 'http://clinical-service:3001'),
    nluService: envStr('NLU_SERVICE_URL', 'http://nlu-service:8002'),
    trialService: envStr('TRIAL_SERVICE_URL', 'http://trial-service:8003'),
    integrationService: envStr('INTEGRATION_SERVICE_URL', 'http://integration-service:3002'),
  },

  rateLimit: {
    patient: envInt('RATE_LIMIT_PATIENT', 50),
    nurse: envInt('RATE_LIMIT_NURSE', 100),
    doctor: envInt('RATE_LIMIT_DOCTOR', 150),
    admin: envInt('RATE_LIMIT_ADMIN', 200),
    default: envInt('RATE_LIMIT_DEFAULT', 50),
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000),
  },

  cors: {
    origins: envList('CORS_ORIGINS', ['http://localhost:3000', 'http://localhost:5173']),
    credentials: envBool('CORS_CREDENTIALS', true),
  },
};

export default config;
