-- Vaidyah Database Schema
-- Phase 1 + Phase 2 tables

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ ENUMS ============
CREATE TYPE user_role AS ENUM ('super_admin', 'state_admin', 'district_admin', 'center_admin', 'doctor', 'nurse', 'pharmacist', 'lab_tech', 'asha_worker', 'patient', 'researcher', 'system');
CREATE TYPE consultation_status AS ENUM ('in_progress', 'completed', 'referred', 'emergency', 'cancelled');
CREATE TYPE triage_level AS ENUM ('A', 'B', 'C', 'D', 'E');
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
    abdm_id         VARCHAR(20) UNIQUE,
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
    metadata        JSONB DEFAULT '{}',
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

-- ============ API GATEWAY SESSION TABLES ============

CREATE TABLE IF NOT EXISTS consultation_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    nurse_id        UUID REFERENCES users(id),
    doctor_id       UUID REFERENCES users(id),
    facility_id     UUID REFERENCES health_centers(id),
    status          VARCHAR(20) DEFAULT 'active',
    chief_complaint TEXT,
    language        VARCHAR(10) DEFAULT 'en',
    triage_level    triage_level,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_vitals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES consultation_sessions(id),
    heart_rate      INTEGER,
    systolic_bp     INTEGER,
    diastolic_bp    INTEGER,
    temperature     DECIMAL(4,1),
    sp_o2           INTEGER,
    respiratory_rate INTEGER,
    blood_glucose   DECIMAL(5,1),
    weight          DECIMAL(5,1),
    height          DECIMAL(5,1),
    recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    alert_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    address         TEXT,
    status          VARCHAR(20) DEFAULT 'active',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultation_sessions_patient ON consultation_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_session_vitals_session ON session_vitals(session_id);
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_patient ON emergency_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_emergency_alerts_session ON emergency_alerts(session_id);

-- ============ CLINICAL SERVICE TABLES ============

CREATE TABLE triage_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL,
    triage_level    triage_level NOT NULL,
    urgency_score   DECIMAL(5, 2),
    needs_immediate_attention BOOLEAN DEFAULT false,
    scoring_breakdown JSONB DEFAULT '{}',
    red_flags       JSONB DEFAULT '[]',
    recommended_action TEXT,
    recommended_wait_minutes INTEGER,
    clinical_impression TEXT,
    assessed_at     TIMESTAMPTZ DEFAULT NOW(),
    is_ai_assisted  BOOLEAN DEFAULT true,
    input_data      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE soap_notes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL,
    subjective      JSONB NOT NULL DEFAULT '{}',
    objective       JSONB NOT NULL DEFAULT '{}',
    assessment      JSONB NOT NULL DEFAULT '{}',
    plan            JSONB NOT NULL DEFAULT '{}',
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    generated_by    TEXT,
    is_ai_generated BOOLEAN DEFAULT true,
    is_reviewed     BOOLEAN DEFAULT false,
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INTEGRATION SERVICE TABLES ============

CREATE TABLE whatsapp_messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID REFERENCES patients(id),
    direction       VARCHAR(10) NOT NULL DEFAULT 'outbound',
    phone_number    VARCHAR(15) NOT NULL,
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text',
    template_id     TEXT,
    content         TEXT,
    status          VARCHAR(20) DEFAULT 'pending',
    wa_message_id   TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ
);

CREATE TABLE wearable_connections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    device_type     VARCHAR(50) NOT NULL,
    device_id       TEXT,
    access_token    TEXT,
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT true,
    last_sync_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wearable_data (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    connection_id   UUID REFERENCES wearable_connections(id),
    data_type       VARCHAR(50) NOT NULL,
    value           JSONB NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE health_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    alert_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) DEFAULT 'medium',
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    source          VARCHAR(50),
    data            JSONB DEFAULT '{}',
    acknowledged    BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scheduled_notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    notification_type VARCHAR(50) NOT NULL,
    channel         VARCHAR(20) DEFAULT 'push',
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    scheduled_for   TIMESTAMPTZ NOT NULL,
    sent            BOOLEAN DEFAULT false,
    sent_at         TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}',
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
CREATE INDEX idx_triage_results_session ON triage_results(session_id);
CREATE INDEX idx_soap_notes_session ON soap_notes(session_id);
CREATE INDEX idx_whatsapp_messages_patient ON whatsapp_messages(patient_id);
CREATE INDEX idx_wearable_connections_patient ON wearable_connections(patient_id);
CREATE INDEX idx_wearable_data_patient ON wearable_data(patient_id, data_type);
CREATE INDEX idx_wearable_data_recorded ON wearable_data(recorded_at DESC);
CREATE INDEX idx_health_alerts_patient ON health_alerts(patient_id, acknowledged);
CREATE INDEX idx_scheduled_notifications_due ON scheduled_notifications(scheduled_for) WHERE sent = false;

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

