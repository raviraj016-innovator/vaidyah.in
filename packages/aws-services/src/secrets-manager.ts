/**
 * AWS Secrets Manager Integration
 *
 * Fetches application secrets from Secrets Manager at startup.
 * Falls back to environment variables in development.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  UpdateSecretCommand,
  ListSecretsCommand,
} from '@aws-sdk/client-secrets-manager';
import { getAwsConfig, isServiceAvailable } from './config';

// ─── Client ──────────────────────────────────────────────────────────────────

let smClient: SecretsManagerClient | null = null;

function getClient(): SecretsManagerClient {
  if (!smClient) {
    const config = getAwsConfig();
    smClient = new SecretsManagerClient({ region: config.region });
  }
  return smClient;
}

const SECRET_PREFIX = process.env.AWS_SECRETS_PREFIX || 'vaidyah';

// ─── Secret cache (avoids repeated API calls) ───────────────────────────────

const secretCache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a secret value by name. Uses cache to avoid repeated API calls.
 * In development without Secrets Manager, falls back to environment variables.
 */
export async function getSecret(secretName: string): Promise<string> {
  const fullName = `${SECRET_PREFIX}/${secretName}`;

  // Check cache first
  const cached = secretCache.get(fullName);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  if (!isServiceAvailable('secrets-manager')) {
    return getSecretFromEnv(secretName);
  }

  try {
    const client = getClient();
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: fullName }),
    );

    const value = response.SecretString ?? '';
    secretCache.set(fullName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[SecretsManager] Failed to fetch secret "${fullName}":`, error.message);
    // Fall back to environment variable
    return getSecretFromEnv(secretName);
  }
}

/**
 * Fetch a JSON secret and parse it. Returns the parsed object.
 */
export async function getJsonSecret<T = Record<string, string>>(secretName: string): Promise<T> {
  const raw = await getSecret(secretName);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid JSON in secret "${secretName}"`);
  }
}

/**
 * Load all application secrets at startup.
 * Returns a map of secret names to values.
 */
export async function loadAllSecrets(): Promise<Record<string, string>> {
  if (!isServiceAvailable('secrets-manager')) {
    console.warn('[SecretsManager] Not configured — using environment variables');
    return {};
  }

  const client = getClient();
  const secrets: Record<string, string> = {};

  try {
    const listResponse = await client.send(
      new ListSecretsCommand({
        Filters: [{ Key: 'name', Values: [`${SECRET_PREFIX}/`] }],
        MaxResults: 100,
      }),
    );

    for (const secret of listResponse.SecretList ?? []) {
      if (secret.Name) {
        try {
          const value = await getSecret(secret.Name.replace(`${SECRET_PREFIX}/`, ''));
          const shortName = secret.Name.replace(`${SECRET_PREFIX}/`, '');
          secrets[shortName] = value;
        } catch {
          // Skip individual secret failures
        }
      }
    }

    console.log(`[SecretsManager] Loaded ${Object.keys(secrets).length} secrets`);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[SecretsManager] Failed to list secrets:', error.message);
  }

  return secrets;
}

/**
 * Create or update a secret. Used by admin operations.
 */
export async function putSecret(secretName: string, value: string): Promise<void> {
  if (!isServiceAvailable('secrets-manager')) {
    console.warn(`[SecretsManager] Not configured — cannot store secret "${secretName}"`);
    return;
  }

  const fullName = `${SECRET_PREFIX}/${secretName}`;
  const client = getClient();

  try {
    await client.send(
      new UpdateSecretCommand({
        SecretId: fullName,
        SecretString: value,
      }),
    );
  } catch {
    // Secret doesn't exist yet — create it
    await client.send(
      new CreateSecretCommand({
        Name: fullName,
        SecretString: value,
        Description: `Vaidyah application secret: ${secretName}`,
        Tags: [
          { Key: 'Application', Value: 'vaidyah' },
          { Key: 'ManagedBy', Value: 'vaidyah-platform' },
        ],
      }),
    );
  }

  // Update cache
  secretCache.set(fullName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate cached secret (force re-fetch on next access).
 */
export function invalidateSecret(secretName: string): void {
  secretCache.delete(`${SECRET_PREFIX}/${secretName}`);
}

// ─── Environment Variable Fallback ──────────────────────────────────────────

const ENV_MAP: Record<string, string> = {
  'db/password': 'DB_PASSWORD',
  'db/host': 'DB_HOST',
  'redis/password': 'REDIS_PASSWORD',
  'jwt/secret': 'JWT_SECRET',
  'cognito/user-pool-id': 'COGNITO_USER_POOL_ID',
  'cognito/client-id': 'COGNITO_AUDIENCE',
  'abdm/client-id': 'ABDM_CLIENT_ID',
  'abdm/client-secret': 'ABDM_CLIENT_SECRET',
  'whatsapp/api-token': 'WHATSAPP_API_TOKEN',
  'whatsapp/phone-number-id': 'WHATSAPP_PHONE_NUMBER_ID',
  'bedrock/ml-model-id': 'BEDROCK_ML_MODEL_ID',
};

function getSecretFromEnv(secretName: string): string {
  const envKey = ENV_MAP[secretName];
  if (envKey) {
    return process.env[envKey] ?? '';
  }
  // Try uppercase with underscores: "db/password" -> "DB_PASSWORD"
  const autoKey = secretName.replace(/[/-]/g, '_').toUpperCase();
  return process.env[autoKey] ?? '';
}
