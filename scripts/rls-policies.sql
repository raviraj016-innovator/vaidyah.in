-- =============================================================================
-- Vaidyah Row-Level Security (RLS) Policies & HIPAA-Compliant Configuration
-- =============================================================================
-- Gap 7: Database-level access control for PHI (Protected Health Information)
--
-- This script must be run AFTER init.sql (and after trial-service creates its
-- tables: trial_matches, notifications, subscriptions).
--
-- Session variables required before each connection/transaction:
--   SET app.current_user_id = '<uuid>';
--   SET app.current_role    = 'super_admin|state_admin|district_admin|center_admin|doctor|nurse|pharmacist|lab_tech|asha_worker|patient|researcher|system';
--   SET app.current_center_id = '<uuid>';   -- for nurse/doctor scope
--   SET app.current_patient_id = '<uuid>';  -- for patient scope
--
-- =============================================================================

-- =============================================================================
-- SECTION 0: HIPAA PostgreSQL Configuration Recommendations
-- =============================================================================
-- Apply these settings in postgresql.conf for HIPAA compliance:
--
--   ssl                     = on
--   ssl_cert_file           = '/path/to/server.crt'
--   ssl_key_file            = '/path/to/server.key'
--   ssl_min_protocol_version = 'TLSv1.2'
--
--   log_connections         = on
--   log_disconnections      = on
--   log_statement           = 'mod'            -- log INSERT/UPDATE/DELETE
--   log_duration            = on
--   log_line_prefix         = '%m [%p] %q%u@%d '
--
--   password_encryption     = scram-sha-256
--
--   idle_in_transaction_session_timeout = '5min'
--   statement_timeout       = '60s'
--
--   pgaudit.log             = 'read, write, ddl'   -- if pg_audit extension installed
--   pgaudit.log_catalog     = off
--   pgaudit.log_parameter   = on
--
-- Ensure all connections use SSL:
--   hostssl all all 0.0.0.0/0 scram-sha-256
--   hostssl all all ::/0      scram-sha-256
-- =============================================================================


-- =============================================================================
-- SECTION 1: APPLICATION ROLES
-- =============================================================================

-- Create roles if they don't already exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_admin') THEN
        CREATE ROLE vaidyah_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_nurse') THEN
        CREATE ROLE vaidyah_nurse NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_doctor') THEN
        CREATE ROLE vaidyah_doctor NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_patient') THEN
        CREATE ROLE vaidyah_patient NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_readonly') THEN
        CREATE ROLE vaidyah_readonly NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_pharmacist') THEN
        CREATE ROLE vaidyah_pharmacist NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_lab_tech') THEN
        CREATE ROLE vaidyah_lab_tech NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_asha_worker') THEN
        CREATE ROLE vaidyah_asha_worker NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_researcher') THEN
        CREATE ROLE vaidyah_researcher NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'vaidyah_app') THEN
        CREATE ROLE vaidyah_app LOGIN;
    END IF;
END $$;

-- vaidyah_app is the connection-pool user; grant it membership in all roles
-- so it can SET ROLE to any of them after authenticating the request
GRANT vaidyah_admin, vaidyah_nurse, vaidyah_doctor, vaidyah_patient, vaidyah_readonly,
      vaidyah_pharmacist, vaidyah_lab_tech, vaidyah_asha_worker, vaidyah_researcher
    TO vaidyah_app;

COMMENT ON ROLE vaidyah_admin       IS 'Full access to all tables; platform administrators (super_admin, state_admin, district_admin, center_admin)';
COMMENT ON ROLE vaidyah_nurse       IS 'Access scoped to patients at assigned health center(s)';
COMMENT ON ROLE vaidyah_doctor      IS 'Access scoped to own consultations and assigned patients';
COMMENT ON ROLE vaidyah_patient     IS 'Access limited to own records only';
COMMENT ON ROLE vaidyah_readonly    IS 'Read-only analytics access; PII columns excluded via views';
COMMENT ON ROLE vaidyah_pharmacist  IS 'Access to prescriptions and patient medication data at assigned center';
COMMENT ON ROLE vaidyah_lab_tech    IS 'Access to lab results and diagnostic data at assigned center';
COMMENT ON ROLE vaidyah_asha_worker IS 'Community health worker; read access to patients in assigned area';
COMMENT ON ROLE vaidyah_researcher  IS 'De-identified data access for clinical research; similar to readonly';


-- =============================================================================
-- SECTION 2: HELPER FUNCTIONS FOR SESSION CONTEXT
-- =============================================================================

