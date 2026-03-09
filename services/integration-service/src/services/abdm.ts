import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { query, queryOne, queryMany } from '../db';
import {
  ABDMSessionToken,
  ABHAVerificationRequest,
  ABHAVerificationResponse,
  ConsentRequest,
  ConsentArtifact,
  ConsentStatus,
  ConsultationPushRequest,
  FHIRBundle,
  FHIRBundleEntry,
  HealthRecord,
} from '../types';
import { ExternalServiceError } from '../middleware/errorHandler';

const SERVICE_NAME = 'ABDM';
const isDevMode = config.server.nodeEnv !== 'production';

let cachedToken: ABDMSessionToken | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

function isTokenValid(token: ABDMSessionToken): boolean {
  const elapsed = (Date.now() - token.issuedAt) / 1000;
  return elapsed < token.expiresIn - 60;
}

// ─── Dev-Mode Mock Data ──────────────────────────────────────────────────────

function mockVerificationResponse(abhaId: string): ABHAVerificationResponse {
  return {
    verified: true,
    abhaNumber: '91-1234-5678-9012',
    abhaAddress: abhaId.includes('@') ? abhaId : `${abhaId}@abdm`,
    name: 'Rajesh Kumar',
    yearOfBirth: '1985',
    gender: 'M',
    mobile: '9876543210',
    healthId: abhaId,
    status: 'ACTIVE',
  };
}

function mockConsentResponse(requestId: string): { requestId: string; status: ConsentStatus } {
  return {
    requestId,
    status: 'REQUESTED',
  };
}

function mockConsentStatusResponse(requestId: string): { requestId: string; status: ConsentStatus; artifact?: ConsentArtifact } {
  return {
    requestId,
    status: 'GRANTED',
    artifact: {
      consentId: uuidv4(),
      requestId,
      status: 'GRANTED',
      consentDetail: {
        purpose: { code: 'CAREMGT', text: 'Care Management' },
        patient: { id: 'rajesh.kumar@abdm' },
        hip: { id: config.abdm.hipId, name: config.abdm.hipName },
        hiTypes: ['OPConsultation', 'Prescription', 'DiagnosticReport'],
        permission: {
          accessMode: 'VIEW',
          dateRange: {
            from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          },
          dataEraseAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          frequency: { unit: 'HOUR', value: 1, repeats: 0 },
        },
      },
      signature: 'mock-signature-dev-mode',
      grantedAt: new Date().toISOString(),
    },
  };
}

