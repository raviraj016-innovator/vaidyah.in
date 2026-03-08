/**
 * GraphQL Schema Definition Language (SDL) for the Vaidyah Healthcare Platform.
 *
 * Covers consultations, patients, clinical trials, triage results,
 * and real-time subscriptions for live data sync via AppSync in production.
 */

export const typeDefs = /* GraphQL */ `
  # ── Scalars ─────────────────────────────────────────────────────────────────

  scalar DateTime
  scalar JSON

  # ── Enums ───────────────────────────────────────────────────────────────────

  enum SessionStatus {
    ACTIVE
    PAUSED
    COMPLETED
    CANCELLED
  }

  enum UserRole {
    PATIENT
    NURSE
    DOCTOR
    ADMIN
    SYSTEM
  }

  enum Gender {
    MALE
    FEMALE
    OTHER
  }

  enum AlertType {
    CARDIAC
    RESPIRATORY
    TRAUMA
    OBSTETRIC
    PEDIATRIC
    OTHER
  }

  enum AlertSeverity {
    CRITICAL
    HIGH
  }

  enum AlertStatus {
    ACTIVE
    DISPATCHED
    RESOLVED
    CANCELLED
  }

  enum SubscriptionEventType {
    CONSULTATION_UPDATED
    TRIAGE_ALERT
    TRIAL_MATCH_NOTIFICATION
    VITAL_SIGNS_UPDATED
  }

  # ── Types ───────────────────────────────────────────────────────────────────

  type ConsultationSession {
    id: ID!
    patientId: ID!
    nurseId: ID!
    doctorId: ID
    facilityId: ID!
    status: SessionStatus!
    chiefComplaint: String
    language: String!
    triageLevel: Int
    startedAt: DateTime!
    completedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    patient: Patient
    vitals: [VitalSigns!]
    triageResult: TriageResult
    soapSummary: SOAPSummary
  }

  type Patient {
    id: ID!
    abdmId: String
    name: String!
    phone: String!
    dateOfBirth: String
    gender: Gender
    address: String
    district: String
    state: String
    pincode: String
    createdAt: DateTime!
    updatedAt: DateTime!
    sessions(page: Int, limit: Int): SessionConnection
  }

  type VitalSigns {
    id: ID!
    sessionId: ID!
    heartRate: Float
    systolicBp: Float
    diastolicBp: Float
    temperature: Float
    spO2: Float
    respiratoryRate: Float
    bloodGlucose: Float
    weight: Float
    height: Float
    recordedAt: DateTime!
  }

  type TriageResult {
    sessionId: ID!
    level: Int!
    label: String!
    reasoning: String!
    suggestedActions: [String!]!
    confidence: Float!
    assessedAt: DateTime!
  }

  type SOAPSummary {
    sessionId: ID!
    subjective: String!
    objective: String!
    assessment: String!
    plan: String!
    generatedAt: DateTime!
  }

  type EmergencyAlert {
    id: ID!
    sessionId: ID
    patientId: ID!
    alertType: AlertType!
    severity: AlertSeverity!
    location: Location!
    status: AlertStatus!
    createdAt: DateTime!
  }

  type Location {
    latitude: Float!
    longitude: Float!
    address: String
  }

  type ClinicalTrial {
    id: ID!
    nctId: String
    title: String!
    description: String
    phase: String
    status: String
    conditions: [String!]
    interventions: [String!]
    eligibilityCriteria: String
    sponsor: String
    location: String
    startDate: String
    endDate: String
    enrollmentCount: Int
    lastUpdated: DateTime
  }

  type TrialMatch {
    trialId: ID!
    patientId: ID!
    matchScore: Float!
    matchedCriteria: [String!]!
    unmatchedCriteria: [String!]!
    matchedAt: DateTime!
    trial: ClinicalTrial
  }

  # ── Connection / Pagination Types ───────────────────────────────────────────

  type SessionConnection {
    items: [ConsultationSession!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PatientConnection {
    items: [Patient!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type TrialConnection {
    items: [ClinicalTrial!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type TrialMatchConnection {
    items: [TrialMatch!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo {
    page: Int!
    limit: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  # ── Input Types ─────────────────────────────────────────────────────────────

  input CreateSessionInput {
    patientId: ID!
    nurseId: ID!
    facilityId: ID!
    chiefComplaint: String
    language: String
  }

  input UpdateSessionInput {
    status: SessionStatus
    doctorId: ID
    chiefComplaint: String
    triageLevel: Int
  }

  input CreatePatientInput {
    name: String!
    phone: String!
    abdmId: String
    dateOfBirth: String
    gender: Gender
    address: String
    district: String
    state: String
    pincode: String
  }

  input UpdatePatientInput {
    name: String
    phone: String
    abdmId: String
    dateOfBirth: String
    gender: Gender
    address: String
    district: String
    state: String
    pincode: String
  }

  input VitalsInput {
    heartRate: Float
    systolicBp: Float
    diastolicBp: Float
    temperature: Float
    spO2: Float
    respiratoryRate: Float
    bloodGlucose: Float
    weight: Float
    height: Float
  }

  input TrialSearchInput {
    condition: String
    location: String
    phase: String
    status: String
    page: Int
    limit: Int
  }

  input TrialMatchInput {
    patientId: ID!
    conditions: [String!]
    medications: [String!]
    page: Int
    limit: Int
  }

  input EmergencyAlertInput {
    patientId: ID!
    sessionId: ID
    alertType: AlertType!
    severity: AlertSeverity!
    location: LocationInput!
  }

  input LocationInput {
    latitude: Float!
    longitude: Float!
    address: String
  }

  # ── Subscription Payloads ──────────────────────────────────────────────────

  type ConsultationUpdatedPayload {
    sessionId: ID!
    status: SessionStatus!
    triageLevel: Int
    updatedAt: DateTime!
    updatedFields: [String!]!
  }

  type TriageAlertPayload {
    sessionId: ID!
    patientId: ID!
    level: Int!
    label: String!
    confidence: Float!
    assessedAt: DateTime!
  }

  type TrialMatchNotificationPayload {
    patientId: ID!
    trialId: ID!
    trialTitle: String!
    matchScore: Float!
    matchedAt: DateTime!
  }

  type VitalSignsUpdatedPayload {
    sessionId: ID!
    patientId: ID!
    heartRate: Float
    systolicBp: Float
    diastolicBp: Float
    temperature: Float
    spO2: Float
    respiratoryRate: Float
    recordedAt: DateTime!
  }

  # ── Queries ─────────────────────────────────────────────────────────────────

  type Query {
    # Consultations
    consultation(id: ID!): ConsultationSession
    consultations(
      patientId: ID
      nurseId: ID
      status: SessionStatus
      page: Int
      limit: Int
    ): SessionConnection!
    consultationsByFacility(
      facilityId: ID!
      status: SessionStatus
      page: Int
      limit: Int
    ): SessionConnection!

    # Patients
    patient(id: ID!): Patient
    patients(page: Int, limit: Int): PatientConnection!
    patientByAbdmId(abdmId: String!): Patient
    patientHistory(patientId: ID!, page: Int, limit: Int): SessionConnection!

    # Triage
    triageResult(sessionId: ID!): TriageResult

    # Clinical trials
    trialSearch(input: TrialSearchInput!): TrialConnection!
    trial(id: ID!): ClinicalTrial
    trialMatches(input: TrialMatchInput!): TrialMatchConnection!

    # Vitals
    sessionVitals(sessionId: ID!): [VitalSigns!]!

    # Emergency
    activeAlerts(facilityId: ID): [EmergencyAlert!]!
  }

  # ── Mutations ───────────────────────────────────────────────────────────────

  type Mutation {
    # Consultations
    createConsultation(input: CreateSessionInput!): ConsultationSession!
    updateConsultation(id: ID!, input: UpdateSessionInput!): ConsultationSession!
    completeConsultation(id: ID!): ConsultationSession!
    cancelConsultation(id: ID!, reason: String): ConsultationSession!

    # Patients
    createPatient(input: CreatePatientInput!): Patient!
    updatePatient(id: ID!, input: UpdatePatientInput!): Patient!

    # Vitals
    recordVitals(sessionId: ID!, input: VitalsInput!): VitalSigns!

    # Triage
    runTriage(sessionId: ID!): TriageResult!

    # SOAP summary
    generateSOAPSummary(sessionId: ID!): SOAPSummary!

    # Emergency
    createEmergencyAlert(input: EmergencyAlertInput!): EmergencyAlert!
    resolveEmergencyAlert(id: ID!): EmergencyAlert!

    # Trial matching
    requestTrialMatch(patientId: ID!): [TrialMatch!]!
  }

  # ── Subscriptions ──────────────────────────────────────────────────────────

  type Subscription {
    """
    Real-time updates when a consultation session changes status, triage level,
    or has new data attached (vitals, SOAP notes, etc.).
    """
    consultationUpdated(sessionId: ID, facilityId: ID): ConsultationUpdatedPayload!

    """
    Fires when a triage assessment completes with critical or urgent results.
    Nurses and doctors subscribe for immediate alerts, scoped by facility.
    """
    triageAlert(facilityId: ID): TriageAlertPayload!

    """
    Notifies a patient when a new clinical trial match is found.
    """
    trialMatchNotification(patientId: ID!): TrialMatchNotificationPayload!

    """
    Real-time vital signs stream during active consultations.
    Used by the nurse portal and doctor dashboard for live monitoring.
    """
    vitalSignsUpdated(sessionId: ID!): VitalSignsUpdatedPayload!
  }
`;