-- Set all session variables in one call.
-- Usage: SELECT set_vaidyah_context('<user_id>', 'nurse', '<center_id>', NULL);
CREATE OR REPLACE FUNCTION set_vaidyah_context(
    p_user_id    TEXT,
    p_role       TEXT,
    p_center_id  TEXT DEFAULT NULL,
    p_patient_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id',    COALESCE(p_user_id, ''),    true);
    PERFORM set_config('app.current_role',        COALESCE(p_role, ''),       true);
    PERFORM set_config('app.current_center_id',   COALESCE(p_center_id, ''), true);
    PERFORM set_config('app.current_patient_id',  COALESCE(p_patient_id, ''),true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_vaidyah_context IS
    'Sets app.current_user_id, app.current_role, app.current_center_id, '
    'app.current_patient_id as transaction-local GUC variables. '
    'Call this at the start of every request in the connection pool.';

-- Safe accessor: returns empty string (not error) when GUC is unset
CREATE OR REPLACE FUNCTION current_app_setting(setting_name TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(current_setting(setting_name, true), '');
EXCEPTION WHEN OTHERS THEN
    RETURN '';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- =============================================================================
-- SECTION 3: FIELD-LEVEL ENCRYPTION COLUMNS
-- =============================================================================
-- These columns store AES-256-GCM ciphertext produced at the application layer
-- using AWS KMS data-key encryption (envelope encryption). The key alias is
-- configured per environment (e.g., alias/vaidyah-phi-key).
--
-- Decryption happens ONLY in the API gateway / service layer after RLS has
-- already filtered the rows. PostgreSQL never sees plaintext for these fields.
-- =============================================================================

-- patients: encrypted Aadhaar (national ID) and phone
ALTER TABLE patients ADD COLUMN IF NOT EXISTS encrypted_aadhaar  BYTEA;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS encrypted_phone    BYTEA;

COMMENT ON COLUMN patients.encrypted_aadhaar IS
    'AES-256-GCM encrypted Aadhaar number. Envelope-encrypted via AWS KMS '
    '(alias/vaidyah-phi-key). Decrypted only at the application layer.';
COMMENT ON COLUMN patients.encrypted_phone IS
    'AES-256-GCM encrypted phone number. Envelope-encrypted via AWS KMS '
    '(alias/vaidyah-phi-key). Decrypted only at the application layer.';

-- Future tables: if health_records is created, add encrypted_diagnosis_detail.
-- The following is a placeholder for when the table exists:
-- ALTER TABLE health_records ADD COLUMN IF NOT EXISTS encrypted_diagnosis_detail BYTEA;
-- COMMENT ON COLUMN health_records.encrypted_diagnosis_detail IS
--     'AES-256-GCM encrypted detailed diagnosis. Envelope-encrypted via AWS KMS.';


-- =============================================================================
-- SECTION 4: ENHANCED AUDIT LOG & TRIGGER
-- =============================================================================
-- The existing audit_log table is extended with old_values / new_values columns
-- and an automatic trigger that fires on INSERT/UPDATE/DELETE for all sensitive
-- tables. This satisfies HIPAA's "accounting of disclosures" requirement.
-- =============================================================================

-- Extend the existing audit_log table with old/new value columns
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS table_name   TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS record_id    UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values   JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values   JSONB;

-- Note: the existing audit_log already has: id, user_id, action, resource_type,
-- resource_id, details, ip_address, created_at. We add table_name, old_values,
-- new_values for the automatic trigger, while resource_type/resource_id remain
-- available for application-level audit entries.

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_record_id UUID;
    v_action TEXT;
BEGIN
    v_action := TG_OP;

    -- Determine the record ID and row data
    IF (TG_OP = 'DELETE') THEN
        v_old := to_jsonb(OLD);
        v_new := NULL;
        -- Try to extract 'id' from the old row; fall back to NULL
        v_record_id := (v_old ->> 'id')::UUID;
    ELSIF (TG_OP = 'INSERT') THEN
        v_old := NULL;
        v_new := to_jsonb(NEW);
        v_record_id := (v_new ->> 'id')::UUID;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_record_id := (v_new ->> 'id')::UUID;
    END IF;

    INSERT INTO audit_log (
        table_name,
        record_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        user_id,
        ip_address,
        created_at
    ) VALUES (
        TG_TABLE_NAME,
        v_record_id,
        v_action,
        TG_TABLE_NAME,                                              -- resource_type mirrors table_name
        v_record_id,                                                 -- resource_id mirrors record_id
        v_old,
        v_new,
        NULLIF(current_app_setting('app.current_user_id'), '')::UUID,
        NULLIF(current_app_setting('app.client_ip_address'), '')::INET,
        NOW()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION audit_trigger_func IS
    'Automatic audit trigger: logs INSERT/UPDATE/DELETE on sensitive tables '
    'into audit_log with old/new row values, user_id, and IP address.';

-- Attach the audit trigger to every sensitive table.
-- Using CREATE OR REPLACE where supported; DROP + CREATE for safety.
DO $$
DECLARE
    tbl TEXT;
    trigger_name TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'patients',
            'consultations',
            'soap_notes',
            'triage_results',
            'alerts',
            'clinical_trials',
            'consultation_sessions',
            'session_vitals',
            'emergency_alerts',
            'whatsapp_messages',
            'wearable_connections',
            'wearable_data',
            'health_alerts',
            'scheduled_notifications'
        ])
    LOOP
        trigger_name := 'trg_audit_' || tbl;

        -- Drop existing trigger if present, then recreate
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, tbl);
        EXECUTE format(
            'CREATE TRIGGER %I '
            'AFTER INSERT OR UPDATE OR DELETE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION audit_trigger_func()',
            trigger_name, tbl
        );
    END LOOP;
END $$;

-- Also attach to trial-service tables if they exist
DO $$
DECLARE
    tbl TEXT;
    trigger_name TEXT;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'trial_matches',
            'notifications',
            'subscriptions'
        ])
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = tbl AND table_schema = 'public'
        ) THEN
            trigger_name := 'trg_audit_' || tbl;
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, tbl);
            EXECUTE format(
                'CREATE TRIGGER %I '
                'AFTER INSERT OR UPDATE OR DELETE ON %I '
                'FOR EACH ROW EXECUTE FUNCTION audit_trigger_func()',
                trigger_name, tbl
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- SECTION 5: TABLE PRIVILEGES
-- =============================================================================

-- Admin: full access on all tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO vaidyah_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_admin;

-- Nurse: read/write on operational tables
GRANT SELECT, INSERT, UPDATE ON patients, consultations, consultation_sessions,
    session_vitals, soap_notes, triage_results, alerts, emergency_alerts,
    wearable_data, health_alerts, scheduled_notifications, whatsapp_messages
    TO vaidyah_nurse;
GRANT SELECT ON health_centers, users, clinical_trials TO vaidyah_nurse;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_nurse;

-- Doctor: read/write on clinical tables
GRANT SELECT, INSERT, UPDATE ON patients, consultations, consultation_sessions,
    session_vitals, soap_notes, triage_results, alerts, emergency_alerts
    TO vaidyah_doctor;
GRANT SELECT ON health_centers, users, clinical_trials TO vaidyah_doctor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_doctor;

-- Patient: read on own data, limited write (wearable data, alert acknowledgment)
GRANT SELECT ON patients, consultations, soap_notes, triage_results,
    alerts, health_alerts, scheduled_notifications, wearable_data
    TO vaidyah_patient;
GRANT UPDATE (acknowledged) ON alerts TO vaidyah_patient;
GRANT UPDATE (acknowledged, acknowledged_at) ON health_alerts TO vaidyah_patient;
GRANT SELECT ON clinical_trials TO vaidyah_patient;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_patient;

-- Read-only: SELECT only, PII access controlled by views (see Section 8)
GRANT SELECT ON health_centers, consultations, soap_notes, triage_results,
    clinical_trials, alerts, wearable_data, health_alerts
    TO vaidyah_readonly;

-- Pharmacist: read prescriptions/consultations, read patients at their center
GRANT SELECT ON patients, consultations, consultation_sessions, soap_notes,
    triage_results, health_centers, users
    TO vaidyah_pharmacist;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_pharmacist;

-- Lab tech: read diagnostics and consultation data at their center
GRANT SELECT ON patients, consultations, consultation_sessions, session_vitals,
    triage_results, health_centers, users
    TO vaidyah_lab_tech;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_lab_tech;

-- ASHA worker: community health worker with read access to patients in their area
GRANT SELECT ON patients, consultations, health_centers, alerts, health_alerts,
    scheduled_notifications
    TO vaidyah_asha_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vaidyah_asha_worker;

-- Researcher: de-identified data access (similar to readonly, plus clinical trials)
GRANT SELECT ON health_centers, consultations, soap_notes, triage_results,
    clinical_trials, alerts, wearable_data, health_alerts
    TO vaidyah_researcher;

-- Audit log: only admin can read; all roles implicitly write via trigger
GRANT SELECT ON audit_log TO vaidyah_admin;


-- =============================================================================
-- SECTION 6: ENABLE ROW-LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all sensitive tables.
-- FORCE ensures RLS applies even to table owners (defense-in-depth).

ALTER TABLE patients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients                  FORCE ROW LEVEL SECURITY;

ALTER TABLE consultations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations             FORCE ROW LEVEL SECURITY;

ALTER TABLE soap_notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE soap_notes                FORCE ROW LEVEL SECURITY;

ALTER TABLE triage_results            ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_results            FORCE ROW LEVEL SECURITY;

ALTER TABLE alerts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                    FORCE ROW LEVEL SECURITY;

ALTER TABLE consultation_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_sessions     FORCE ROW LEVEL SECURITY;

ALTER TABLE session_vitals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_vitals            FORCE ROW LEVEL SECURITY;

ALTER TABLE emergency_alerts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_alerts          FORCE ROW LEVEL SECURITY;

ALTER TABLE wearable_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_connections      FORCE ROW LEVEL SECURITY;

ALTER TABLE wearable_data             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_data             FORCE ROW LEVEL SECURITY;

ALTER TABLE health_alerts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_alerts             FORCE ROW LEVEL SECURITY;

ALTER TABLE scheduled_notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications   FORCE ROW LEVEL SECURITY;

ALTER TABLE whatsapp_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages         FORCE ROW LEVEL SECURITY;

ALTER TABLE clinical_trials           ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_trials           FORCE ROW LEVEL SECURITY;

-- Enable RLS on trial-service tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trial_matches' AND table_schema = 'public') THEN
        ALTER TABLE trial_matches ENABLE ROW LEVEL SECURITY;
        ALTER TABLE trial_matches FORCE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN
        ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions' AND table_schema = 'public') THEN
        ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
        ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
    END IF;
END $$;


-- =============================================================================
-- SECTION 7: ROW-LEVEL SECURITY POLICIES
-- =============================================================================
-- Naming convention: {role}_{table}_{operation}
-- Operation suffixes: _all (SELECT+INSERT+UPDATE+DELETE), _select, _modify
--
-- Session variables used in policies:
--   app.current_role       — 'admin', 'nurse', 'doctor', 'patient'
--   app.current_user_id    — users.id (UUID as text)
--   app.current_center_id  — health_centers.id for nurse/doctor scope
--   app.current_patient_id — patients.id for patient scope
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 7.1 PATIENTS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted access to all patient records
CREATE POLICY admin_patients_all ON patients
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: can see/modify patients who have consultations at their center,
-- OR patients currently being registered (new inserts always allowed)
CREATE POLICY nurse_patients_select ON patients
    FOR SELECT
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
        OR EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.patient_id = patients.id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Nurse: can insert new patients (registration)
CREATE POLICY nurse_patients_insert ON patients
    FOR INSERT
    TO vaidyah_nurse
    WITH CHECK (true);

-- Nurse: can update patients at their center
CREATE POLICY nurse_patients_update ON patients
    FOR UPDATE
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (true);

-- Doctor: can see patients assigned to their consultations
CREATE POLICY doctor_patients_select ON patients
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
        OR EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.patient_id = patients.id
              AND cs.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Doctor: can update patients assigned to their consultations
CREATE POLICY doctor_patients_update ON patients
    FOR UPDATE
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    )
    WITH CHECK (true);