function mockHealthRecords(patientId: string): HealthRecord[] {
  const now = new Date().toISOString();
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: uuidv4(),
      patientId,
      recordType: 'OPConsultation',
      sourceHipId: 'max-hospital-001',
      sourceHipName: 'Max Super Speciality Hospital',
      fhirBundle: {
        resourceType: 'Bundle',
        id: uuidv4(),
        type: 'collection',
        timestamp: oneMonthAgo,
        entry: [
          {
            fullUrl: `urn:uuid:${uuidv4()}`,
            resource: {
              resourceType: 'Composition',
              id: uuidv4(),
              title: 'General Consultation - Upper Respiratory Infection',
              status: 'final',
              type: { coding: [{ system: 'http://snomed.info/sct', code: '371530004', display: 'Clinical consultation report' }] },
              date: oneMonthAgo,
              subject: { reference: `Patient/${patientId}` },
            },
          },
        ],
      },
      summary: 'General Consultation - Upper Respiratory Infection',
      recordDate: oneMonthAgo,
      fetchedAt: now,
      consentArtifactId: uuidv4(),
    },
    {
      id: uuidv4(),
      patientId,
      recordType: 'Prescription',
      sourceHipId: 'apollo-clinic-002',
      sourceHipName: 'Apollo Clinic - Connaught Place',
      fhirBundle: {
        resourceType: 'Bundle',
        id: uuidv4(),
        type: 'collection',
        timestamp: twoMonthsAgo,
        entry: [
          {
            fullUrl: `urn:uuid:${uuidv4()}`,
            resource: {
              resourceType: 'MedicationRequest',
              id: uuidv4(),
              status: 'active',
              intent: 'order',
              medicationCodeableConcept: { text: 'Metformin 500mg' },
              subject: { reference: `Patient/${patientId}` },
              dosageInstruction: [{ text: '500mg twice daily after meals' }],
            },
          },
          {
            fullUrl: `urn:uuid:${uuidv4()}`,
            resource: {
              resourceType: 'MedicationRequest',
              id: uuidv4(),
              status: 'active',
              intent: 'order',
              medicationCodeableConcept: { text: 'Amlodipine 5mg' },
              subject: { reference: `Patient/${patientId}` },
              dosageInstruction: [{ text: '5mg once daily in the morning' }],
            },
          },
        ],
      },
      summary: 'Prescription - Metformin 500mg, Amlodipine 5mg',
      recordDate: twoMonthsAgo,
      fetchedAt: now,
      consentArtifactId: uuidv4(),
    },
    {
      id: uuidv4(),
      patientId,
      recordType: 'DiagnosticReport',
      sourceHipId: 'thyrocare-003',
      sourceHipName: 'Thyrocare Technologies',
      fhirBundle: {
        resourceType: 'Bundle',
        id: uuidv4(),
        type: 'collection',
        timestamp: twoMonthsAgo,
        entry: [
          {
            fullUrl: `urn:uuid:${uuidv4()}`,
            resource: {
              resourceType: 'DiagnosticReport',
              id: uuidv4(),
              status: 'final',
              code: { text: 'Complete Blood Count (CBC)' },
              subject: { reference: `Patient/${patientId}` },
              conclusion: 'All values within normal range. Hemoglobin: 14.2 g/dL, WBC: 7500/uL, Platelets: 250000/uL',
            },
          },
        ],
      },
      summary: 'CBC Report - All values within normal range',
      recordDate: twoMonthsAgo,
      fetchedAt: now,
      consentArtifactId: uuidv4(),
    },
  ];
}

function mockPushResponse(): { transactionId: string; status: string } {
  return {
    transactionId: uuidv4(),
    status: 'TRANSFERRED',
  };
}

// ─── ABDM Service Class ─────────────────────────────────────────────────────

export class ABDMService {
  private readonly gateway: AxiosInstance;
  private readonly healthId: AxiosInstance;
  private readonly consentManager: AxiosInstance;
  private readonly hiuClient: AxiosInstance;