-- ============ SEED DATA ============

-- Health Centers
INSERT INTO health_centers (id, name, code, district, state, pincode, latitude, longitude, connectivity, phone) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'PHC Motihari', 'PHC-MOT-01', 'East Champaran', 'Bihar', '845401', 26.6488, 84.9168, 'good', '06252-240001'),
  ('a1000000-0000-0000-0000-000000000002', 'CHC Bettiah', 'CHC-BET-01', 'West Champaran', 'Bihar', '845438', 26.8009, 84.5032, 'good', '06254-230002'),
  ('a1000000-0000-0000-0000-000000000003', 'SHC Raxaul', 'SHC-RAX-01', 'East Champaran', 'Bihar', '845305', 26.9805, 84.8510, 'limited', '06255-240003'),
  ('a1000000-0000-0000-0000-000000000004', 'PHC Sitamarhi', 'PHC-SIT-01', 'Sitamarhi', 'Bihar', '843302', 26.5934, 85.4908, 'moderate', '06226-250004'),
  ('a1000000-0000-0000-0000-000000000005', 'District Hospital Patna', 'DH-PAT-01', 'Patna', 'Bihar', '800001', 25.6093, 85.1376, 'good', '0612-2200005'),
  ('a1000000-0000-0000-0000-000000000006', 'PHC Muzaffarpur', 'PHC-MUZ-01', 'Muzaffarpur', 'Bihar', '842001', 26.1225, 85.3906, 'good', '0621-2200006'),
  ('a1000000-0000-0000-0000-000000000007', 'SHC Madhubani', 'SHC-MAD-01', 'Madhubani', 'Bihar', '847211', 26.3670, 86.0747, 'limited', '06276-220007'),
  ('a1000000-0000-0000-0000-000000000008', 'CHC Samastipur', 'CHC-SAM-01', 'Samastipur', 'Bihar', '848101', 25.8617, 85.7811, 'moderate', '06274-230008')
ON CONFLICT (code) DO NOTHING;

-- Users (admin, doctors, nurses)
INSERT INTO users (id, name, email, phone, role, center_id, specialization, languages) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Dr. Priya Sharma', 'admin@vaidyah.health', '9876500001', 'super_admin', 'a1000000-0000-0000-0000-000000000005', 'Public Health', ARRAY['en', 'hi']),
  ('b1000000-0000-0000-0000-000000000002', 'Dr. Rajesh Verma', 'dr.verma@vaidyah.health', '9876500002', 'doctor', 'a1000000-0000-0000-0000-000000000005', 'General Medicine', ARRAY['en', 'hi']),
  ('b1000000-0000-0000-0000-000000000003', 'Anjali Devi', 'anjali@vaidyah.health', '9876500003', 'nurse', 'a1000000-0000-0000-0000-000000000001', NULL, ARRAY['hi']),
  ('b1000000-0000-0000-0000-000000000004', 'Sunita Kumari', 'sunita@vaidyah.health', '9876500004', 'nurse', 'a1000000-0000-0000-0000-000000000001', NULL, ARRAY['hi', 'en']),
  ('b1000000-0000-0000-0000-000000000005', 'Kavita Singh', 'kavita@vaidyah.health', '9876500005', 'nurse', 'a1000000-0000-0000-0000-000000000002', NULL, ARRAY['hi']),
  ('b1000000-0000-0000-0000-000000000006', 'Dr. Meena Gupta', 'dr.gupta@vaidyah.health', '9876500006', 'doctor', 'a1000000-0000-0000-0000-000000000001', 'Pediatrics', ARRAY['en', 'hi']),
  ('b1000000-0000-0000-0000-000000000007', 'Pooja Yadav', 'pooja@vaidyah.health', '9876500007', 'nurse', 'a1000000-0000-0000-0000-000000000003', NULL, ARRAY['hi']),
  ('b1000000-0000-0000-0000-000000000008', 'Ritu Sharma', 'ritu@vaidyah.health', '9876500008', 'nurse', 'a1000000-0000-0000-0000-000000000004', NULL, ARRAY['hi', 'en']),
  ('b1000000-0000-0000-0000-000000000009', 'Dr. Amit Kumar', 'dr.amit@vaidyah.health', '9876500009', 'doctor', 'a1000000-0000-0000-0000-000000000002', 'Internal Medicine', ARRAY['en', 'hi']),
  ('b1000000-0000-0000-0000-000000000010', 'Neha Tiwari', 'neha@vaidyah.health', '9876500010', 'nurse', 'a1000000-0000-0000-0000-000000000006', NULL, ARRAY['hi'])