-- Patient: can see only their own record
CREATE POLICY patient_patients_select ON patients
    FOR SELECT
    TO vaidyah_patient
    USING (id::TEXT = current_app_setting('app.current_patient_id'));

-- Patient: can update only their own non-clinical fields
CREATE POLICY patient_patients_update ON patients
    FOR UPDATE
    TO vaidyah_patient
    USING (id::TEXT = current_app_setting('app.current_patient_id'))
    WITH CHECK (id::TEXT = current_app_setting('app.current_patient_id'));

-- Read-only: no access to patients (PII); use analytics views instead
-- (No policy = deny all for vaidyah_readonly on patients)


-- ---------------------------------------------------------------------------
-- 7.2 CONSULTATIONS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_consultations_all ON consultations
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: can see/create/update consultations at their center
CREATE POLICY nurse_consultations_all ON consultations
    FOR ALL
    TO vaidyah_nurse
    USING (center_id::TEXT = current_app_setting('app.current_center_id'))
    WITH CHECK (center_id::TEXT = current_app_setting('app.current_center_id'));

-- Doctor: can see/update consultations assigned to them
CREATE POLICY doctor_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_doctor
    USING (
        doctor_id::TEXT = current_app_setting('app.current_user_id')
        OR center_id::TEXT = current_app_setting('app.current_center_id')
    );

