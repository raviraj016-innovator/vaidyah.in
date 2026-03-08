-- Migration: Add password_hash column and seed super admin
-- Run this on existing RDS database where init.sql already ran

-- Add password_hash column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Upsert super admin: raviraj@vaidyah.in with password '12345678'
INSERT INTO users (id, name, email, phone, role, center_id, specialization, languages, password_hash)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'Raviraj',
  'raviraj@vaidyah.in',
  '9876500001',
  'super_admin',
  'a1000000-0000-0000-0000-000000000005',
  'Public Health',
  ARRAY['en', 'hi'],
  crypt('12345678', gen_salt('bf'))
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  updated_at = NOW();
