/**
 * AWS CloudWatch Integration
 *
 * Custom metrics, structured logging, and alarms for monitoring.
 * Falls back to console logging in development.
 */

import {
  CloudWatchClient,
  PutMetricDataCommand,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
  MetricDatum,
  StandardUnit,
  ComparisonOperator,
  Statistic,
} from '@aws-sdk/client-cloudwatch';
import { getAwsConfig, isServiceAvailable } from './config';

// ─── Client ──────────────────────────────────────────────────────────────────

let cwClient: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!cwClient) {
    const config = getAwsConfig();
    cwClient = new CloudWatchClient({ region: config.region });
  }
  return cwClient;
}

const NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'Vaidyah';

// ─── Metric Buffer (batch publishing) ────────────────────────────────────────

const metricBuffer: MetricDatum[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL_MS = 60_000; // Flush every 60 seconds
const MAX_BUFFER_SIZE = 20; // CloudWatch max per PutMetricData call

function startAutoFlush() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushMetrics().catch((err) => console.error('[CloudWatch] Auto-flush error:', err));
  }, FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface MetricOptions {
  unit?: StandardUnit;
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

/**
 * Record a custom metric value. Buffered and flushed periodically.
 */
export function recordMetric(
  metricName: string,
  value: number,
  options?: MetricOptions,
): void {
  const datum: MetricDatum = {
    MetricName: metricName,
    Value: value,
    Unit: options?.unit || StandardUnit.Count,
    Timestamp: options?.timestamp || new Date(),
    Dimensions: options?.dimensions
      ? Object.entries(options.dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  };

  if (!isServiceAvailable('cloudwatch')) {
    const dims = options?.dimensions ? ` [${JSON.stringify(options.dimensions)}]` : '';
    console.log(`[CloudWatch-Dev] ${metricName}=${value} ${options?.unit || 'Count'}${dims}`);
    return;
  }

  metricBuffer.push(datum);
  startAutoFlush();

  if (metricBuffer.length >= MAX_BUFFER_SIZE) {
    flushMetrics().catch((err) => console.error('[CloudWatch] Flush error:', err));
  }
}

/**
 * Flush buffered metrics to CloudWatch.
 */
export async function flushMetrics(): Promise<void> {
  if (metricBuffer.length === 0) return;
  if (!isServiceAvailable('cloudwatch')) {
    metricBuffer.length = 0;
    return;
  }

  const client = getClient();
  const batch = metricBuffer.splice(0, MAX_BUFFER_SIZE);

  try {
    await client.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: batch,
      }),
    );
  } catch (err) {
    // Restore metrics to buffer so they aren't lost
    metricBuffer.unshift(...batch);
    console.error('[CloudWatch] Failed to flush metrics:', (err as Error).message);
  }
}

// ─── Pre-defined Application Metrics ─────────────────────────────────────────

export const metrics = {
  /** Track API request count by endpoint and status */
  apiRequest(method: string, path: string, statusCode: number, durationMs: number) {
    recordMetric('ApiRequestCount', 1, {
      dimensions: { Method: method, Path: path, StatusCode: String(statusCode) },
    });
    recordMetric('ApiLatency', durationMs, {
      unit: StandardUnit.Milliseconds,
      dimensions: { Method: method, Path: path },
    });
  },

  /** Track consultation events */
  consultation(event: 'started' | 'completed' | 'emergency', centerId: string) {
    recordMetric('ConsultationEvent', 1, {
      dimensions: { Event: event, CenterId: centerId },
    });
  },

  /** Track triage results */
  triageResult(level: string, centerId: string) {
    recordMetric('TriageResult', 1, {
      dimensions: { Level: level, CenterId: centerId },
    });
  },

  /** Track AI model latency */
  aiModelLatency(model: string, durationMs: number) {
    recordMetric('AiModelLatency', durationMs, {
      unit: StandardUnit.Milliseconds,
      dimensions: { Model: model },
    });
  },

  /** Track voice processing */
  voiceProcessing(language: string, durationMs: number) {
    recordMetric('VoiceProcessingDuration', durationMs, {
      unit: StandardUnit.Milliseconds,
      dimensions: { Language: language },
    });
  },

  /** Track active sessions */
  activeSessions(count: number) {
    recordMetric('ActiveSessions', count, {
      unit: StandardUnit.Count,
    });
  },

  /** Track service health */
  serviceHealth(serviceName: string, healthy: boolean) {
    recordMetric('ServiceHealth', healthy ? 1 : 0, {
      dimensions: { Service: serviceName },
    });
  },

  /** Track circuit breaker state */
  circuitBreakerState(serviceName: string, state: 'closed' | 'open' | 'half-open') {
    const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
    recordMetric('CircuitBreakerState', stateValue, {
      dimensions: { Service: serviceName },
    });
  },

  /** Track error count by type */
  errorCount(errorType: string, serviceName: string) {
    recordMetric('ErrorCount', 1, {
      dimensions: { ErrorType: errorType, Service: serviceName },
    });
  },

  /** Track wearable data sync */
  wearableSync(provider: string, success: boolean) {
    recordMetric('WearableSyncEvent', 1, {
      dimensions: { Provider: provider, Success: String(success) },
    });
  },
};