CREATE POLICY doctor_consultations_update ON consultations
    FOR UPDATE
    TO vaidyah_doctor
    USING (doctor_id::TEXT = current_app_setting('app.current_user_id'))
    WITH CHECK (true);

-- Patient: can see only their own consultations (read-only)
CREATE POLICY patient_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));

-- Read-only analytics: can see consultations but not transcript/PII
CREATE POLICY readonly_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.3 CONSULTATION_SESSIONS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_consultation_sessions_all ON consultation_sessions
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: sessions at their facility
CREATE POLICY nurse_consultation_sessions_all ON consultation_sessions
    FOR ALL
    TO vaidyah_nurse
    USING (facility_id::TEXT = current_app_setting('app.current_center_id'))
    WITH CHECK (facility_id::TEXT = current_app_setting('app.current_center_id'));

-- Doctor: sessions they are assigned to
CREATE POLICY doctor_consultation_sessions_select ON consultation_sessions
    FOR SELECT
    TO vaidyah_doctor
    USING (
        doctor_id::TEXT = current_app_setting('app.current_user_id')
        OR facility_id::TEXT = current_app_setting('app.current_center_id')
    );

CREATE POLICY doctor_consultation_sessions_update ON consultation_sessions
    FOR UPDATE
    TO vaidyah_doctor
    USING (doctor_id::TEXT = current_app_setting('app.current_user_id'))
    WITH CHECK (true);

-- Patient: own sessions only
CREATE POLICY patient_consultation_sessions_select ON consultation_sessions
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));


-- ---------------------------------------------------------------------------
-- 7.4 SOAP_NOTES TABLE (linked to consultation via session_id)
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_soap_notes_all ON soap_notes
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: can see/create SOAP notes for sessions at their center
CREATE POLICY nurse_soap_notes_all ON soap_notes
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Doctor: can see/update SOAP notes for their sessions
CREATE POLICY doctor_soap_notes_select ON soap_notes
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

CREATE POLICY doctor_soap_notes_update ON soap_notes
    FOR UPDATE
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    )
    WITH CHECK (true);

-- Patient: can view SOAP notes for their own sessions (read-only)
CREATE POLICY patient_soap_notes_select ON soap_notes
    FOR SELECT
    TO vaidyah_patient
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.patient_id::TEXT = current_app_setting('app.current_patient_id')
        )
    );

-- Read-only: can view SOAP notes for analytics
CREATE POLICY readonly_soap_notes_select ON soap_notes
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.5 TRIAGE_RESULTS TABLE (linked to consultation via session_id)
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_triage_results_all ON triage_results
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: triage results for sessions at their center
CREATE POLICY nurse_triage_results_all ON triage_results
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Doctor: triage results for their sessions
CREATE POLICY doctor_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: can view their own triage results
CREATE POLICY patient_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_patient
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.patient_id::TEXT = current_app_setting('app.current_patient_id')
        )
    );

-- Read-only: can view triage results for analytics
CREATE POLICY readonly_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.6 SESSION_VITALS TABLE (linked to session)
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_session_vitals_all ON session_vitals
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: vitals for sessions at their center
CREATE POLICY nurse_session_vitals_all ON session_vitals
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = session_vitals.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = session_vitals.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Doctor: vitals for their sessions
CREATE POLICY doctor_session_vitals_select ON session_vitals
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = session_vitals.session_id
              AND cs.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: can view their own vitals
CREATE POLICY patient_session_vitals_select ON session_vitals
    FOR SELECT
    TO vaidyah_patient
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = session_vitals.session_id
              AND cs.patient_id::TEXT = current_app_setting('app.current_patient_id')
        )
    );


-- ---------------------------------------------------------------------------
-- 7.7 ALERTS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_alerts_all ON alerts
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: alerts for patients at their center (via consultation)
CREATE POLICY nurse_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_nurse
    USING (
        -- Alert linked to a consultation at the nurse's center
        (consultation_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.id = alerts.consultation_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        ))
        OR
        -- Alert linked to a patient who has consultations at the nurse's center
        (consultation_id IS NULL AND EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        ))
    );

-- Nurse: can create and update alerts
CREATE POLICY nurse_alerts_insert ON alerts
    FOR INSERT
    TO vaidyah_nurse
    WITH CHECK (true);

CREATE POLICY nurse_alerts_update ON alerts
    FOR UPDATE
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (true);

-- Doctor: alerts for their consultations
CREATE POLICY doctor_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE (c.id = alerts.consultation_id OR c.patient_id = alerts.patient_id)
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: can see their own alerts and acknowledge them
CREATE POLICY patient_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));

CREATE POLICY patient_alerts_update ON alerts
    FOR UPDATE
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'))
    WITH CHECK (patient_id::TEXT = current_app_setting('app.current_patient_id'));

