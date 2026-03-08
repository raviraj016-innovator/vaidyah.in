/**
 * Shared AWS configuration for all service modules.
 * Uses environment variables with sensible defaults for local development.
 */

export interface AwsConfig {
  region: string;
  /** True when running against real AWS services (not local stubs) */
  isProduction: boolean;
  /** Account ID (used for ARN construction) */
  accountId: string;
  /** Common resource prefix for naming */
  resourcePrefix: string;
}

let _config: AwsConfig | null = null;

export function getAwsConfig(): AwsConfig {
  if (!_config) {
    _config = {
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1',
      isProduction: process.env.NODE_ENV === 'production',
      accountId: process.env.AWS_ACCOUNT_ID || '000000000000',
      resourcePrefix: process.env.RESOURCE_PREFIX || 'vaidyah',
    };
  }
  return _config;
}

/** Check if a specific AWS service is available (has required env vars) */
export function isServiceAvailable(service: string): boolean {
  switch (service) {
    case 'kms':
      return !!process.env.KMS_KEY_ID;
    case 'secrets-manager':
      return !!process.env.AWS_SECRETS_PREFIX;
    case 'sns':
      return !!process.env.SNS_TOPIC_ARN_PREFIX;
    case 'cloudwatch':
      return !!process.env.CLOUDWATCH_NAMESPACE;
    case 's3':
      return !!process.env.S3_VOICE_BUCKET || !!process.env.S3_DOCUMENTS_BUCKET;
    case 'bedrock-ml':
      return !!process.env.BEDROCK_ML_MODEL_ID || !!process.env.AWS_ACCESS_KEY_ID;
    default:
      return false;
  }
}