// ─── Alarms ──────────────────────────────────────────────────────────────────

/**
 * Create a CloudWatch alarm.
 */
export async function createAlarm(
  alarmName: string,
  metricName: string,
  threshold: number,
  options?: {
    comparisonOperator?: ComparisonOperator;
    evaluationPeriods?: number;
    period?: number;
    statistic?: Statistic;
    dimensions?: Record<string, string>;
    snsTopicArn?: string;
    description?: string;
  },
): Promise<void> {
  if (!isServiceAvailable('cloudwatch')) {
    console.log(`[CloudWatch-Dev] Alarm "${alarmName}": ${metricName} ${options?.comparisonOperator || '>='} ${threshold}`);
    return;
  }

  const client = getClient();
  try {
    await client.send(
      new PutMetricAlarmCommand({
        AlarmName: alarmName,
        Namespace: NAMESPACE,
        MetricName: metricName,
        Threshold: threshold,
        ComparisonOperator: options?.comparisonOperator || ComparisonOperator.GreaterThanOrEqualToThreshold,
        EvaluationPeriods: options?.evaluationPeriods || 2,
        Period: options?.period || 300,
        Statistic: options?.statistic || Statistic.Sum,
        Dimensions: options?.dimensions
          ? Object.entries(options.dimensions).map(([Name, Value]) => ({ Name, Value }))
          : undefined,
        AlarmActions: options?.snsTopicArn ? [options.snsTopicArn] : undefined,
        AlarmDescription: options?.description || `Vaidyah alarm: ${alarmName}`,
        TreatMissingData: 'notBreaching',
      }),
    );
  } catch (err) {
    console.error(`[CloudWatch] Failed to create alarm "${alarmName}":`, (err as Error).message);
    throw err;
  }
}

/**
 * List active alarms.
 */
export async function listAlarms() {
  if (!isServiceAvailable('cloudwatch')) return [];

  const client = getClient();
  try {
    const response = await client.send(
      new DescribeAlarmsCommand({ MaxRecords: 50 }),
    );
    return response.MetricAlarms ?? [];
  } catch (err) {
    console.error('[CloudWatch] Failed to list alarms:', (err as Error).message);
    return [];
  }
}

/**
 * Setup standard Vaidyah alarms (call once at deployment).
 */
export async function setupStandardAlarms(snsTopicArn?: string): Promise<void> {
  const opts = { snsTopicArn };

  await createAlarm('Vaidyah-HighErrorRate', 'ErrorCount', 10, {
    ...opts,
    description: 'Error count exceeds 10 in 5 minutes',
    period: 300,
  });

  await createAlarm('Vaidyah-HighLatency', 'ApiLatency', 5000, {
    ...opts,
    statistic: Statistic.Average,
    description: 'Average API latency exceeds 5 seconds',
    period: 300,
  });

  await createAlarm('Vaidyah-EmergencyAlert', 'ConsultationEvent', 1, {
    ...opts,
    dimensions: { Event: 'emergency' },
    description: 'Emergency consultation detected',
    evaluationPeriods: 1,
    period: 60,
  });

  await createAlarm('Vaidyah-CircuitBreakerOpen', 'CircuitBreakerState', 1, {
    ...opts,
    description: 'A service circuit breaker has opened',
    evaluationPeriods: 1,
    period: 60,
  });

  console.log('[CloudWatch] Standard alarms configured');
}

// ─── Express Middleware ──────────────────────────────────────────────────────

/**
 * Express middleware that records API metrics for every request.
 */
export function metricsMiddleware() {
  return (req: { method: string; path: string }, res: { statusCode: number; on: (event: string, cb: () => void) => void }, next: () => void) => {
    const start = Date.now();
    res.on('finish', () => {
      metrics.apiRequest(req.method, req.path, res.statusCode, Date.now() - start);
    });
    next();
  };
}