ON CONFLICT DO NOTHING;

-- Patients
INSERT INTO patients (id, abdm_id, name, age, gender, phone, language_pref, blood_group) VALUES
  ('c1000000-0000-0000-0000-000000000001', '12-3456-7890-1234', 'Ram Kumar', 65, 'male', '9876543211', 'hi', 'B+'),
  ('c1000000-0000-0000-0000-000000000002', '12-3456-7890-1235', 'Sita Devi', 42, 'female', '9876543212', 'hi', 'A+'),
  ('c1000000-0000-0000-0000-000000000003', '12-3456-7890-1236', 'Mohan Lal', 58, 'male', '9876543213', 'hi', 'O+'),
  ('c1000000-0000-0000-0000-000000000004', '12-3456-7890-1237', 'Geeta Rani', 35, 'female', '9876543214', 'hi', 'AB+'),
  ('c1000000-0000-0000-0000-000000000005', '12-3456-7890-1238', 'Rajesh Kumar', 28, 'male', '9876543210', 'hi', 'A+'),
  ('c1000000-0000-0000-0000-000000000006', NULL, 'Priya Sharma', 22, 'female', '9876543215', 'en', 'B-'),
  ('c1000000-0000-0000-0000-000000000007', NULL, 'Suresh Yadav', 71, 'male', '9876543216', 'hi', 'O-'),
  ('c1000000-0000-0000-0000-000000000008', NULL, 'Meera Kumari', 48, 'female', '9876543217', 'hi', 'A+')
ON CONFLICT DO NOTHING;

