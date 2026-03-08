/**
 * @vaidyah/aws-services
 *
 * Unified AWS service integration package for all Vaidyah microservices.
 * Each module provides production AWS integration with development fallbacks.
 */

// Configuration
export { getAwsConfig, isServiceAvailable } from './config';
export type { AwsConfig } from './config';

// AWS KMS — Encryption key management
export {
  encrypt,
  decrypt,
  kmsEncrypt,
  kmsDecrypt,
  verifyKmsKey,
} from './kms';

// AWS Secrets Manager — Secret storage
export {
  getSecret,
  getJsonSecret,
  loadAllSecrets,
  putSecret,
  invalidateSecret,
} from './secrets-manager';

// AWS SNS — Push notifications
export {
  sendSms,
  sendPush,
  publishToTopic,
  registerDevice,
  subscribeToTopic,
  unsubscribeFromTopic,
  ensureTopics,
  listTopicSubscribers,
  NotificationTopic,
} from './sns';
export type { SmsNotification, PushNotification, TopicNotification } from './sns';

// AWS CloudWatch — Monitoring & metrics
export {
  recordMetric,
  flushMetrics,
  metrics,
  createAlarm,
  listAlarms,
  setupStandardAlarms,
  metricsMiddleware,
} from './cloudwatch';

// AWS S3 — Object storage (voice recordings, documents, images)
export {
  uploadObject,
  downloadObject,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  listObjects,
  deleteObject,
} from './s3';
export type {
  S3UploadResult,
  S3PresignedUrlResult,
  S3ListResult,
  S3BucketType,
} from './s3';

// AWS Bedrock — ML model inference (prosody, contradiction, trial matching)
export {
  invokeEndpoint,
  analyzeProsody,
  detectContradiction,
  matchTrial,
  MODEL_ENDPOINTS,
} from './sagemaker';
export type {
  InvokeEndpointParams,
  EndpointResult,
  ModelEndpointStatus,
} from './sagemaker';