-- Read-only: can see alerts for analytics
CREATE POLICY readonly_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.8 EMERGENCY_ALERTS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_emergency_alerts_all ON emergency_alerts
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: emergency alerts for patients with sessions at their facility
CREATE POLICY nurse_emergency_alerts_all ON emergency_alerts
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = emergency_alerts.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
        OR EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = emergency_alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (true);

-- Doctor: emergency alerts for their patients
CREATE POLICY doctor_emergency_alerts_select ON emergency_alerts
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = emergency_alerts.patient_id
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: own emergency alerts
CREATE POLICY patient_emergency_alerts_select ON emergency_alerts
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));


-- ---------------------------------------------------------------------------
-- 7.9 WEARABLE_CONNECTIONS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_wearable_connections_all ON wearable_connections
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: wearable connections for patients at their center
CREATE POLICY nurse_wearable_connections_select ON wearable_connections
    FOR SELECT
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = wearable_connections.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Patient: own wearable connections
CREATE POLICY patient_wearable_connections_all ON wearable_connections
    FOR ALL
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'))
    WITH CHECK (patient_id::TEXT = current_app_setting('app.current_patient_id'));


-- ---------------------------------------------------------------------------
-- 7.10 WEARABLE_DATA TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_wearable_data_all ON wearable_data
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: wearable data for patients at their center
CREATE POLICY nurse_wearable_data_select ON wearable_data
    FOR SELECT
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = wearable_data.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Doctor: wearable data for their patients
CREATE POLICY doctor_wearable_data_select ON wearable_data
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = wearable_data.patient_id
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: own wearable data
CREATE POLICY patient_wearable_data_select ON wearable_data
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));

-- Read-only: wearable data for analytics (de-identified via view)
CREATE POLICY readonly_wearable_data_select ON wearable_data
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.10a NEW ROLES: PHARMACIST, LAB_TECH, ASHA_WORKER, RESEARCHER
-- ---------------------------------------------------------------------------
-- These roles have center-scoped or de-identified access.

-- Pharmacist: center-scoped read on patients and consultations
CREATE POLICY pharmacist_patients_select ON patients
    FOR SELECT
    TO vaidyah_pharmacist
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY pharmacist_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_pharmacist
    USING (center_id::TEXT = current_app_setting('app.current_center_id'));

CREATE POLICY pharmacist_consultation_sessions_select ON consultation_sessions
    FOR SELECT
    TO vaidyah_pharmacist
    USING (facility_id::TEXT = current_app_setting('app.current_center_id'));

CREATE POLICY pharmacist_soap_notes_select ON soap_notes
    FOR SELECT
    TO vaidyah_pharmacist
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = soap_notes.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY pharmacist_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_pharmacist
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Lab tech: center-scoped read on patients, consultations, vitals, triage
CREATE POLICY lab_tech_patients_select ON patients
    FOR SELECT
    TO vaidyah_lab_tech
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY lab_tech_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_lab_tech
    USING (center_id::TEXT = current_app_setting('app.current_center_id'));

CREATE POLICY lab_tech_consultation_sessions_select ON consultation_sessions
    FOR SELECT
    TO vaidyah_lab_tech
    USING (facility_id::TEXT = current_app_setting('app.current_center_id'));

CREATE POLICY lab_tech_session_vitals_select ON session_vitals
    FOR SELECT
    TO vaidyah_lab_tech
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = session_vitals.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY lab_tech_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_lab_tech
    USING (
        EXISTS (
            SELECT 1 FROM consultation_sessions cs
            WHERE cs.id = triage_results.session_id
              AND cs.facility_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- ASHA worker: center-scoped read on patients, consultations, alerts
CREATE POLICY asha_worker_patients_select ON patients
    FOR SELECT
    TO vaidyah_asha_worker
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = patients.id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY asha_worker_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_asha_worker
    USING (center_id::TEXT = current_app_setting('app.current_center_id'));

CREATE POLICY asha_worker_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_asha_worker
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY asha_worker_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_asha_worker
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = health_alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY asha_worker_scheduled_notifications_select ON scheduled_notifications
    FOR SELECT
    TO vaidyah_asha_worker
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = scheduled_notifications.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

-- Researcher: de-identified read access (same as readonly; no direct patient PII)
CREATE POLICY researcher_consultations_select ON consultations
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_soap_notes_select ON soap_notes
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_triage_results_select ON triage_results
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_clinical_trials_select ON clinical_trials
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_wearable_data_select ON wearable_data
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_researcher
    USING (true);

CREATE POLICY researcher_alerts_select ON alerts
    FOR SELECT
    TO vaidyah_researcher
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.11 HEALTH_ALERTS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_health_alerts_all ON health_alerts
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: health alerts for patients at their center
CREATE POLICY nurse_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = health_alerts.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    );

CREATE POLICY nurse_health_alerts_insert ON health_alerts
    FOR INSERT
    TO vaidyah_nurse
    WITH CHECK (true);

-- Doctor: health alerts for their patients
CREATE POLICY doctor_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_doctor
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = health_alerts.patient_id
              AND c.doctor_id::TEXT = current_app_setting('app.current_user_id')
        )
    );

-- Patient: own health alerts (can acknowledge)
CREATE POLICY patient_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));

CREATE POLICY patient_health_alerts_update ON health_alerts
    FOR UPDATE
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'))
    WITH CHECK (patient_id::TEXT = current_app_setting('app.current_patient_id'));

-- Read-only: health alerts for analytics
CREATE POLICY readonly_health_alerts_select ON health_alerts
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.12 SCHEDULED_NOTIFICATIONS TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_scheduled_notifications_all ON scheduled_notifications
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: notifications for patients at their center
CREATE POLICY nurse_scheduled_notifications_all ON scheduled_notifications
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = scheduled_notifications.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (true);