  constructor() {
    const timeout = config.abdm.requestTimeout;

    this.gateway = axios.create({
      baseURL: config.abdm.gatewayUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.healthId = axios.create({
      baseURL: config.abdm.healthIdUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.consentManager = axios.create({
      baseURL: config.abdm.consentManagerUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.hiuClient = axios.create({
      baseURL: config.abdm.healthInfoUrl,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ─── Session Token Management ──────────────────────────────────────────

  async getSessionToken(): Promise<string> {
    if (isDevMode) {
      console.log('[ABDM] Dev mode: returning mock session token');
      return 'dev-mock-abdm-session-token';
    }

    if (cachedToken && isTokenValid(cachedToken)) {
      return cachedToken.accessToken;
    }

    // Deduplicate concurrent refresh attempts
    if (tokenRefreshPromise) {
      return await tokenRefreshPromise;
    }

    tokenRefreshPromise = this._fetchSessionToken();
    try {
      return await tokenRefreshPromise;
    } finally {
      tokenRefreshPromise = null;
    }
  }

  private async _fetchSessionToken(): Promise<string> {
    try {
      const response = await axios.post(config.abdm.authUrl, {
        clientId: config.abdm.clientId,
        clientSecret: config.abdm.clientSecret,
        grantType: 'client_credentials',
      }, { timeout: config.abdm.requestTimeout });

      cachedToken = {
        accessToken: response.data.accessToken,
        expiresIn: response.data.expiresIn,
        tokenType: response.data.tokenType || 'Bearer',
        refreshToken: response.data.refreshToken,
        issuedAt: Date.now(),
      };

      return cachedToken.accessToken;
    } catch (error) {
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Failed to obtain session token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getSessionToken();
    return {
      Authorization: `Bearer ${token}`,
      'X-CM-ID': config.abdm.hiuId,
    };
  }

  // ─── ABHA ID Verification ──────────────────────────────────────────────

  async verifyAbhaId(request: ABHAVerificationRequest): Promise<ABHAVerificationResponse> {
    if (isDevMode) {
      console.log(`[ABDM] Dev mode: mock verification for ABHA ID ${request.abhaId}`);
      const mockResult = mockVerificationResponse(request.abhaId);

      try {
        await query(
          `INSERT INTO abdm_verifications (id, abha_id, auth_method, purpose, status, response_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [uuidv4(), request.abhaId, request.authMethod, request.purpose, 'COMPLETED', JSON.stringify(mockResult)]
        );
      } catch (dbError) {
        console.warn('[ABDM] Dev mode: could not persist verification to DB:', dbError instanceof Error ? dbError.message : dbError);
      }

      return mockResult;
    }

    try {
      const headers = await this.authHeaders();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();

      const response = await this.healthId.post(
        '/v1/auth/init',
        {
          id: requestId,
          timestamp,
          authMethod: request.authMethod,
          healthid: request.abhaId,
          purpose: request.purpose,
        },
        { headers }
      );

      const verificationData = response.data;

      await query(
        `INSERT INTO abdm_verifications (id, abha_id, auth_method, purpose, status, response_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [requestId, request.abhaId, request.authMethod, request.purpose, 'COMPLETED', JSON.stringify(verificationData)]
      );

      return {
        verified: true,
        abhaNumber: verificationData.healthIdNumber || verificationData.abhaNumber,
        abhaAddress: verificationData.healthId || verificationData.abhaAddress,
        name: verificationData.name,
        yearOfBirth: verificationData.yearOfBirth,
        gender: verificationData.gender,
        mobile: verificationData.mobile,
        healthId: verificationData.healthId,
        status: verificationData.status || 'ACTIVE',
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;

      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status === 404 || status === 422) {
          return {
            verified: false,
            abhaNumber: '',
            abhaAddress: '',
            name: '',
            yearOfBirth: '',
            gender: 'M',
            mobile: '',
            healthId: '',
            status: 'INACTIVE',
          };
        }
      }

      throw new ExternalServiceError(
        SERVICE_NAME,
        `ABHA verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Consent Management ────────────────────────────────────────────────

  async requestConsent(request: ConsentRequest): Promise<{ requestId: string; status: ConsentStatus }> {
    const requestId = uuidv4();

    if (isDevMode) {
      console.log(`[ABDM] Dev mode: mock consent request for patient ${request.patientId}`);

      try {
        await query(
          `INSERT INTO consent_requests (id, patient_id, abha_address, purpose, hi_types, date_range_from, date_range_to, expiry, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            requestId,
            request.patientId,
            request.abhaAddress,
            request.purpose,
            JSON.stringify(request.hiTypes),
            request.dateRange.from,
            request.dateRange.to,
            request.expiry,
            'REQUESTED',
          ]
        );
      } catch (dbError) {
        console.warn('[ABDM] Dev mode: could not persist consent request to DB:', dbError instanceof Error ? dbError.message : dbError);
      }

      return mockConsentResponse(requestId);
    }

    try {
      const headers = await this.authHeaders();
      const timestamp = new Date().toISOString();

      const consentPayload = {
        requestId,
        timestamp,
        consent: {
          purpose: {
            text: this.getPurposeText(request.purpose),
            code: request.purpose,
          },
          patient: {
            id: request.abhaAddress,
          },
          hiu: {
            id: config.abdm.hiuId,
          },
          hip: request.hipId ? { id: request.hipId } : undefined,
          requester: {
            name: config.abdm.hiuName,
            identifier: {
              type: 'REGNO',
              value: config.abdm.hiuId,
              system: 'https://www.mciindia.org',
            },
          },
          hiTypes: request.hiTypes,
          permission: {
            accessMode: 'VIEW',
            dateRange: {
              from: request.dateRange.from,
              to: request.dateRange.to,
            },
            dataEraseAt: request.expiry,
            frequency: {
              unit: 'HOUR',
              value: 1,
              repeats: 0,
            },
          },
        },
      };

      await this.consentManager.post('/v1/consent-requests/init', consentPayload, { headers });

      await query(
        `INSERT INTO consent_requests (id, patient_id, abha_address, purpose, hi_types, date_range_from, date_range_to, expiry, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          requestId,
          request.patientId,
          request.abhaAddress,
          request.purpose,
          JSON.stringify(request.hiTypes),
          request.dateRange.from,
          request.dateRange.to,
          request.expiry,
          'REQUESTED',
        ]
      );

      return { requestId, status: 'REQUESTED' };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Consent request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getConsentStatus(requestId: string): Promise<{ requestId: string; status: ConsentStatus; artifact?: ConsentArtifact }> {
    if (isDevMode) {
      console.log(`[ABDM] Dev mode: mock consent status for request ${requestId}`);

      // Try to get status from DB first
      const dbRecord = await queryOne<{ status: string }>(
        `SELECT status FROM consent_requests WHERE id = $1`,
        [requestId]
      ).catch(() => null);

      if (dbRecord) {
        // Simulate consent being granted after initial request
        if (dbRecord.status === 'REQUESTED') {
          try {
            await query(
              `UPDATE consent_requests SET status = 'GRANTED', updated_at = NOW() WHERE id = $1`,
              [requestId]
            );
          } catch {
            // ignore DB errors in dev mode
          }
        }
      }

      return mockConsentStatusResponse(requestId);
    }

    try {
      const headers = await this.authHeaders();

      const response = await this.consentManager.post(
        '/v1/consent-requests/status',
        {
          requestId,
          timestamp: new Date().toISOString(),
          consentRequestId: requestId,
        },
        { headers }
      );

      const consentData = response.data;
      const status: ConsentStatus = consentData.status?.status || 'REQUESTED';

      await query(
        `UPDATE consent_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, requestId]
      );

      const result: { requestId: string; status: ConsentStatus; artifact?: ConsentArtifact } = {
        requestId,
        status,
      };

      if (status === 'GRANTED' && consentData.consentArtefacts?.length) {
        result.artifact = consentData.consentArtefacts[0];
      }

      return result;
    } catch (error) {
      const dbRecord = await queryOne<{ status: string }>(
        `SELECT status FROM consent_requests WHERE id = $1`,
        [requestId]
      );

      if (dbRecord) {
        return { requestId, status: dbRecord.status as ConsentStatus };
      }

      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Consent status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async revokeConsent(requestId: string): Promise<{ requestId: string; status: ConsentStatus }> {
    if (isDevMode) {
      console.log(`[ABDM] Dev mode: mock consent revocation for request ${requestId}`);

      try {
        await query(
          `UPDATE consent_requests SET status = 'REVOKED', updated_at = NOW() WHERE id = $1`,
          [requestId]
        );
      } catch {
        // ignore DB errors in dev mode
      }

      return { requestId, status: 'REVOKED' };
    }

    try {
      const headers = await this.authHeaders();

      await this.consentManager.post(
        '/v1/consent-requests/revoke',
        {
          requestId,
          timestamp: new Date().toISOString(),
          consentRequestId: requestId,
        },
        { headers }
      );

      await query(
        `UPDATE consent_requests SET status = 'REVOKED', updated_at = NOW() WHERE id = $1`,
        [requestId]
      );

      return { requestId, status: 'REVOKED' };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Consent revocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async listConsents(patientId: string): Promise<Array<{ id: string; status: ConsentStatus; purpose: string; hiTypes: string[]; createdAt: string }>> {
    const consents = await queryMany<{
      id: string;
      status: string;
      purpose: string;
      hi_types: string;
      created_at: string;
    }>(
      `SELECT id, status, purpose, hi_types, created_at
       FROM consent_requests
       WHERE patient_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [patientId]
    );

    return consents.map((c) => ({
      id: c.id,
      status: c.status as ConsentStatus,
      purpose: c.purpose,
      hiTypes: typeof c.hi_types === 'string' ? JSON.parse(c.hi_types) : (c.hi_types || []),
      createdAt: c.created_at,
    }));
  }

  // ─── Health Record Pull ────────────────────────────────────────────────

  async pullHealthRecords(patientId: string): Promise<HealthRecord[]> {
    if (isDevMode) {
      console.log(`[ABDM] Dev mode: returning mock health records for patient ${patientId}`);

      // Return mock data, but also try to load any locally stored records
      let dbRecords: HealthRecord[] = [];
      try {
        dbRecords = await queryMany<HealthRecord>(
          `SELECT id, patient_id AS "patientId", record_type AS "recordType",
                  source_hip_id AS "sourceHipId", source_hip_name AS "sourceHipName",
                  fhir_bundle AS "fhirBundle", summary, record_date AS "recordDate",
                  fetched_at AS "fetchedAt", consent_artifact_id AS "consentArtifactId"
           FROM health_records WHERE patient_id = $1
           ORDER BY record_date DESC LIMIT 100`,
          [patientId]
        );
      } catch {
        // DB unavailable in dev mode
      }

      if (dbRecords.length > 0) {
        return dbRecords;
      }

      return mockHealthRecords(patientId);
    }

    const grantedConsents = await queryMany<{ id: string; abha_address: string; hi_types: string }>(
      `SELECT id, abha_address, hi_types FROM consent_requests
       WHERE patient_id = $1 AND status = 'GRANTED' AND expiry > NOW()
       ORDER BY created_at DESC LIMIT 10`,
      [patientId]
    );

    if (!grantedConsents.length) {
      return queryMany<HealthRecord>(
        `SELECT id, patient_id AS "patientId", record_type AS "recordType",
                source_hip_id AS "sourceHipId", source_hip_name AS "sourceHipName",
                fhir_bundle AS "fhirBundle", summary, record_date AS "recordDate",
                fetched_at AS "fetchedAt", consent_artifact_id AS "consentArtifactId"
         FROM health_records WHERE patient_id = $1
         ORDER BY record_date DESC LIMIT 100`,
        [patientId]
      );
    }

    const records: HealthRecord[] = [];

    for (const consent of grantedConsents) {
      try {
        const headers = await this.authHeaders();

        const response = await this.hiuClient.post(
          '/v1/health-information/cm/request',
          {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
            hiRequest: {
              consent: { id: consent.id },
              dateRange: {
                from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString(),
              },
              dataPushUrl: `${config.abdm.callbackBaseUrl}/api/v1/abdm/data/push`,
              keyMaterial: {
                cryptoAlg: 'ECDH',
                curve: 'Curve25519',
                dhPublicKey: { expiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() },
              },
            },
          },
          { headers }
        );

        if (response.data?.entries) {
          for (const entry of response.data.entries) {
            const record: HealthRecord = {
              id: uuidv4(),
              patientId,
              recordType: this.inferRecordType(entry),
              sourceHipId: entry.hipId || config.abdm.hipId,
              sourceHipName: entry.hipName || '',
              fhirBundle: entry.content as FHIRBundle,
              summary: this.generateRecordSummary(entry.content),
              recordDate: entry.content?.timestamp || new Date().toISOString(),
              fetchedAt: new Date().toISOString(),
              consentArtifactId: consent.id,
            };

            await query(
              `INSERT INTO health_records (id, patient_id, record_type, source_hip_id, source_hip_name, fhir_bundle, summary, record_date, fetched_at, consent_artifact_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (patient_id, record_type, record_date) DO UPDATE SET
                 fhir_bundle = EXCLUDED.fhir_bundle,
                 summary = EXCLUDED.summary,
                 source_hip_id = EXCLUDED.source_hip_id,
                 source_hip_name = EXCLUDED.source_hip_name,
                 fetched_at = EXCLUDED.fetched_at,
                 consent_artifact_id = EXCLUDED.consent_artifact_id,
                 updated_at = NOW()`,
              [
                record.id, record.patientId, record.recordType,
                record.sourceHipId, record.sourceHipName,
                JSON.stringify(record.fhirBundle), record.summary,
                record.recordDate, record.fetchedAt, record.consentArtifactId,
              ]
            );

            records.push(record);
          }
        }
      } catch (error) {
        console.error(`[ABDM] Failed to pull records for consent ${consent.id}:`, error instanceof Error ? error.message : error);
      }
    }

    if (!records.length) {
      return queryMany<HealthRecord>(
        `SELECT id, patient_id AS "patientId", record_type AS "recordType",
                source_hip_id AS "sourceHipId", source_hip_name AS "sourceHipName",
                fhir_bundle AS "fhirBundle", summary, record_date AS "recordDate",
                fetched_at AS "fetchedAt", consent_artifact_id AS "consentArtifactId"
         FROM health_records WHERE patient_id = $1
         ORDER BY record_date DESC LIMIT 100`,
        [patientId]
      );
    }

    return records;
  }

  // ─── Health Record Push ────────────────────────────────────────────────

  async pushConsultation(request: ConsultationPushRequest, consentArtifactId?: string): Promise<{ transactionId: string; status: string }> {
    const transactionId = uuidv4();
    const bundle = this.buildConsultationBundle(request);

    if (isDevMode) {
      console.log(`[ABDM] Dev mode: mock push consultation ${request.consultationId} for patient ${request.patientId}`);

      try {
        await query(
          `INSERT INTO health_records (id, patient_id, record_type, source_hip_id, source_hip_name, fhir_bundle, summary, record_date, fetched_at, consent_artifact_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8)`,
          [
            transactionId,
            request.patientId,
            'OPConsultation',
            config.abdm.hipId,
            config.abdm.hipName,
            JSON.stringify(bundle),
            `Consultation by Dr. ${request.doctorId}: ${request.diagnosis.join(', ')}`,
            request.consultationId,
          ]
        );
      } catch (dbError) {
        console.warn('[ABDM] Dev mode: could not persist consultation to DB:', dbError instanceof Error ? dbError.message : dbError);
      }

      return mockPushResponse();
    }

    try {
      const headers = await this.authHeaders();

      await this.gateway.post(
        '/v1/health-information/transfer',
        {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          notification: {
            consentId: consentArtifactId || transactionId,
            transactionId,
            doneAt: new Date().toISOString(),
            notifier: {
              type: 'HIP',
              id: config.abdm.hipId,
            },
            statusNotification: {
              sessionStatus: 'TRANSFERRED',
              hipId: config.abdm.hipId,
              statusResponses: [
                {
                  careContextReference: request.consultationId,
                  hiStatus: 'OK',
                  description: 'Health information successfully transferred',
                },
              ],
            },
          },
          entries: [
            {
              content: JSON.stringify(bundle),
              media: 'application/fhir+json',
              checksum: crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex'),
              careContextReference: request.consultationId,
            },
          ],
        },
        { headers }
      );

      await query(
        `INSERT INTO health_records (id, patient_id, record_type, source_hip_id, source_hip_name, fhir_bundle, summary, record_date, fetched_at, consent_artifact_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8)`,
        [
          transactionId,
          request.patientId,
          'OPConsultation',
          config.abdm.hipId,
          config.abdm.hipName,
          JSON.stringify(bundle),
          `Consultation by Dr. ${request.doctorId}: ${request.diagnosis.join(', ')}`,
          request.consultationId,
        ]
      );

      return { transactionId, status: 'TRANSFERRED' };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        SERVICE_NAME,
        `Consultation push failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── ABDM Gateway Callbacks (HIP/HIU) ─────────────────────────────────

  async handleConsentNotification(payload: {
    requestId: string;
    consentRequestId: string;
    status: string;
    consentArtefacts?: Array<{ id: string }>;
  }): Promise<void> {
    const status = payload.status as ConsentStatus;

    await query(
      `UPDATE consent_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, payload.consentRequestId]
    );

    if (status === 'GRANTED' && payload.consentArtefacts?.length) {
      console.log(`[ABDM] Consent ${payload.consentRequestId} granted with ${payload.consentArtefacts.length} artefact(s)`);
    }

    console.log(`[ABDM] Consent notification processed: ${payload.consentRequestId} -> ${status}`);
  }

  async handleHealthInfoNotification(payload: {
    transactionId: string;
    sessionStatus: string;
  }): Promise<void> {
    console.log(`[ABDM] Health info notification: transaction ${payload.transactionId} -> ${payload.sessionStatus}`);
  }

  // ─── FHIR Bundle Construction ─────────────────────────────────────────

  private buildConsultationBundle(request: ConsultationPushRequest): FHIRBundle {
    const bundleId = uuidv4();
    const timestamp = new Date().toISOString();

    const entries: FHIRBundleEntry[] = [
      {
        fullUrl: `urn:uuid:${uuidv4()}`,
        resource: {
          resourceType: 'Composition',
          id: uuidv4(),
          meta: { lastUpdated: timestamp, profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/OPConsultRecord'] },
          type: { coding: [{ system: 'http://snomed.info/sct', code: '371530004', display: 'Clinical consultation report' }] },
          title: 'OP Consultation Record',
          status: 'final',
          date: timestamp,
          subject: { reference: `Patient/${request.patientId}` },
          author: [{ reference: `Practitioner/${request.doctorId}` }],
        },
      },
      {
        fullUrl: `urn:uuid:${uuidv4()}`,
        resource: {
          resourceType: 'Encounter',
          id: uuidv4(),
          meta: { lastUpdated: timestamp },
          status: 'finished',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
          subject: { reference: `Patient/${request.patientId}` },
          identifier: [{ value: request.consultationId }],
        },
      },
    ];

    for (const diagnosis of request.diagnosis) {
      entries.push({
        fullUrl: `urn:uuid:${uuidv4()}`,
        resource: {
          resourceType: 'Condition',
          id: uuidv4(),
          meta: { lastUpdated: timestamp },
          code: { text: diagnosis },
          subject: { reference: `Patient/${request.patientId}` },
          clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
        },
      });
    }

    for (const prescription of request.prescriptions) {
      entries.push({
        fullUrl: `urn:uuid:${uuidv4()}`,
        resource: {
          resourceType: 'MedicationRequest',
          id: uuidv4(),
          meta: { lastUpdated: timestamp },
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: { text: prescription.medicineName },
          subject: { reference: `Patient/${request.patientId}` },
          dosageInstruction: [{
            text: `${prescription.dosage} ${prescription.frequency} for ${prescription.duration}`,
            additionalInstruction: prescription.instructions ? [{ text: prescription.instructions }] : undefined,
          }],
        },
      });
    }

    if (request.vitals) {
      for (const vital of request.vitals) {
        const numValue = parseFloat(vital.value);
        if (isNaN(numValue)) continue;

        entries.push({
          fullUrl: `urn:uuid:${uuidv4()}`,
          resource: {
            resourceType: 'Observation',
            id: uuidv4(),
            meta: { lastUpdated: timestamp },
            status: 'final',
            code: { text: vital.type },
            subject: { reference: `Patient/${request.patientId}` },
            valueQuantity: { value: numValue, unit: vital.unit },
            effectiveDateTime: vital.measuredAt,
          },
        });
      }
    }

    return {
      resourceType: 'Bundle',
      id: bundleId,
      type: 'collection',
      timestamp,
      entry: entries,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private getPurposeText(code: string): string {
    const purposes: Record<string, string> = {
      CAREMGT: 'Care Management',
      BTG: 'Break the Glass',
      PUBHLTH: 'Public Health',
      HPAYMT: 'Healthcare Payment',
      DSRCH: 'Disease Specific Healthcare Research',
      PATRQT: 'Patient Requested',
    };
    return purposes[code] || code;
  }

  private inferRecordType(entry: { content?: FHIRBundle }): HealthRecord['recordType'] {
    if (!entry.content?.entry?.length) return 'HealthDocumentRecord';

    const resourceTypes = entry.content.entry.map((e) => e.resource?.resourceType);

    if (resourceTypes.includes('MedicationRequest')) return 'Prescription';
    if (resourceTypes.includes('DiagnosticReport')) return 'DiagnosticReport';
    if (resourceTypes.includes('ImmunizationRecommendation') || resourceTypes.includes('Immunization')) return 'ImmunizationRecord';
    if (resourceTypes.includes('Encounter') || resourceTypes.includes('Composition')) return 'OPConsultation';

    return 'HealthDocumentRecord';
  }

  private generateRecordSummary(content: FHIRBundle | undefined): string {
    if (!content?.entry?.length) return 'Health record';

    const composition = content.entry.find((e) => e.resource?.resourceType === 'Composition');
    if (composition?.resource) {
      return (composition.resource as { title?: string }).title || 'Health record';
    }

    const types = [...new Set(content.entry.map((e) => e.resource?.resourceType).filter(Boolean))];
    return `Health record containing: ${types.join(', ')}`;
  }
}

export const abdmService = new ABDMService();
