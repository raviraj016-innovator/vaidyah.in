import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { query, queryOne, queryMany } from '../db';
import {
  WearablePlatform,
  WearableDataType,
  NormalizedWearableData,
  WearableSyncResult,
  HealthAlert,
} from '../types';
import { ExternalServiceError } from '../middleware/errorHandler';

const SERVICE_NAME = 'Wearables';
const isDevMode = config.server.nodeEnv !== 'production';

// ─── Health Thresholds ───────────────────────────────────────────────────────

interface Threshold {
  min?: number;
  max?: number;
  alertType: HealthAlert['alertType'];
  severity: HealthAlert['severity'];
  messageTemplate: string;
}

const HEALTH_THRESHOLDS: Record<string, Threshold[]> = {
  heart_rate: [
    { max: 120, alertType: 'abnormal_heart_rate', severity: 'high', messageTemplate: 'Elevated heart rate detected: {value} bpm (normal: 60-100 bpm)' },
    { max: 150, alertType: 'abnormal_heart_rate', severity: 'critical', messageTemplate: 'Critically high heart rate: {value} bpm. Seek immediate medical attention.' },
    { min: 50, alertType: 'abnormal_heart_rate', severity: 'medium', messageTemplate: 'Low heart rate detected: {value} bpm (normal: 60-100 bpm)' },
    { min: 40, alertType: 'abnormal_heart_rate', severity: 'high', messageTemplate: 'Dangerously low heart rate: {value} bpm. Consult your doctor immediately.' },
  ],
  spo2: [
    { min: 92, alertType: 'low_spo2', severity: 'high', messageTemplate: 'Low blood oxygen saturation: {value}% (normal: 95-100%)' },
    { min: 88, alertType: 'low_spo2', severity: 'critical', messageTemplate: 'Critically low SpO2: {value}%. Seek emergency medical care.' },
  ],
  blood_glucose: [
    { max: 180, alertType: 'glucose_spike', severity: 'medium', messageTemplate: 'High blood glucose: {value} mg/dL (target: 70-140 mg/dL)' },
    { max: 250, alertType: 'glucose_spike', severity: 'high', messageTemplate: 'Very high blood glucose: {value} mg/dL. Contact your doctor.' },
    { max: 400, alertType: 'glucose_spike', severity: 'critical', messageTemplate: 'Dangerously high blood glucose: {value} mg/dL. Seek emergency care.' },
    { min: 70, alertType: 'glucose_spike', severity: 'medium', messageTemplate: 'Low blood glucose: {value} mg/dL. Consider eating a snack.' },
    { min: 54, alertType: 'glucose_spike', severity: 'high', messageTemplate: 'Very low blood glucose: {value} mg/dL. Treat hypoglycemia immediately.' },
  ],
  blood_pressure: [
    { max: 140, alertType: 'high_blood_pressure', severity: 'medium', messageTemplate: 'Elevated systolic blood pressure: {value} mmHg (normal: <120 mmHg)' },
    { max: 180, alertType: 'high_blood_pressure', severity: 'high', messageTemplate: 'High systolic blood pressure: {value} mmHg. Consult your doctor.' },
    { max: 200, alertType: 'high_blood_pressure', severity: 'critical', messageTemplate: 'Hypertensive crisis: {value} mmHg. Seek emergency care.' },
  ],
  sleep: [
    { min: 4, alertType: 'irregular_sleep', severity: 'medium', messageTemplate: 'Insufficient sleep detected: {value} hours (recommended: 7-9 hours)' },
    { min: 3, alertType: 'irregular_sleep', severity: 'high', messageTemplate: 'Severely insufficient sleep: {value} hours. Poor sleep affects your health.' },
  ],
};

// ─── Data Units ──────────────────────────────────────────────────────────────

const DATA_UNITS: Record<WearableDataType, string> = {
  heart_rate: 'bpm',
  steps: 'count',
  blood_glucose: 'mg/dL',
  spo2: '%',
  sleep: 'hours',
  blood_pressure: 'mmHg',
  weight: 'kg',
  calories_burned: 'kcal',
  active_minutes: 'min',
  temperature: 'celsius',
  respiratory_rate: 'breaths/min',
};

// ─── Wearable Provider Interface ─────────────────────────────────────────────

interface WearableProvider {
  readonly platform: WearablePlatform;
  connect(patientId: string, authorizationCode: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes: string;
  }>;
  disconnect(patientId: string): Promise<void>;
  syncData(patientId: string, accessToken: string, dataTypes?: WearableDataType[]): Promise<NormalizedWearableData[]>;
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }>;
}

// ─── Apple Health Provider ───────────────────────────────────────────────────

