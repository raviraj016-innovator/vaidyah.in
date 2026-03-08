import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${value}`);
  }
  return parsed;
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

export const config = {
  // ─── Server ──────────────────────────────────────────────────────────────
  server: {
    port: optionalIntEnv('PORT', 3002),
    host: optionalEnv('HOST', '0.0.0.0'),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    corsOrigins: optionalEnv('CORS_ORIGINS', 'http://localhost:3000').split(',').map(s => s.trim()),
    serviceName: 'integration-service',
  },

  // ─── Database ────────────────────────────────────────────────────────────
  database: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: optionalIntEnv('DB_PORT', 5432),
    name: requireEnv('DB_NAME', 'vaidyah'),
    user: requireEnv('DB_USER', 'vaidyah'),
    password: prodRequireEnv('DB_PASSWORD', ''),
    maxPoolSize: optionalIntEnv('DB_POOL_SIZE', 20),
    idleTimeout: optionalIntEnv('DB_IDLE_TIMEOUT', 30000),
    connectionTimeout: optionalIntEnv('DB_CONNECTION_TIMEOUT', 5000),
    ssl: isProd || optionalEnv('DB_SSL', 'false') === 'true',
  },

  // ─── Redis ───────────────────────────────────────────────────────────────
  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: optionalIntEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: optionalIntEnv('REDIS_DB', 2),
    keyPrefix: 'vaidyah:integration:',
  },

  // ─── Cognito ────────────────────────────────────────────────────────────
  cognito: {
    userPoolId: prodRequireEnv('COGNITO_USER_POOL_ID', 'ap-south-1_devPool'),
    clientId: prodRequireEnv('COGNITO_CLIENT_ID', 'dev-client-id'),
    region: optionalEnv('AWS_REGION', 'ap-south-1'),
  },

  // ─── JWT (dev fallback) ───────────────────────────────────────────────
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET environment variable is required');
      return secret;
    })(),
    issuer: optionalEnv('JWT_ISSUER', 'vaidyah-auth'),
    audience: optionalEnv('JWT_AUDIENCE', 'vaidyah-services'),
  },

  // ─── Encryption ───────────────────────────────────────────────────────
  encryption: {
    key: prodRequireEnv('ENCRYPTION_KEY', ''),
  },

  // ─── ABDM (Ayushman Bharat Digital Mission) ──────────────────────────────
  abdm: {
    // Sandbox gateway URLs
    gatewayUrl: optionalEnv('ABDM_GATEWAY_URL', 'https://dev.abdm.gov.in/gateway'),
    authUrl: optionalEnv('ABDM_AUTH_URL', 'https://dev.ndhm.gov.in/auth/realms/devndhm/protocol/openid-connect/token'),
    healthInfoUrl: optionalEnv('ABDM_HI_URL', 'https://dev.abdm.gov.in/hiu'),
    consentManagerUrl: optionalEnv('ABDM_CM_URL', 'https://dev.abdm.gov.in/cm'),
    healthIdUrl: optionalEnv('ABDM_HEALTH_ID_URL', 'https://healthidsbx.abdm.gov.in/api'),

    // Credentials
    clientId: prodRequireEnv('ABDM_CLIENT_ID', ''),
    clientSecret: prodRequireEnv('ABDM_CLIENT_SECRET', ''),

    // HIP (Health Information Provider) details
    hipId: requireEnv('ABDM_HIP_ID', 'vaidyah-hip-001'),
    hipName: optionalEnv('ABDM_HIP_NAME', 'Vaidyah Health Platform'),

    // HIU (Health Information User) details
    hiuId: requireEnv('ABDM_HIU_ID', 'vaidyah-hiu-001'),
    hiuName: optionalEnv('ABDM_HIU_NAME', 'Vaidyah Health Platform'),

    // Callback URLs
    callbackBaseUrl: requireEnv('ABDM_CALLBACK_BASE_URL', 'https://api.vaidyah.health/integration'),

    // Token cache TTL (in seconds)
    tokenCacheTtl: optionalIntEnv('ABDM_TOKEN_CACHE_TTL', 1500), // 25 minutes (token valid for 30 min)

    // Timeouts
    requestTimeout: optionalIntEnv('ABDM_REQUEST_TIMEOUT', 30000),
  },

  // ─── WhatsApp Business API ───────────────────────────────────────────────
  whatsapp: {
    apiUrl: optionalEnv('WHATSAPP_API_URL', 'https://graph.facebook.com/v18.0'),
    phoneNumberId: prodRequireEnv('WHATSAPP_PHONE_NUMBER_ID', ''),
    businessAccountId: prodRequireEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', ''),
    accessToken: prodRequireEnv('WHATSAPP_ACCESS_TOKEN', ''),
    webhookVerifyToken: prodRequireEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', ''),
    appSecret: prodRequireEnv('WHATSAPP_APP_SECRET', ''),

    // Rate limiting
    messagesPerSecond: optionalIntEnv('WHATSAPP_RATE_LIMIT', 80),
    templateMessagesPerDay: optionalIntEnv('WHATSAPP_TEMPLATE_DAILY_LIMIT', 1000),

    // Retry configuration
    maxRetries: optionalIntEnv('WHATSAPP_MAX_RETRIES', 3),
    retryDelay: optionalIntEnv('WHATSAPP_RETRY_DELAY', 2000),
  },

  // ─── Wearable APIs ──────────────────────────────────────────────────────
  wearables: {
    appleHealth: {
      serverUrl: optionalEnv('APPLE_HEALTH_SERVER_URL', 'https://api.apple-health-proxy.vaidyah.health'),
      teamId: process.env.APPLE_TEAM_ID,
      serviceId: process.env.APPLE_SERVICE_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
    },
    googleFit: {
      apiUrl: optionalEnv('GOOGLE_FIT_API_URL', 'https://www.googleapis.com/fitness/v1'),
      clientId: prodRequireEnv('GOOGLE_FIT_CLIENT_ID', ''),
      clientSecret: prodRequireEnv('GOOGLE_FIT_CLIENT_SECRET', ''),
      tokenUrl: optionalEnv('GOOGLE_FIT_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
    },
    fitbit: {
      apiUrl: optionalEnv('FITBIT_API_URL', 'https://api.fitbit.com/1/user/-'),
      clientId: prodRequireEnv('FITBIT_CLIENT_ID', ''),
      clientSecret: prodRequireEnv('FITBIT_CLIENT_SECRET', ''),
      tokenUrl: optionalEnv('FITBIT_TOKEN_URL', 'https://api.fitbit.com/oauth2/token'),
      authUrl: optionalEnv('FITBIT_AUTH_URL', 'https://www.fitbit.com/oauth2/authorize'),
    },
    // Sync configuration
    syncIntervalMinutes: optionalIntEnv('WEARABLE_SYNC_INTERVAL', 30),
    dataRetentionDays: optionalIntEnv('WEARABLE_DATA_RETENTION_DAYS', 365),
  },

  // ─── Notification Scheduler ──────────────────────────────────────────────
  scheduler: {
    medicationReminderTimes: optionalEnv('MED_REMINDER_TIMES', '08:00,14:00,20:00').split(','),
    followUpReminderHoursBefore: optionalIntEnv('FOLLOWUP_REMINDER_HOURS', 24),
    healthAlertCheckIntervalHours: optionalIntEnv('HEALTH_ALERT_CHECK_HOURS', 6),
    weeklySummaryDay: optionalIntEnv('WEEKLY_SUMMARY_DAY', 0), // 0 = Sunday
    weeklySummaryHour: optionalIntEnv('WEEKLY_SUMMARY_HOUR', 9),
    timezone: optionalEnv('SCHEDULER_TIMEZONE', 'Asia/Kolkata'),
  },

  // ─── Internal Service URLs ───────────────────────────────────────────────
  services: {
    clinicalServiceUrl: optionalEnv('CLINICAL_SERVICE_URL', 'http://clinical-service:3001'),
    trialServiceUrl: optionalEnv('TRIAL_SERVICE_URL', 'http://trial-service:8003'),
    apiGatewayUrl: optionalEnv('API_GATEWAY_URL', 'http://api-gateway:3000'),
  },

  // ─── Logging ─────────────────────────────────────────────────────────────
  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    format: optionalEnv('LOG_FORMAT', 'combined'),
  },
} as const;

export type Config = typeof config;
export default config;
