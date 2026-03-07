-- Vaidyah Database Schema
-- Phase 1 + Phase 2 tables

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ ENUMS ============
CREATE TYPE user_role AS ENUM ('nurse', 'doctor', 'admin', 'patient');
CREATE TYPE consultation_status AS ENUM ('in_progress', 'completed', 'referred', 'emergency', 'cancelled');
CREATE TYPE triage_level AS ENUM ('A', 'B', 'C');
CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE trial_status AS ENUM ('not_yet_recruiting', 'recruiting', 'active_not_recruiting', 'completed', 'suspended', 'terminated', 'withdrawn');
CREATE TYPE alert_type AS ENUM ('emergency', 'trial_match', 'health_alert', 'medication_reminder', 'follow_up');

-- ============ CORE TABLES ============

CREATE TABLE health_centers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    code            VARCHAR(20) UNIQUE NOT NULL,
    district        TEXT NOT NULL,
    state           TEXT NOT NULL,
    pincode         VARCHAR(6),
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    connectivity    VARCHAR(20) DEFAULT 'limited',
    phone           VARCHAR(15),
    active          BOOLEAN DEFAULT true,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub     VARCHAR(128) UNIQUE,
    role            user_role NOT NULL,
    name            TEXT NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(15),
    center_id       UUID REFERENCES health_centers(id),
    qualifications  JSONB DEFAULT '[]',
    languages       TEXT[] DEFAULT ARRAY['en', 'hi'],
    specialization  TEXT,
    active          BOOLEAN DEFAULT true,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    abdm_id         VARCHAR(14) UNIQUE,
    abha_address    VARCHAR(255),
    name            TEXT NOT NULL,
    age             INTEGER CHECK (age >= 0 AND age <= 150),
    gender          VARCHAR(10),
    date_of_birth   DATE,
    phone           VARCHAR(15),
    language_pref   VARCHAR(10) DEFAULT 'hi',
    address         JSONB,
    location        JSONB,
    blood_group     VARCHAR(5),
    medical_history JSONB DEFAULT '{
        "conditions": [],
        "allergies": [],
        "medications": [],
        "surgeries": [],
        "family_history": []
    }',
    emergency_contact JSONB,
    wearable_data   JSONB DEFAULT '{}',
    risk_profile    JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE consultations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    nurse_id        UUID REFERENCES users(id),
    doctor_id       UUID REFERENCES users(id),
    center_id       UUID NOT NULL REFERENCES health_centers(id),
    status          consultation_status DEFAULT 'in_progress',
    triage_level    triage_level,
    urgency         urgency_level DEFAULT 'low',

    -- Vitals
    vitals          JSONB DEFAULT '{
        "temperature": null,
        "bp_systolic": null,
        "bp_diastolic": null,
        "spo2": null,
        "pulse": null,
        "respiratory_rate": null,
        "weight": null
    }',

    -- AI Analysis
    symptoms        JSONB DEFAULT '[]',
    transcript      TEXT,
    transcript_original TEXT,
    language        VARCHAR(10) DEFAULT 'hi',
    soap_note       JSONB,
    diagnosis       JSONB DEFAULT '[]',
    contradictions  JSONB DEFAULT '[]',
    prosody_scores  JSONB DEFAULT '{
        "distress": 0,
        "pain": 0,
        "anxiety": 0,
        "confidence": 0
    }',

    -- Media
    voice_s3_key    TEXT,
    attachments     JSONB DEFAULT '[]',

    -- Follow-up
    prescription    JSONB,
    follow_up_date  DATE,
    notes           TEXT,

    duration_secs   INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ============ CLINICAL TRIALS (Phase 2) ============

CREATE TABLE clinical_trials (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nct_id          VARCHAR(20) UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    brief_summary   TEXT,
    plain_summary   TEXT,
    detailed_description TEXT,
    conditions      TEXT[] DEFAULT '{}',
    interventions   JSONB DEFAULT '[]',
    phase           VARCHAR(20),
    status          trial_status,
    eligibility     JSONB DEFAULT '{
        "age_min": null,
        "age_max": null,
        "gender": "all",
        "criteria_text": "",
        "inclusion": [],
        "exclusion": []
    }',
    locations       JSONB DEFAULT '[]',
    contacts        JSONB DEFAULT '[]',
    sponsor         TEXT,
    start_date      DATE,
    completion_date DATE,
    last_updated    DATE,
    enrollment      INTEGER,
    study_type      VARCHAR(50),
    url             TEXT,
    last_synced     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- trial_matches is managed by the trial-service (see services/trial-service/app/services/db.py)

-- ============ NOTIFICATIONS & ALERTS ============

CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID REFERENCES patients(id),
    consultation_id UUID REFERENCES consultations(id),
    alert_type      alert_type NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    metadata        JSONB DEFAULT '{}',
    sent            BOOLEAN DEFAULT false,
    sent_via        TEXT[],
    acknowledged    BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ AUDIT LOG ============

CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,
    resource_id     UUID,
    details         JSONB DEFAULT '{}',
    ip_address      INET,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============

CREATE INDEX idx_patients_abdm_id ON patients(abdm_id);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_nurse ON consultations(nurse_id);
CREATE INDEX idx_consultations_center ON consultations(center_id);
CREATE INDEX idx_consultations_status ON consultations(status);
CREATE INDEX idx_consultations_created ON consultations(created_at DESC);
CREATE INDEX idx_clinical_trials_nct ON clinical_trials(nct_id);
CREATE INDEX idx_clinical_trials_conditions ON clinical_trials USING GIN(conditions);
CREATE INDEX idx_clinical_trials_status ON clinical_trials(status);
-- trial_matches indexes managed by trial-service
CREATE INDEX idx_alerts_patient ON alerts(patient_id);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ============ TRIGGERS ============

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_health_centers_updated
    BEFORE UPDATE ON health_centers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_patients_updated
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
