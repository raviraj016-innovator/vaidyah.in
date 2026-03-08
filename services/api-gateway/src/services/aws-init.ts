/**
 * AWS Services Initialization
 *
 * Initializes AWS service integrations at gateway startup.
 * Budget deployment: KMS, Secrets Manager, SNS, CloudWatch, Bedrock.
 */

const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export interface AwsServicesStatus {
  kms: boolean;
  secretsManager: boolean;
  sns: boolean;
  cloudWatch: boolean;
  bedrock: boolean;
}

/**
 * Initialize AWS services and return their availability status.
 * Call this once at startup.
 */
export async function initializeAwsServices(): Promise<AwsServicesStatus> {
  const status: AwsServicesStatus = {
    kms: !!process.env.KMS_KEY_ID,
    secretsManager: !!process.env.AWS_SECRETS_PREFIX,
    sns: !!process.env.SNS_TOPIC_ARN_PREFIX,
    cloudWatch: !!process.env.CLOUDWATCH_NAMESPACE,
    bedrock: !!process.env.BEDROCK_ML_MODEL_ID || !!process.env.AWS_ACCESS_KEY_ID,
  };

  const available = Object.entries(status)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const unavailable = Object.entries(status)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (IS_PRODUCTION && unavailable.length > 0) {
    console.warn(`[AWS] Production mode — unavailable services: ${unavailable.join(', ')}`);
  }

  if (available.length > 0) {
    console.log(`[AWS] Initialized services: ${available.join(', ')}`);
  } else {
    console.log(`[AWS] No AWS services configured — using local development fallbacks`);
  }

  return status;
}

/**
 * Get summary for system health endpoint.
 */
export function getAwsServicesSummary(): Record<string, string> {
  return {
    region: AWS_REGION,
    environment: IS_PRODUCTION ? 'production' : 'development',
    kms: process.env.KMS_KEY_ID ? 'configured' : 'dev-fallback',
    secretsManager: process.env.AWS_SECRETS_PREFIX ? 'configured' : 'env-vars',
    sns: process.env.SNS_TOPIC_ARN_PREFIX ? 'configured' : 'console-log',
    cloudWatch: process.env.CLOUDWATCH_NAMESPACE ? 'configured' : 'console-log',
    bedrock: process.env.BEDROCK_ML_MODEL_ID ? 'configured' : 'mock-data',
  };
}