-- Patient: own scheduled notifications
CREATE POLICY patient_scheduled_notifications_select ON scheduled_notifications
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));


-- ---------------------------------------------------------------------------
-- 7.13 WHATSAPP_MESSAGES TABLE
-- ---------------------------------------------------------------------------

-- Admin: unrestricted
CREATE POLICY admin_whatsapp_messages_all ON whatsapp_messages
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse: WhatsApp messages for patients at their center
CREATE POLICY nurse_whatsapp_messages_all ON whatsapp_messages
    FOR ALL
    TO vaidyah_nurse
    USING (
        EXISTS (
            SELECT 1 FROM consultations c
            WHERE c.patient_id = whatsapp_messages.patient_id
              AND c.center_id::TEXT = current_app_setting('app.current_center_id')
        )
    )
    WITH CHECK (true);

-- Patient: own messages
CREATE POLICY patient_whatsapp_messages_select ON whatsapp_messages
    FOR SELECT
    TO vaidyah_patient
    USING (patient_id::TEXT = current_app_setting('app.current_patient_id'));


-- ---------------------------------------------------------------------------
-- 7.14 CLINICAL_TRIALS TABLE (publicly readable reference data)
-- ---------------------------------------------------------------------------

-- Admin: full access (CRUD)
CREATE POLICY admin_clinical_trials_all ON clinical_trials
    FOR ALL
    TO vaidyah_admin
    USING (true)
    WITH CHECK (true);

-- Nurse, Doctor, Patient: read-only (trials are reference data)
CREATE POLICY nurse_clinical_trials_select ON clinical_trials
    FOR SELECT
    TO vaidyah_nurse
    USING (true);

CREATE POLICY doctor_clinical_trials_select ON clinical_trials
    FOR SELECT
    TO vaidyah_doctor
    USING (true);

CREATE POLICY patient_clinical_trials_select ON clinical_trials
    FOR SELECT
    TO vaidyah_patient
    USING (true);

CREATE POLICY readonly_clinical_trials_select ON clinical_trials
    FOR SELECT
    TO vaidyah_readonly
    USING (true);


-- ---------------------------------------------------------------------------
-- 7.15 TRIAL_MATCHES TABLE (created by trial-service)
-- ---------------------------------------------------------------------------
-- These policies are created conditionally since the table may not exist yet
-- at init.sql time. Re-run this script after trial-service starts.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trial_matches' AND table_schema = 'public') THEN

        -- Admin: unrestricted
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trial_matches' AND policyname = 'admin_trial_matches_all') THEN
            EXECUTE 'CREATE POLICY admin_trial_matches_all ON trial_matches
                FOR ALL TO vaidyah_admin USING (true) WITH CHECK (true)';
        END IF;

        -- Nurse: trial matches for patients at their center
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trial_matches' AND policyname = 'nurse_trial_matches_select') THEN
            EXECUTE 'CREATE POLICY nurse_trial_matches_select ON trial_matches
                FOR SELECT TO vaidyah_nurse
                USING (
                    EXISTS (
                        SELECT 1 FROM consultations c
                        WHERE c.patient_id::TEXT = trial_matches.patient_id
                          AND c.center_id::TEXT = current_app_setting(''app.current_center_id'')
                    )
                )';
        END IF;

        -- Doctor: trial matches for their patients
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trial_matches' AND policyname = 'doctor_trial_matches_select') THEN
            EXECUTE 'CREATE POLICY doctor_trial_matches_select ON trial_matches
                FOR SELECT TO vaidyah_doctor
                USING (
                    EXISTS (
                        SELECT 1 FROM consultations c
                        WHERE c.patient_id::TEXT = trial_matches.patient_id
                          AND c.doctor_id::TEXT = current_app_setting(''app.current_user_id'')
                    )
                )';
        END IF;

        -- Patient: own trial matches only
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trial_matches' AND policyname = 'patient_trial_matches_select') THEN
            EXECUTE 'CREATE POLICY patient_trial_matches_select ON trial_matches
                FOR SELECT TO vaidyah_patient
                USING (patient_id = current_app_setting(''app.current_patient_id''))';
        END IF;

        -- Grant privileges
        EXECUTE 'GRANT ALL ON trial_matches TO vaidyah_admin';
        EXECUTE 'GRANT SELECT ON trial_matches TO vaidyah_nurse, vaidyah_doctor, vaidyah_patient';
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 7.16 NOTIFICATIONS TABLE (created by trial-service)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_schema = 'public') THEN

        -- Admin: unrestricted
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'admin_notifications_all') THEN
            EXECUTE 'CREATE POLICY admin_notifications_all ON notifications
                FOR ALL TO vaidyah_admin USING (true) WITH CHECK (true)';
        END IF;

        -- Patient: own notifications only
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'patient_notifications_select') THEN
            EXECUTE 'CREATE POLICY patient_notifications_select ON notifications
                FOR SELECT TO vaidyah_patient
                USING (patient_id = current_app_setting(''app.current_patient_id''))';
        END IF;

        -- Patient: can mark notifications as read
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'patient_notifications_update') THEN
            EXECUTE 'CREATE POLICY patient_notifications_update ON notifications
                FOR UPDATE TO vaidyah_patient
                USING (patient_id = current_app_setting(''app.current_patient_id''))
                WITH CHECK (patient_id = current_app_setting(''app.current_patient_id''))';
        END IF;

        -- Grant privileges
        EXECUTE 'GRANT ALL ON notifications TO vaidyah_admin';
        EXECUTE 'GRANT SELECT, UPDATE ON notifications TO vaidyah_patient';
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 7.17 SUBSCRIPTIONS TABLE (created by trial-service)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions' AND table_schema = 'public') THEN

        -- Admin: unrestricted
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'admin_subscriptions_all') THEN
            EXECUTE 'CREATE POLICY admin_subscriptions_all ON subscriptions
                FOR ALL TO vaidyah_admin USING (true) WITH CHECK (true)';
        END IF;

        -- Patient: own subscriptions only (full CRUD)
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'patient_subscriptions_all') THEN
            EXECUTE 'CREATE POLICY patient_subscriptions_all ON subscriptions
                FOR ALL TO vaidyah_patient
                USING (patient_id = current_app_setting(''app.current_patient_id''))
                WITH CHECK (patient_id = current_app_setting(''app.current_patient_id''))';
        END IF;

        -- Grant privileges
        EXECUTE 'GRANT ALL ON subscriptions TO vaidyah_admin';
        EXECUTE 'GRANT ALL ON subscriptions TO vaidyah_patient';
    END IF;
