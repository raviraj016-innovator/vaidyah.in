import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
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

export const config = {
  // ─── Server ──────────────────────────────────────────────────────────────
  server: {
    port: optionalIntEnv('PORT', 3002),
    host: optionalEnv('HOST', '0.0.0.0'),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    corsOrigins: optionalEnv('CORS_ORIGINS', '*').split(','),
    serviceName: 'integration-service',
  },

  // ─── Database ────────────────────────────────────────────────────────────
  database: {
    host: optionalEnv('DB_HOST', 'localhost'),
    port: optionalIntEnv('DB_PORT', 5432),
    name: requireEnv('DB_NAME', 'vaidyah_integration'),
    user: requireEnv('DB_USER', 'vaidyah'),
    password: requireEnv('DB_PASSWORD', 'vaidyah_dev'),
    maxPoolSize: optionalIntEnv('DB_POOL_SIZE', 20),
    idleTimeout: optionalIntEnv('DB_IDLE_TIMEOUT', 30000),
    connectionTimeout: optionalIntEnv('DB_CONNECTION_TIMEOUT', 5000),
    ssl: optionalEnv('DB_SSL', 'false') === 'true',
  },

  // ─── Redis ───────────────────────────────────────────────────────────────
  redis: {
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: optionalIntEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: optionalIntEnv('REDIS_DB', 2),
    keyPrefix: 'vaidyah:integration:',
  },

  // ─── JWT ─────────────────────────────────────────────────────────────────
  jwt: {
    secret: requireEnv('JWT_SECRET', 'vaidyah-dev-jwt-secret-change-in-production'),
    issuer: optionalEnv('JWT_ISSUER', 'vaidyah-api-gateway'),
    audience: optionalEnv('JWT_AUDIENCE', 'vaidyah-services'),
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
    clientId: requireEnv('ABDM_CLIENT_ID', 'SBX_004567'),
    clientSecret: requireEnv('ABDM_CLIENT_SECRET', 'sandbox-secret-change-in-prod'),

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
    phoneNumberId: requireEnv('WHATSAPP_PHONE_NUMBER_ID', 'sandbox-phone-number-id'),
    businessAccountId: requireEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', 'sandbox-business-account-id'),
    accessToken: requireEnv('WHATSAPP_ACCESS_TOKEN', 'sandbox-access-token'),
    webhookVerifyToken: requireEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'vaidyah-webhook-verify-token'),
    appSecret: requireEnv('WHATSAPP_APP_SECRET', 'sandbox-app-secret'),

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
      clientId: requireEnv('GOOGLE_FIT_CLIENT_ID', 'google-fit-sandbox-client-id'),
      clientSecret: requireEnv('GOOGLE_FIT_CLIENT_SECRET', 'google-fit-sandbox-client-secret'),
      tokenUrl: optionalEnv('GOOGLE_FIT_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
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
    trialServiceUrl: optionalEnv('TRIAL_SERVICE_URL', 'http://trial-service:3003'),
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
