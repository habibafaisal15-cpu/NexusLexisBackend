-- Profile extensions for full user data persistence
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

CREATE TABLE IF NOT EXISTS client_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cnic VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    profile_photo VARCHAR(500),
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS languages TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS practice_areas TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS consultation_mode VARCHAR(20) DEFAULT 'Both';
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS photo VARCHAR(500);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS icap_membership_no VARCHAR(100);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS service_areas TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_role VARCHAR(20) DEFAULT 'client';

ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS verification_review_deadline TIMESTAMPTZ;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS verification_review_deadline TIMESTAMPTZ;