class AppleHealthProvider implements WearableProvider {
  readonly platform: WearablePlatform = 'apple_health';

  async connect(patientId: string, authorizationCode: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes: string;
  }> {
    if (isDevMode) {
      console.log(`[Wearables/AppleHealth] Dev mode: mock connect for patient ${patientId}`);
      return {
        accessToken: `mock-apple-access-token-${patientId}`,
        refreshToken: `mock-apple-refresh-token-${patientId}`,
        expiresIn: 3600,
        scopes: 'health.heartRate health.steps health.sleep health.bloodOxygen',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const tokenResponse = await fetch(`${config.wearables.appleHealth.serverUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: redirectUri,
        }),
        signal: controller.signal,
      });

      if (!tokenResponse.ok) {
        throw new Error(`Apple Health token endpoint returned ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
      };

      if (!tokenData.access_token) {
        throw new Error(`Token fetch failed: ${tokenData.error || 'Missing access_token'}`);
      }

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 3600,
        scopes: tokenData.scope || '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async disconnect(patientId: string): Promise<void> {
    if (isDevMode) {
      console.log(`[Wearables/AppleHealth] Dev mode: mock disconnect for patient ${patientId}`);
      return;
    }

    // Apple Health doesn't have a server-side revoke; just deactivate locally
    console.log(`[Wearables/AppleHealth] Disconnecting patient ${patientId}`);
  }

  async syncData(patientId: string, accessToken: string, dataTypes?: WearableDataType[]): Promise<NormalizedWearableData[]> {
    if (isDevMode) {
      console.log(`[Wearables/AppleHealth] Dev mode: returning mock data for patient ${patientId}`);
      return generateMockWearableData(patientId, 'apple_health', dataTypes);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const syncResponse = await fetch(`${config.wearables.appleHealth.serverUrl}/data/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId,
          dataTypes: dataTypes || ['heart_rate', 'steps', 'spo2', 'sleep', 'blood_pressure'],
          since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        }),
        signal: controller.signal,
      });

      if (!syncResponse.ok) {
        throw new Error(`Apple Health sync returned ${syncResponse.status}`);
      }

      const rawData = await syncResponse.json() as Array<{
        type: string;
        value: number;
        unit: string;
        startDate: string;
        endDate: string;
        metadata?: Record<string, unknown>;
      }>;

      return rawData.map((item) => ({
        id: uuidv4(),
        patientId,
        platform: 'apple_health' as WearablePlatform,
        dataType: normalizeAppleHealthType(item.type),
        value: item.value,
        unit: item.unit,
        startTime: item.startDate,
        endTime: item.endDate,
        metadata: item.metadata,
        syncedAt: new Date().toISOString(),
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    if (isDevMode) {
      return {
        accessToken: `mock-apple-refreshed-token-${Date.now()}`,
        refreshToken,
        expiresIn: 3600,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${config.wearables.appleHealth.serverUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Google Fit Provider ─────────────────────────────────────────────────────

class GoogleFitProvider implements WearableProvider {
  readonly platform: WearablePlatform = 'google_fit';

  async connect(patientId: string, authorizationCode: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes: string;
  }> {
    if (isDevMode) {
      console.log(`[Wearables/GoogleFit] Dev mode: mock connect for patient ${patientId}`);
      return {
        accessToken: `mock-google-access-token-${patientId}`,
        refreshToken: `mock-google-refresh-token-${patientId}`,
        expiresIn: 3600,
        scopes: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.blood_glucose.read https://www.googleapis.com/auth/fitness.oxygen_saturation.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.blood_pressure.read',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const tokenResponse = await fetch(config.wearables.googleFit.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: redirectUri,
          client_id: config.wearables.googleFit.clientId,
          client_secret: config.wearables.googleFit.clientSecret,
        }),
        signal: controller.signal,
      });

      if (!tokenResponse.ok) {
        throw new Error(`Google Fit token endpoint returned ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        error?: string;
      };

      if (!tokenData.access_token) {
        throw new Error(`Token fetch failed: ${tokenData.error || 'Missing access_token'}`);
      }

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 3600,
        scopes: tokenData.scope || '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async disconnect(patientId: string): Promise<void> {
    if (isDevMode) {
      console.log(`[Wearables/GoogleFit] Dev mode: mock disconnect for patient ${patientId}`);
      return;
    }

    // Revoke the token with Google
    const connection = await queryOne<{ access_token: string }>(
      `SELECT access_token FROM wearable_connections WHERE patient_id = $1 AND platform = 'google_fit' AND is_active = true`,
      [patientId]
    );

    if (connection) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${connection.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal,
        });
      } catch (err) {
        console.warn(`[Wearables/GoogleFit] Token revocation failed:`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  async syncData(patientId: string, accessToken: string, dataTypes?: WearableDataType[]): Promise<NormalizedWearableData[]> {
    if (isDevMode) {
      console.log(`[Wearables/GoogleFit] Dev mode: returning mock data for patient ${patientId}`);
      return generateMockWearableData(patientId, 'google_fit', dataTypes);
    }

    const results: NormalizedWearableData[] = [];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const typesToSync = dataTypes || ['heart_rate', 'steps', 'spo2', 'sleep', 'blood_pressure'] as WearableDataType[];

    for (const dataType of typesToSync) {
      const googleDataSource = getGoogleFitDataSource(dataType);
      if (!googleDataSource) continue;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(
          `${config.wearables.googleFit.apiUrl}/users/me/dataSources/${googleDataSource}/datasets/${oneDayAgo * 1000000}-${now * 1000000}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          console.warn(`[Wearables/GoogleFit] Failed to fetch ${dataType}: ${response.status}`);
          continue;
        }

        const data = await response.json() as {
          point?: Array<{
            startTimeNanos: string;
            endTimeNanos: string;
            value: Array<{ fpVal?: number; intVal?: number }>;
          }>;
        };

        if (data.point) {
          for (const point of data.point) {
            const value = point.value?.[0]?.fpVal ?? point.value?.[0]?.intVal;
            if (value === undefined) continue;

            results.push({
              id: uuidv4(),
              patientId,
              platform: 'google_fit',
              dataType,
              value,
              unit: DATA_UNITS[dataType],
              startTime: new Date(parseInt(point.startTimeNanos) / 1000000).toISOString(),
              endTime: new Date(parseInt(point.endTimeNanos) / 1000000).toISOString(),
              syncedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.warn(`[Wearables/GoogleFit] Error syncing ${dataType}:`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timeout);
      }
    }

    return results;
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    if (isDevMode) {
      return {
        accessToken: `mock-google-refreshed-token-${Date.now()}`,
        refreshToken,
        expiresIn: 3600,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(config.wearables.googleFit.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: config.wearables.googleFit.clientId,
          client_secret: config.wearables.googleFit.clientSecret,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Google token refresh failed: ${response.status}`);
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 3600,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Fitbit Provider ─────────────────────────────────────────────────────────

class FitbitProvider implements WearableProvider {
  readonly platform: WearablePlatform = 'fitbit';

  async connect(patientId: string, authorizationCode: string, redirectUri: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    scopes: string;
  }> {
    if (isDevMode) {
      console.log(`[Wearables/Fitbit] Dev mode: mock connect for patient ${patientId}`);
      return {
        accessToken: `mock-fitbit-access-token-${patientId}`,
        refreshToken: `mock-fitbit-refresh-token-${patientId}`,
        expiresIn: 28800, // Fitbit tokens typically last 8 hours
        scopes: 'activity heartrate sleep oxygen_saturation weight',
      };
    }

    const credentials = Buffer.from(
      `${config.wearables.fitbit.clientId}:${config.wearables.fitbit.clientSecret}`
    ).toString('base64');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const tokenResponse = await fetch(config.wearables.fitbit.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: redirectUri,
        }),
        signal: controller.signal,
      });

      if (!tokenResponse.ok) {
        throw new Error(`Fitbit token endpoint returned ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        user_id?: string;
        errors?: Array<{ errorType: string; message: string }>;
      };

      if (!tokenData.access_token) {
        const errMsg = tokenData.errors?.[0]?.message || 'Missing access_token';
        throw new Error(`Token fetch failed: ${errMsg}`);
      }

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in || 28800,
        scopes: tokenData.scope || '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async disconnect(patientId: string): Promise<void> {
    if (isDevMode) {
      console.log(`[Wearables/Fitbit] Dev mode: mock disconnect for patient ${patientId}`);
      return;
    }

    // Revoke the Fitbit token
    const connection = await queryOne<{ access_token: string }>(
      `SELECT access_token FROM wearable_connections WHERE patient_id = $1 AND platform = 'fitbit' AND is_active = true`,
      [patientId]
    );

    if (connection) {
      const credentials = Buffer.from(
        `${config.wearables.fitbit.clientId}:${config.wearables.fitbit.clientSecret}`
      ).toString('base64');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        await fetch('https://api.fitbit.com/oauth2/revoke', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ token: connection.access_token }),
          signal: controller.signal,
        });
      } catch (err) {
        console.warn(`[Wearables/Fitbit] Token revocation failed:`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  async syncData(patientId: string, accessToken: string, dataTypes?: WearableDataType[]): Promise<NormalizedWearableData[]> {
    if (isDevMode) {
      console.log(`[Wearables/Fitbit] Dev mode: returning mock data for patient ${patientId}`);
      return generateMockWearableData(patientId, 'fitbit', dataTypes);
    }

    const results: NormalizedWearableData[] = [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const typesToSync = dataTypes || ['heart_rate', 'steps', 'spo2', 'sleep'] as WearableDataType[];
    const baseUrl = config.wearables.fitbit.apiUrl;

    for (const dataType of typesToSync) {
      const endpoint = getFitbitEndpoint(dataType, today);
      if (!endpoint) continue;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          console.warn(`[Wearables/Fitbit] Failed to fetch ${dataType}: ${response.status}`);
          continue;
        }

        const data = await response.json() as Record<string, unknown>;
        const normalized = parseFitbitResponse(patientId, dataType, data);
        results.push(...normalized);
      } catch (err) {
        console.warn(`[Wearables/Fitbit] Error syncing ${dataType}:`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timeout);
      }
    }

    return results;
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }> {
    if (isDevMode) {
      return {
        accessToken: `mock-fitbit-refreshed-token-${Date.now()}`,
        refreshToken,
        expiresIn: 28800,
      };
    }

    const credentials = Buffer.from(
      `${config.wearables.fitbit.clientId}:${config.wearables.fitbit.clientSecret}`
    ).toString('base64');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(config.wearables.fitbit.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Fitbit token refresh failed: ${response.status}`);
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn: data.expires_in || 28800,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Wearable Service (Unified Interface) ────────────────────────────────────

export class WearableService {
  private providers: Map<WearablePlatform, WearableProvider>;

  constructor() {
    this.providers = new Map();
    this.providers.set('apple_health', new AppleHealthProvider());
    this.providers.set('google_fit', new GoogleFitProvider());
    this.providers.set('fitbit', new FitbitProvider());
  }

  private getProvider(platform: WearablePlatform): WearableProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new ExternalServiceError(SERVICE_NAME, `Unsupported wearable platform: ${platform}`);
    }
    return provider;
  }

  // ─── Connect ──────────────────────────────────────────────────────────

  async connect(
    patientId: string,
    platform: WearablePlatform,
    authorizationCode: string,
    redirectUri: string,
  ): Promise<{ connectionId: string; platform: WearablePlatform; status: string }> {
    const provider = this.getProvider(platform);

    try {
      const tokenResult = await provider.connect(patientId, authorizationCode, redirectUri);
      const connectionId = uuidv4();

      try {
        await query(
          `INSERT INTO wearable_connections (id, patient_id, platform, access_token, refresh_token, expires_at, scopes, connected_at, last_sync_at, is_active)
           VALUES ($1, $2, $3, $4, $5, NOW() + interval '1 second' * $6, $7, NOW(), NOW(), true)
           ON CONFLICT (patient_id, platform) DO UPDATE SET
             access_token = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             expires_at = EXCLUDED.expires_at,
             scopes = EXCLUDED.scopes,
             last_sync_at = NOW(),
             is_active = true`,
          [
            connectionId,
            patientId,
            platform,
            tokenResult.accessToken,
            tokenResult.refreshToken || null,
            tokenResult.expiresIn,
            tokenResult.scopes,
          ]
        );
      } catch (dbError) {
        if (isDevMode) {
          console.warn('[Wearables] Dev mode: could not persist connection to DB:', dbError instanceof Error ? dbError.message : dbError);
        } else {
          throw dbError;
        }
      }

      return {
        connectionId,
        platform,
        status: 'connected',
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Failed to connect ${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Disconnect ───────────────────────────────────────────────────────

  async disconnect(
    patientId: string,
    platform: WearablePlatform,
  ): Promise<{ platform: WearablePlatform; status: string }> {
    const provider = this.getProvider(platform);

    try {
      await provider.disconnect(patientId);

      try {
        await query(
          `UPDATE wearable_connections SET is_active = false, access_token = NULL, refresh_token = NULL
           WHERE patient_id = $1 AND platform = $2`,
          [patientId, platform]
        );
      } catch (dbError) {
        if (isDevMode) {
          console.warn('[Wearables] Dev mode: could not update disconnect in DB:', dbError instanceof Error ? dbError.message : dbError);
        } else {
          throw dbError;
        }
      }

      return {
        platform,
        status: 'disconnected',
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Failed to disconnect ${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Sync Data ────────────────────────────────────────────────────────

  async syncData(
    patientId: string,
    platform: WearablePlatform,
    dataTypes?: WearableDataType[],
  ): Promise<WearableSyncResult> {
    const provider = this.getProvider(platform);
    const syncStartedAt = new Date().toISOString();
    const errors: string[] = [];

    // Get the access token for the connection
    let accessToken: string;

    if (isDevMode) {
      accessToken = `mock-${platform}-access-token-${patientId}`;
    } else {
      const connection = await queryOne<{
        access_token: string;
        refresh_token: string;
        expires_at: string;
      }>(
        `SELECT access_token, refresh_token, expires_at
         FROM wearable_connections
         WHERE patient_id = $1 AND platform = $2 AND is_active = true`,
        [patientId, platform]
      );

      if (!connection) {
        throw new ExternalServiceError(SERVICE_NAME, `No active ${platform} connection for patient ${patientId}`);
      }

      // Check if token needs refreshing
      const expiresAt = new Date(connection.expires_at);
      if (expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
        try {
          const refreshed = await provider.refreshAccessToken(connection.refresh_token);
          accessToken = refreshed.accessToken;

          await query(
            `UPDATE wearable_connections
             SET access_token = $1, refresh_token = COALESCE($2, refresh_token),
                 expires_at = NOW() + interval '1 second' * $3
             WHERE patient_id = $4 AND platform = $5`,
            [refreshed.accessToken, refreshed.refreshToken, refreshed.expiresIn, patientId, platform]
          );
        } catch (refreshError) {
          throw new ExternalServiceError(
            SERVICE_NAME,
            `Token refresh failed for ${platform}: ${refreshError instanceof Error ? refreshError.message : 'Unknown error'}`
          );
        }
      } else {
        accessToken = connection.access_token;
      }
    }

    // Sync data from provider
    let syncedData: NormalizedWearableData[] = [];
    try {
      syncedData = await provider.syncData(patientId, accessToken, dataTypes);
    } catch (syncError) {
      errors.push(syncError instanceof Error ? syncError.message : 'Sync failed');
    }

    // Persist synced data and check thresholds
    const alerts: HealthAlert[] = [];

    for (const dataPoint of syncedData) {
      try {
        await query(
          `INSERT INTO wearable_data (id, patient_id, platform, data_type, value, unit, start_time, end_time, metadata, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT DO NOTHING`,
          [
            dataPoint.id,
            dataPoint.patientId,
            dataPoint.platform,
            dataPoint.dataType,
            dataPoint.value,
            dataPoint.unit,
            dataPoint.startTime,
            dataPoint.endTime,
            dataPoint.metadata ? JSON.stringify(dataPoint.metadata) : null,
          ]
        );
      } catch (dbError) {
        if (isDevMode) {
          console.warn('[Wearables] Dev mode: could not persist data point:', dbError instanceof Error ? dbError.message : dbError);
        } else {
          errors.push(`Failed to persist ${dataPoint.dataType} data point`);
        }
      }

      // Check thresholds
      const alertsForPoint = checkThresholds(dataPoint);
      alerts.push(...alertsForPoint);
    }

    // Persist alerts
    for (const alert of alerts) {
      try {
        await query(
          `INSERT INTO health_alerts (id, patient_id, alert_type, severity, message, data_type, current_value, normal_range, detected_at, acknowledged)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), false)`,
          [
            alert.id,
            alert.patientId,
            alert.alertType,
            alert.severity,
            alert.message,
            alert.dataType,
            alert.currentValue,
            JSON.stringify(alert.normalRange),
          ]
        );
      } catch (dbError) {
        if (isDevMode) {
          console.warn('[Wearables] Dev mode: could not persist alert:', dbError instanceof Error ? dbError.message : dbError);
        }
      }
    }

    // Update last sync timestamp
    try {
      await query(
        `UPDATE wearable_connections SET last_sync_at = NOW() WHERE patient_id = $1 AND platform = $2`,
        [patientId, platform]
      );
    } catch {
      // Non-critical
    }

    const syncedTypes = [...new Set(syncedData.map((d) => d.dataType))];

    return {
      patientId,
      platform,
      recordsSynced: syncedData.length,
      dataTypes: syncedTypes,
      syncStartedAt,
      syncCompletedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ─── Get Latest Data ──────────────────────────────────────────────────

  async getLatestData(
    patientId: string,
    dataType?: WearableDataType,
    platform?: WearablePlatform,
  ): Promise<NormalizedWearableData[]> {
    if (isDevMode) {
      // Try DB first, fall back to mock
      try {
        let sql = `SELECT id, patient_id AS "patientId", platform, data_type AS "dataType",
                          value, unit, start_time AS "startTime", end_time AS "endTime",
                          metadata, synced_at AS "syncedAt"
                   FROM wearable_data WHERE patient_id = $1`;
        const params: unknown[] = [patientId];

        if (dataType) {
          params.push(dataType);
          sql += ` AND data_type = $${params.length}`;
        }
        if (platform) {
          params.push(platform);
          sql += ` AND platform = $${params.length}`;
        }

        sql += ` ORDER BY start_time DESC LIMIT 100`;
        const results = await queryMany<NormalizedWearableData>(sql, params);

        if (results.length > 0) return results;
      } catch {
        // DB unavailable
      }

      // Return mock data
      return generateMockWearableData(patientId, platform || 'apple_health', dataType ? [dataType] : undefined);
    }

    let sql = `SELECT id, patient_id AS "patientId", platform, data_type AS "dataType",
                      value, unit, start_time AS "startTime", end_time AS "endTime",
                      metadata, synced_at AS "syncedAt"
               FROM wearable_data WHERE patient_id = $1`;
    const params: unknown[] = [patientId];

    if (dataType) {
      params.push(dataType);
      sql += ` AND data_type = $${params.length}`;
    }
    if (platform) {
      params.push(platform);
      sql += ` AND platform = $${params.length}`;
    }

    sql += ` ORDER BY start_time DESC LIMIT 100`;
    return queryMany<NormalizedWearableData>(sql, params);
  }

  // ─── Get Active Connections ───────────────────────────────────────────

  async getActiveConnections(patientId: string): Promise<Array<{
    platform: WearablePlatform;
    connectedAt: string;
    lastSyncAt: string;
    isActive: boolean;
  }>> {
    try {
      return await queryMany<{
        platform: WearablePlatform;
        connectedAt: string;
        lastSyncAt: string;
        isActive: boolean;
      }>(
        `SELECT platform, connected_at AS "connectedAt", last_sync_at AS "lastSyncAt", is_active AS "isActive"
         FROM wearable_connections WHERE patient_id = $1
         ORDER BY connected_at DESC`,
        [patientId]
      );
    } catch {
      if (isDevMode) {
        return [
          {
            platform: 'apple_health',
            connectedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            lastSyncAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            isActive: true,
          },
        ];
      }
      throw new ExternalServiceError(SERVICE_NAME, 'Failed to retrieve wearable connections');
    }
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function normalizeAppleHealthType(appleType: string): WearableDataType {
  const mapping: Record<string, WearableDataType> = {
    'HKQuantityTypeIdentifierHeartRate': 'heart_rate',
    'HKQuantityTypeIdentifierStepCount': 'steps',
    'HKQuantityTypeIdentifierBloodGlucose': 'blood_glucose',
    'HKQuantityTypeIdentifierOxygenSaturation': 'spo2',
    'HKCategoryTypeIdentifierSleepAnalysis': 'sleep',
    'HKQuantityTypeIdentifierBloodPressureSystolic': 'blood_pressure',
    'HKQuantityTypeIdentifierBodyMass': 'weight',
    'HKQuantityTypeIdentifierActiveEnergyBurned': 'calories_burned',
    'HKQuantityTypeIdentifierAppleExerciseTime': 'active_minutes',
    'HKQuantityTypeIdentifierBodyTemperature': 'temperature',
    'HKQuantityTypeIdentifierRespiratoryRate': 'respiratory_rate',
  };

  return mapping[appleType] || 'heart_rate';
}

function getGoogleFitDataSource(dataType: WearableDataType): string | null {
  const mapping: Record<string, string> = {
    heart_rate: 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm',
    steps: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
    blood_glucose: 'derived:com.google.blood_glucose:com.google.android.gms:merged',
    spo2: 'derived:com.google.oxygen_saturation:com.google.android.gms:merged',
    sleep: 'derived:com.google.sleep.segment:com.google.android.gms:merged',
    blood_pressure: 'derived:com.google.blood_pressure:com.google.android.gms:merged',
    weight: 'derived:com.google.weight:com.google.android.gms:merge_weight',
    calories_burned: 'derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended',
    active_minutes: 'derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes',
  };

  return mapping[dataType] || null;
}

function getFitbitEndpoint(dataType: WearableDataType, date: string): string | null {
  const mapping: Record<string, string> = {
    heart_rate: `/activities/heart/date/${date}/1d/1min.json`,
    steps: `/activities/steps/date/${date}/1d.json`,
    spo2: `/spo2/date/${date}.json`,
    sleep: `/sleep/date/${date}.json`,
    weight: `/body/log/weight/date/${date}.json`,
    calories_burned: `/activities/calories/date/${date}/1d.json`,
    active_minutes: `/activities/minutesFairlyActive/date/${date}/1d.json`,
  };

  return mapping[dataType] || null;
}

function parseFitbitResponse(
  patientId: string,
  dataType: WearableDataType,
  data: Record<string, unknown>,
): NormalizedWearableData[] {
  const results: NormalizedWearableData[] = [];
  const now = new Date();

  try {
    if (dataType === 'heart_rate') {
      const heartRateData = data['activities-heart-intraday'] as {
        dataset?: Array<{ time: string; value: number }>;
      };
      if (heartRateData?.dataset) {
        // Take last 24 data points to avoid overwhelming storage
        const recent = heartRateData.dataset.slice(-24);
        for (const point of recent) {
          const [hours, minutes, seconds] = point.time.split(':').map(Number);
          const pointTime = new Date(now);
          pointTime.setHours(hours, minutes, seconds || 0, 0);

          results.push({
            id: uuidv4(),
            patientId,
            platform: 'fitbit',
            dataType: 'heart_rate',
            value: point.value,
            unit: 'bpm',
            startTime: pointTime.toISOString(),
            endTime: pointTime.toISOString(),
            syncedAt: now.toISOString(),
          });
        }
      }
    } else if (dataType === 'steps') {
      const stepsData = data['activities-steps'] as Array<{ dateTime: string; value: string }>;
      if (stepsData?.length) {
        for (const day of stepsData) {
          results.push({
            id: uuidv4(),
            patientId,
            platform: 'fitbit',
            dataType: 'steps',
            value: parseInt(day.value, 10) || 0,
            unit: 'count',
            startTime: `${day.dateTime}T00:00:00.000Z`,
            endTime: `${day.dateTime}T23:59:59.999Z`,
            syncedAt: now.toISOString(),
          });
        }
      }
    } else if (dataType === 'spo2') {
      const spo2Value = (data as { value?: number })?.value;
      if (spo2Value !== undefined) {
        results.push({
          id: uuidv4(),
          patientId,
          platform: 'fitbit',
          dataType: 'spo2',
          value: spo2Value,
          unit: '%',
          startTime: now.toISOString(),
          endTime: now.toISOString(),
          syncedAt: now.toISOString(),
        });
      }
    } else if (dataType === 'sleep') {
      const sleepData = data.sleep as Array<{
        duration: number;
        startTime: string;
        endTime: string;
        efficiency: number;
      }>;
      if (sleepData?.length) {
        const lastSleep = sleepData[sleepData.length - 1];
        results.push({
          id: uuidv4(),
          patientId,
          platform: 'fitbit',
          dataType: 'sleep',
          value: Math.round(lastSleep.duration / 3600000 * 10) / 10, // ms to hours
          unit: 'hours',
          startTime: lastSleep.startTime,
          endTime: lastSleep.endTime,
          metadata: { efficiency: lastSleep.efficiency },
          syncedAt: now.toISOString(),
        });
      }
    } else if (dataType === 'weight') {
      const weightData = data.weight as Array<{ date: string; weight: number; bmi: number }>;
      if (weightData?.length) {
        const latest = weightData[weightData.length - 1];
        results.push({
          id: uuidv4(),
          patientId,
          platform: 'fitbit',
          dataType: 'weight',
          value: latest.weight,
          unit: 'kg',
          startTime: `${latest.date}T00:00:00.000Z`,
          endTime: `${latest.date}T23:59:59.999Z`,
          metadata: { bmi: latest.bmi },
          syncedAt: now.toISOString(),
        });
      }
    } else {
      // Generic handler for remaining types
      const values = Object.values(data).flat();
      if (Array.isArray(values) && values.length > 0) {
        for (const item of values.slice(-10)) {
          if (typeof item === 'object' && item !== null && 'value' in item) {
            const val = item as { value: string | number; dateTime?: string };
            results.push({
              id: uuidv4(),
              patientId,
              platform: 'fitbit',
              dataType,
              value: typeof val.value === 'string' ? parseFloat(val.value) || 0 : val.value,
              unit: DATA_UNITS[dataType],
              startTime: val.dateTime ? `${val.dateTime}T00:00:00.000Z` : now.toISOString(),
              endTime: val.dateTime ? `${val.dateTime}T23:59:59.999Z` : now.toISOString(),
              syncedAt: now.toISOString(),
            });
          }
        }
      }
    }
  } catch (parseError) {
    console.warn(`[Wearables/Fitbit] Error parsing ${dataType} response:`, parseError instanceof Error ? parseError.message : parseError);
  }

  return results;
}

function checkThresholds(dataPoint: NormalizedWearableData): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const thresholds = HEALTH_THRESHOLDS[dataPoint.dataType];
  if (!thresholds) return alerts;

  for (const threshold of thresholds) {
    let triggered = false;

    // For "max" thresholds, alert when value exceeds the threshold
    if (threshold.max !== undefined && dataPoint.value > threshold.max) {
      triggered = true;
    }
    // For "min" thresholds (without a max), alert when value drops below the threshold
    if (threshold.min !== undefined && threshold.max === undefined && dataPoint.value < threshold.min) {
      triggered = true;
    }

    if (triggered) {
      // Determine normal range for the data type
      const normalRange = getNormalRange(dataPoint.dataType);

      alerts.push({
        id: uuidv4(),
        patientId: dataPoint.patientId,
        alertType: threshold.alertType,
        severity: threshold.severity,
        message: threshold.messageTemplate.replace('{value}', String(dataPoint.value)),
        dataType: dataPoint.dataType,
        currentValue: dataPoint.value,
        normalRange,
        detectedAt: new Date().toISOString(),
        acknowledged: false,
      });

      // Only trigger the first matching threshold per type (most specific)
      break;
    }
  }

  return alerts;
}

function getNormalRange(dataType: WearableDataType): { min: number; max: number } {
  const ranges: Record<string, { min: number; max: number }> = {
    heart_rate: { min: 60, max: 100 },
    spo2: { min: 95, max: 100 },
    blood_glucose: { min: 70, max: 140 },
    blood_pressure: { min: 90, max: 120 },
    sleep: { min: 7, max: 9 },
    steps: { min: 0, max: 30000 },
    weight: { min: 30, max: 200 },
    temperature: { min: 36.1, max: 37.2 },
    respiratory_rate: { min: 12, max: 20 },
    calories_burned: { min: 0, max: 5000 },
    active_minutes: { min: 0, max: 300 },
  };

  return ranges[dataType] || { min: 0, max: 100 };
}

// ─── Mock Data Generation ────────────────────────────────────────────────────

function generateMockWearableData(
  patientId: string,
  platform: WearablePlatform,
  dataTypes?: WearableDataType[],
): NormalizedWearableData[] {
  const now = new Date();
  const results: NormalizedWearableData[] = [];
  const typesToGenerate = dataTypes || ['heart_rate', 'steps', 'spo2', 'sleep', 'blood_pressure'] as WearableDataType[];

  for (const dataType of typesToGenerate) {
    const mockValues = getMockValuesForType(dataType);
    for (let i = 0; i < mockValues.length; i++) {
      const pointTime = new Date(now.getTime() - (mockValues.length - i) * 60 * 60 * 1000);
      results.push({
        id: uuidv4(),
        patientId,
        platform,
        dataType,
        value: mockValues[i],
        unit: DATA_UNITS[dataType],
        startTime: pointTime.toISOString(),
        endTime: new Date(pointTime.getTime() + 60 * 60 * 1000).toISOString(),
        metadata: { source: 'dev-mock', generatedAt: now.toISOString() },
        syncedAt: now.toISOString(),
      });
    }
  }

  return results;
}

function getMockValuesForType(dataType: WearableDataType): number[] {
  const mockData: Record<string, number[]> = {
    heart_rate: [72, 68, 75, 80, 74, 71, 78, 82, 76, 73, 70, 69,
                 74, 88, 92, 85, 78, 72, 68, 71, 75, 73, 70, 68],
    steps: [150, 320, 480, 1200, 2300, 3100, 4500, 5200, 6100, 7200,
            7800, 8100, 8400, 8600, 8900, 9200, 9500, 9800, 10100, 10300,
            10500, 10600, 10700, 10750],
    spo2: [98, 97, 98, 99, 97, 98, 97, 98, 99, 98, 97, 98,
           98, 97, 98, 99, 98, 97, 98, 98, 97, 98, 99, 98],
    sleep: [7.5],
    blood_pressure: [118, 122, 120, 119, 121, 117, 123, 120],
    blood_glucose: [95, 110, 130, 105, 98, 115, 125, 100],
    weight: [72.5],
    calories_burned: [80, 120, 200, 350, 450, 520, 600, 680, 750, 820,
                      900, 980, 1050, 1120, 1200, 1280, 1350, 1420, 1500, 1580,
                      1650, 1720, 1800, 1850],
    active_minutes: [0, 0, 0, 5, 10, 15, 25, 30, 35, 40,
                     42, 45, 50, 52, 55, 60, 62, 65, 70, 72,
                     75, 78, 80, 82],
    temperature: [36.5, 36.6, 36.4, 36.7, 36.5],
    respiratory_rate: [16, 15, 17, 16, 14, 15, 16, 17],
  };

  return mockData[dataType] || [0];
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const wearableService = new WearableService();