-- Consultations (sample data)
INSERT INTO consultations (id, patient_id, nurse_id, center_id, status, triage_level, urgency, vitals, symptoms, diagnosis, soap_note, prosody_scores, language, duration_secs, created_at, completed_at) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'completed', 'B', 'high',
   '{"temperature": 101.8, "bp_systolic": 180, "bp_diastolic": 110, "spo2": 94, "pulse": 98, "respiratory_rate": 20, "weight": 72}',
   '["fever", "headache", "blurred vision"]', '["Hypertensive crisis", "Pyrexia"]',
   '{"subjective": {"chiefComplaint": "High fever with headache"}, "objective": {"vitalSigns": "BP 180/110, Temp 101.8F"}, "assessment": {"primaryDiagnosis": "Hypertensive urgency"}, "plan": {"medications": ["Amlodipine 5mg"]}}',
   '{"distress": 0.7, "pain": 0.5, "anxiety": 0.6, "confidence": 0.3}', 'hi', 1200, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour'),

  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'completed', 'C', 'low',
   '{"temperature": 98.6, "bp_systolic": 120, "bp_diastolic": 80, "spo2": 98, "pulse": 76, "respiratory_rate": 16, "weight": 58}',
   '["cough", "cold"]', '["Upper respiratory infection"]',
   '{"subjective": {"chiefComplaint": "Cough and cold for 2 days"}, "objective": {"vitalSigns": "Normal"}, "assessment": {"primaryDiagnosis": "URI"}, "plan": {"medications": ["Cetirizine 10mg"]}}',
   '{"distress": 0.2, "pain": 0.1, "anxiety": 0.1, "confidence": 0.8}', 'hi', 600, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2.5 hours'),

  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'completed', 'B', 'medium',
   '{"temperature": 100.4, "bp_systolic": 140, "bp_diastolic": 90, "spo2": 96, "pulse": 88, "respiratory_rate": 18, "weight": 80}',
   '["chest pain", "breathlessness"]', '["Angina", "Hypertension"]',
   '{"subjective": {"chiefComplaint": "Chest pain on exertion"}, "objective": {"vitalSigns": "BP 140/90, mild tachycardia"}, "assessment": {"primaryDiagnosis": "Stable angina"}, "plan": {"medications": ["Sorbitrate 5mg SL"]}}',
   '{"distress": 0.6, "pain": 0.7, "anxiety": 0.5, "confidence": 0.4}', 'hi', 900, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours'),

  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'completed', 'C', 'low',
   '{"temperature": 98.2, "bp_systolic": 118, "bp_diastolic": 76, "spo2": 99, "pulse": 72, "respiratory_rate": 16, "weight": 55}',
   '["abdominal pain", "nausea"]', '["Gastritis"]',
   '{"subjective": {"chiefComplaint": "Stomach pain after meals"}, "objective": {"vitalSigns": "Normal"}, "assessment": {"primaryDiagnosis": "Gastritis"}, "plan": {"medications": ["Pantoprazole 40mg"]}}',
   '{"distress": 0.3, "pain": 0.4, "anxiety": 0.2, "confidence": 0.7}', 'hi', 480, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23.5 hours'),

  ('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'in_progress', 'B', 'medium',
   '{"temperature": 101.2, "bp_systolic": 110, "bp_diastolic": 70, "spo2": 97, "pulse": 92, "respiratory_rate": 18, "weight": 68}',
   '["fever", "body aches", "fatigue"]', '["Dengue fever", "Viral fever"]',
   NULL,
   '{"distress": 0.4, "pain": 0.5, "anxiety": 0.6, "confidence": 0.5}', 'hi', NULL, NOW() - INTERVAL '30 minutes', NULL),

  ('d1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000004', 'completed', 'C', 'low',
   '{"temperature": 98.4, "bp_systolic": 115, "bp_diastolic": 75, "spo2": 99, "pulse": 70, "respiratory_rate": 14, "weight": 52}',
   '["skin rash", "itching"]', '["Allergic dermatitis"]', NULL,
   '{"distress": 0.1, "pain": 0.2, "anxiety": 0.1, "confidence": 0.9}', 'en', 360, NOW() - INTERVAL '2 days', NOW() - INTERVAL '47 hours'),

  ('d1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'completed', 'A', 'critical',
   '{"temperature": 103.2, "bp_systolic": 90, "bp_diastolic": 60, "spo2": 88, "pulse": 120, "respiratory_rate": 28, "weight": 65}',
   '["severe breathlessness", "high fever", "confusion"]', '["Severe pneumonia", "Sepsis"]',
   '{"subjective": {"chiefComplaint": "Difficulty breathing and high fever for 5 days"}, "objective": {"vitalSigns": "Critical"}, "assessment": {"primaryDiagnosis": "Severe pneumonia with sepsis"}, "plan": {"medications": ["IV Ceftriaxone", "IV fluids", "O2 supplementation"]}}',
   '{"distress": 0.9, "pain": 0.6, "anxiety": 0.8, "confidence": 0.2}', 'hi', 1800, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '3 hours'),

  ('d1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000008', 'b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000006', 'completed', 'C', 'low',
   '{"temperature": 98.6, "bp_systolic": 122, "bp_diastolic": 82, "spo2": 98, "pulse": 78, "respiratory_rate": 16, "weight": 62}',
   '["joint pain", "stiffness"]', '["Osteoarthritis"]', NULL,
   '{"distress": 0.3, "pain": 0.5, "anxiety": 0.2, "confidence": 0.7}', 'hi', 540, NOW() - INTERVAL '3 days', NOW() - INTERVAL '71 hours')
ON CONFLICT DO NOTHING;

-- Sample alerts
INSERT INTO alerts (id, patient_id, consultation_id, alert_type, title, message, metadata, sent, acknowledged) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'emergency', 'Critical Vitals Detected', 'BP 180/110 with headache and blurred vision', '{"severity": "critical"}', true, false),
  ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000005', NULL, 'trial_match', 'New Trial Match', 'You may be eligible for a clinical trial for Dengue treatment', '{"trialId": "NCT001"}', true, false),
  ('e1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', NULL, 'follow_up', 'Follow-up Reminder', 'Your follow-up appointment is due in 2 days', '{}', true, true),
  ('e1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000007', 'emergency', 'Severe Pneumonia Alert', 'Patient requires immediate referral to district hospital', '{"severity": "critical"}', true, false),
  ('e1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000003', NULL, 'medication_reminder', 'Medication Reminder', 'Please take your Amlodipine 5mg', '{}', true, true),
  ('e1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000005', NULL, 'health_alert', 'Dengue Season Advisory', 'Dengue cases rising in your area. Use mosquito nets.', '{"region": "East Champaran"}', true, false)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- ROW-LEVEL SECURITY & HIPAA COMPLIANCE
-- =============================================================================
-- Run the RLS policies script after this file to enable database-level access
-- control. If using psql, uncomment the following line:
--   \i rls-policies.sql
--
-- If running via Docker or a migration tool, execute rls-policies.sql separately
-- after init.sql completes:
--   psql -U vaidyah -d vaidyah -f /docker-entrypoint-initdb.d/rls-policies.sql
-- =============================================================================