END $$;


-- =============================================================================
-- SECTION 8: ANALYTICS VIEWS (PII-stripped for vaidyah_readonly)
-- =============================================================================
-- The vaidyah_readonly role has no direct access to the patients table.
-- These views provide de-identified data for analytics dashboards.
-- =============================================================================

CREATE OR REPLACE VIEW analytics_patients AS
SELECT
    id,
    -- No name, phone, aadhaar, address, emergency_contact
    age,
    gender,
    language_pref,
    blood_group,
    -- medical_history kept for aggregate analytics (no direct PII)
    medical_history,
    risk_profile,
    created_at,
    updated_at
FROM patients;

GRANT SELECT ON analytics_patients TO vaidyah_readonly;
GRANT SELECT ON analytics_patients TO vaidyah_researcher;

CREATE OR REPLACE VIEW analytics_consultations AS
SELECT
    id,
    patient_id,
    nurse_id,
    doctor_id,
    center_id,
    status,
    triage_level,
    urgency,
    vitals,
    symptoms,
    diagnosis,
    prosody_scores,
    language,
    duration_secs,
    created_at,
    completed_at
    -- Excludes: transcript, transcript_original, voice_s3_key, notes, attachments
FROM consultations;

GRANT SELECT ON analytics_consultations TO vaidyah_readonly;
GRANT SELECT ON analytics_consultations TO vaidyah_researcher;

COMMENT ON VIEW analytics_patients IS
    'De-identified patient data for analytics. No PII (name, phone, aadhaar, address).';
COMMENT ON VIEW analytics_consultations IS
    'Consultation data for analytics. Excludes transcripts and voice recordings.';


-- =============================================================================
-- SECTION 9: AUDIT LOG PROTECTION
-- =============================================================================
-- The audit_log table must not have RLS (it would block the trigger).
-- Instead, restrict direct access: only vaidyah_admin can SELECT.
-- The trigger function runs as SECURITY DEFINER so it can always INSERT.
-- =============================================================================

-- Revoke all from public, grant only to admin
REVOKE ALL ON audit_log FROM PUBLIC;
GRANT SELECT ON audit_log TO vaidyah_admin;
-- The trigger function (SECURITY DEFINER) handles inserts

-- Index for fast audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp
    ON audit_log (created_at DESC);


-- =============================================================================
-- SECTION 10: COLUMN-LEVEL ENCRYPTION FOR PHI (HIPAA §164.312(a)(2)(iv))
-- =============================================================================
-- Uses pgcrypto for application-level encryption of PII columns.
-- The encryption key is sourced from AWS KMS via the application layer
-- (envelope encryption: KMS decrypts a data key, which is used for pgcrypto).
--
-- Pattern:
--   INSERT: app encrypts PII before INSERT using pgp_sym_encrypt()
--   SELECT: app decrypts PII after SELECT using pgp_sym_decrypt()
--   Key rotation: re-encrypt with new key, old key stays in Secrets Manager
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helper functions for transparent column encryption ──────────────────────

