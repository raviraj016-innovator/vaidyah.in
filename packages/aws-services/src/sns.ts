/**
 * AWS SNS Integration
 *
 * Push notifications via Amazon Simple Notification Service.
 * Supports SMS (for OTP/alerts), push (mobile), and email notifications.
 * Falls back to console logging in development.
 */

import {
  SNSClient,
  PublishCommand,
  CreatePlatformEndpointCommand,
  SubscribeCommand,
  UnsubscribeCommand,
  CreateTopicCommand,
  ListSubscriptionsByTopicCommand,
} from '@aws-sdk/client-sns';
import { getAwsConfig, isServiceAvailable } from './config';

// ─── Client ──────────────────────────────────────────────────────────────────

let snsClient: SNSClient | null = null;

function getClient(): SNSClient {
  if (!snsClient) {
    const config = getAwsConfig();
    snsClient = new SNSClient({ region: config.region });
  }
  return snsClient;
}

// ─── Topic ARNs ──────────────────────────────────────────────────────────────

const TOPIC_PREFIX = process.env.SNS_TOPIC_ARN_PREFIX || '';
const PLATFORM_APP_ARN_APNS = process.env.SNS_PLATFORM_APP_ARN_APNS || '';
const PLATFORM_APP_ARN_GCM = process.env.SNS_PLATFORM_APP_ARN_GCM || '';

export enum NotificationTopic {
  EMERGENCY_ALERT = 'vaidyah-emergency-alerts',
  CONSULTATION_UPDATE = 'vaidyah-consultation-updates',
  TRIAL_MATCH = 'vaidyah-trial-matches',
  SYSTEM_ALERT = 'vaidyah-system-alerts',
  PATIENT_REMINDER = 'vaidyah-patient-reminders',
  WEARABLE_ALERT = 'vaidyah-wearable-alerts',
}

function topicArn(topic: NotificationTopic): string {
  if (TOPIC_PREFIX) return `${TOPIC_PREFIX}:${topic}`;
  const config = getAwsConfig();
  return `arn:aws:sns:${config.region}:${config.accountId}:${topic}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SmsNotification {
  phoneNumber: string;
  message: string;
  senderId?: string;
}

export interface PushNotification {
  endpointArn: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface TopicNotification {
  topic: NotificationTopic;
  subject: string;
  message: string;
  attributes?: Record<string, string>;
}

/**
 * Send an SMS message (for OTP, emergency alerts).
 */
export async function sendSms(notification: SmsNotification): Promise<string | null> {
  if (!isServiceAvailable('sns')) {
    console.log(`[SNS-Dev] SMS to ${notification.phoneNumber}: ${notification.message}`);
    return 'dev-message-id';
  }

  const client = getClient();
  const response = await client.send(
    new PublishCommand({
      PhoneNumber: notification.phoneNumber,
      Message: notification.message,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: notification.senderId || 'VAIDYAH',
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional',
        },
      },
    }),
  );

  return response.MessageId ?? null;
}

/**
 * Send a push notification to a specific device endpoint.
 */
export async function sendPush(notification: PushNotification): Promise<string | null> {
  if (!isServiceAvailable('sns')) {
    console.log(`[SNS-Dev] Push to ${notification.endpointArn}: ${notification.title} — ${notification.body}`);
    return 'dev-message-id';
  }

  const client = getClient();
  const payload = {
    default: notification.body,
    APNS: JSON.stringify({
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: 'default',
        badge: 1,
      },
      data: notification.data,
    }),
    GCM: JSON.stringify({
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    }),
  };

  const response = await client.send(
    new PublishCommand({
      TargetArn: notification.endpointArn,
      Message: JSON.stringify(payload),
      MessageStructure: 'json',
    }),
  );

  return response.MessageId ?? null;
}

/**
 * Publish to an SNS topic (fan-out to all subscribers).
 */
export async function publishToTopic(notification: TopicNotification): Promise<string | null> {
  if (!isServiceAvailable('sns')) {
    console.log(`[SNS-Dev] Topic ${notification.topic}: ${notification.subject} — ${notification.message}`);
    return 'dev-message-id';
  }

  const client = getClient();
  const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {};
  if (notification.attributes) {
    for (const [key, value] of Object.entries(notification.attributes)) {
      messageAttributes[key] = { DataType: 'String', StringValue: value };
    }
  }

  const response = await client.send(
    new PublishCommand({
      TopicArn: topicArn(notification.topic),
      Subject: notification.subject,
      Message: notification.message,
      MessageAttributes: messageAttributes,
    }),
  );

  return response.MessageId ?? null;
}

/**
 * Register a device token for push notifications (iOS or Android).
 */
export async function registerDevice(
  platform: 'ios' | 'android',
  deviceToken: string,
  userId: string,
): Promise<string | null> {
  if (!isServiceAvailable('sns')) {
    console.log(`[SNS-Dev] Register device: ${platform} token=${deviceToken.substring(0, 10)}... user=${userId}`);
    return `dev-endpoint-${platform}-${userId}`;
  }

  const client = getClient();
  const platformAppArn = platform === 'ios' ? PLATFORM_APP_ARN_APNS : PLATFORM_APP_ARN_GCM;

  const response = await client.send(
    new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformAppArn,
      Token: deviceToken,
      CustomUserData: userId,
    }),
  );

  return response.EndpointArn ?? null;
}

/**
 * Subscribe an endpoint (email, SMS, Lambda, etc.) to a topic.
 */
export async function subscribeToTopic(
  topic: NotificationTopic,
  protocol: 'email' | 'sms' | 'lambda' | 'sqs' | 'https',
  endpoint: string,
): Promise<string | null> {
  if (!isServiceAvailable('sns')) {
    console.log(`[SNS-Dev] Subscribe ${protocol}:${endpoint} to ${topic}`);
    return 'dev-subscription-arn';
  }

  const client = getClient();
  const response = await client.send(
    new SubscribeCommand({
      TopicArn: topicArn(topic),
      Protocol: protocol,
      Endpoint: endpoint,
      ReturnSubscriptionArn: true,
    }),
  );

  return response.SubscriptionArn ?? null;
}

/**
 * Unsubscribe from a topic.
 */
export async function unsubscribeFromTopic(subscriptionArn: string): Promise<void> {
  if (!isServiceAvailable('sns')) return;
  const client = getClient();
  await client.send(new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }));
}

/**
 * Ensure all required topics exist (idempotent — call at startup).
 */
export async function ensureTopics(): Promise<void> {
  if (!isServiceAvailable('sns')) {
    console.warn('[SNS] Not configured — topics will not be created');
    return;
  }

  const client = getClient();
  for (const topic of Object.values(NotificationTopic)) {
    try {
      await client.send(new CreateTopicCommand({ Name: topic }));
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[SNS] Failed to create topic ${topic}:`, error.message);
    }
  }
  console.log('[SNS] All topics verified');
}

/**
 * List subscribers of a topic (for admin dashboard).
 */
export async function listTopicSubscribers(topic: NotificationTopic) {
  if (!isServiceAvailable('sns')) return [];

  const client = getClient();
  const response = await client.send(
    new ListSubscriptionsByTopicCommand({ TopicArn: topicArn(topic) }),
  );
  return response.Subscriptions ?? [];
}
