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

let cachedToken: ABDMSessionToken | null = null;
let tokenRefreshPromise: Promise<string> | null = null;

function isTokenValid(token: ABDMSessionToken): boolean {
  const elapsed = (Date.now() - token.issuedAt) / 1000;
  return elapsed < token.expiresIn - 60;
}

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

  async getSessionToken(): Promise<string> {
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

  async verifyAbhaId(request: ABHAVerificationRequest): Promise<ABHAVerificationResponse> {
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

  async requestConsent(request: ConsentRequest): Promise<{ requestId: string; status: ConsentStatus }> {
    try {
      const headers = await this.authHeaders();
      const requestId = uuidv4();
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

  async pullHealthRecords(patientId: string): Promise<HealthRecord[]> {
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

  async pushConsultation(request: ConsultationPushRequest, consentArtifactId?: string): Promise<{ transactionId: string; status: string }> {
    try {
      const headers = await this.authHeaders();
      const transactionId = uuidv4();
      const bundle = this.buildConsultationBundle(request);

      await this.gateway.post(
        '/v1/health-information/transfer',
        {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
          notification: {
            // TODO: consentId should use the actual consent artifact ID from the consent flow,
            // not the transactionId. Pass consentArtifactId from the caller once consent
            // management is integrated end-to-end.
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
        if (isNaN(numValue)) continue; // skip invalid values

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