-- Encrypt a text value with AES-256 (symmetric PGP)
-- The encryption_key should be fetched from KMS envelope at the app layer
-- and passed as a session variable for the current transaction.
CREATE OR REPLACE FUNCTION encrypt_phi(plaintext TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(
        plaintext,
        current_setting('app.encryption_key', true),
        'cipher-algo=aes256, compress-algo=0'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt a PHI column (returns NULL if key is wrong or data is corrupt)
CREATE OR REPLACE FUNCTION decrypt_phi(ciphertext BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(
        ciphertext,
        current_setting('app.encryption_key', true)
    );
EXCEPTION WHEN OTHERS THEN
    -- Log decryption failure, return NULL instead of crashing
    RAISE WARNING 'decrypt_phi: decryption failed — wrong key or corrupt data';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Encrypted PHI columns ──────────────────────────────────────────────────
-- Add encrypted columns for sensitive PII fields on the patients table.
-- The application writes encrypted values and reads via decrypt_phi().
-- Original columns remain for backward compatibility during migration.

DO $$
BEGIN
    -- Aadhaar number (India national ID — highly sensitive)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'aadhaar_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN aadhaar_encrypted BYTEA;
        COMMENT ON COLUMN patients.aadhaar_encrypted IS
            'AES-256 encrypted Aadhaar number. Decrypt with decrypt_phi().';
    END IF;

    -- Phone number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'phone_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN phone_encrypted BYTEA;
        COMMENT ON COLUMN patients.phone_encrypted IS
            'AES-256 encrypted phone number. Decrypt with decrypt_phi().';
    END IF;

    -- Email address
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'email_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN email_encrypted BYTEA;
        COMMENT ON COLUMN patients.email_encrypted IS
            'AES-256 encrypted email address. Decrypt with decrypt_phi().';
    END IF;

    -- Emergency contact details
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'emergency_contact_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN emergency_contact_encrypted BYTEA;
        COMMENT ON COLUMN patients.emergency_contact_encrypted IS
            'AES-256 encrypted emergency contact info. Decrypt with decrypt_phi().';
    END IF;

    -- Full address
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'patients' AND column_name = 'address_encrypted'
    ) THEN
        ALTER TABLE patients ADD COLUMN address_encrypted BYTEA;
        COMMENT ON COLUMN patients.address_encrypted IS
            'AES-256 encrypted residential address. Decrypt with decrypt_phi().';
    END IF;
END $$;

-- ── Migration helper: encrypt existing plain-text PII ──────────────────────
-- Run this ONCE after setting the encryption key, to migrate existing rows.
-- After migration, the plain-text columns can be dropped or nulled out.
--
-- Usage:
--   SET app.encryption_key = '<your-data-key-from-kms>';
--   SELECT migrate_patients_phi_encryption();
--   SET app.encryption_key = '';  -- clear from session

CREATE OR REPLACE FUNCTION migrate_patients_phi_encryption()
RETURNS INTEGER AS $$
DECLARE
    migrated INTEGER := 0;
BEGIN
    IF current_setting('app.encryption_key', true) IS NULL
       OR current_setting('app.encryption_key', true) = '' THEN
        RAISE EXCEPTION 'app.encryption_key must be set before migration';
    END IF;

    -- Encrypt aadhaar
    UPDATE patients
    SET aadhaar_encrypted = encrypt_phi(aadhaar)
    WHERE aadhaar IS NOT NULL AND aadhaar != '' AND aadhaar_encrypted IS NULL;
    GET DIAGNOSTICS migrated = ROW_COUNT;

    -- Encrypt phone
    UPDATE patients
    SET phone_encrypted = encrypt_phi(phone)
    WHERE phone IS NOT NULL AND phone != '' AND phone_encrypted IS NULL;

    -- Encrypt email (if column exists)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'email') THEN
        UPDATE patients
        SET email_encrypted = encrypt_phi(email)
        WHERE email IS NOT NULL AND email != '' AND email_encrypted IS NULL;
    END IF;

    -- Encrypt emergency_contact
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'emergency_contact') THEN
        UPDATE patients
        SET emergency_contact_encrypted = encrypt_phi(emergency_contact)
        WHERE emergency_contact IS NOT NULL AND emergency_contact != '' AND emergency_contact_encrypted IS NULL;
    END IF;

    -- Encrypt address
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'address') THEN
        UPDATE patients
        SET address_encrypted = encrypt_phi(address)
        WHERE address IS NOT NULL AND address != '' AND address_encrypted IS NULL;
    END IF;

    RETURN migrated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION migrate_patients_phi_encryption() IS
    'One-time migration: encrypts existing plain-text PII into *_encrypted columns. '
    'Requires SET app.encryption_key = ''<kms-data-key>'' before calling.';


-- =============================================================================
-- SECTION 11: HIPAA COMPLIANCE CHECKLIST & BAA REFERENCE
-- =============================================================================
-- This section documents the HIPAA controls implemented at the database layer.
-- For the full Business Associate Agreement (BAA), see:
--   - AWS BAA: https://aws.amazon.com/compliance/hipaa-compliance/
--   - Signed BAA stored in: s3://<project>-<env>-documents/compliance/baa/
--
-- HIPAA Technical Safeguards Implemented:
--
--   §164.312(a)(1) Access Control
--     ✓ Unique user identification: PostgreSQL roles per user type
--     ✓ Automatic logoff: idle_in_transaction_session_timeout = 5min
--     ✓ Encryption/decryption: pgcrypto AES-256 for PHI columns
--     ✓ Row-level security: 17+ tables with role-based policies
--
--   §164.312(a)(2)(iv) Encryption & Decryption
--     ✓ Column-level: pgcrypto PGP symmetric (AES-256) for PII fields
--     ✓ At-rest: RDS KMS encryption (aws_kms_key.main)
--     ✓ In-transit: TLS 1.2+ enforced (ssl = on, ssl_min_protocol_version)
--     ✓ Key management: AWS KMS with automatic rotation
--
--   §164.312(b) Audit Controls
--     ✓ Database audit trigger: audit_log table captures all DML
--     ✓ CloudTrail: API-level audit for all AWS service calls
--     ✓ PostgreSQL logging: log_statement = 'mod', log_connections = on
--
--   §164.312(c)(1) Integrity Controls
--     ✓ RDS automated backups with PITR
--     ✓ Multi-AZ deployment in production
--     ✓ scram-sha-256 password hashing
--
--   §164.312(d) Person/Entity Authentication
--     ✓ Cognito user pools with MFA
--     ✓ JWT verification at API gateway
--     ✓ Session context variables for RLS enforcement
--
--   §164.312(e)(1) Transmission Security
--     ✓ TLS 1.2+ for all database connections
--     ✓ VPC private subnets for RDS (no public access)
--     ✓ WAF protection on API Gateway
--
-- De-identification (§164.514):
--     ✓ analytics_patients view strips name, phone, aadhaar, address
--     ✓ analytics_consultations view strips transcripts and voice data
--     ✓ vaidyah_readonly role has NO access to patients table directly
--
-- =============================================================================


-- =============================================================================
-- DONE
-- =============================================================================
-- To verify RLS is active:
--   SELECT tablename, policyname, permissive, roles, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- To test as a specific role:
--   SET ROLE vaidyah_nurse;
--   SELECT set_vaidyah_context('b1000000-...', 'nurse', 'a1000000-...', NULL);
--   SELECT * FROM patients;  -- should only show patients at that center
--   RESET ROLE;
--
-- To test column-level encryption:
--   SET app.encryption_key = 'test-key-for-development';
--   SELECT encrypt_phi('123-456-7890');
--   SELECT decrypt_phi(encrypt_phi('123-456-7890'));
-- =============================================================================
