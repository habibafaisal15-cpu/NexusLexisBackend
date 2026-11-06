import { query } from './index.js';

let ready = false;

export async function ensureAccountSchema() {
  if (ready) return;
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS language_pref VARCHAR(8) DEFAULT 'en';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS suspend_reason TEXT;

    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS language_pref VARCHAR(8) DEFAULT 'en';
    ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

    ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS experience_years INT;
    ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS enrolment_date DATE;
    ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS court_level VARCHAR(80);
    ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS courts TEXT;
    ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS firm_name VARCHAR(255);
    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS ntn VARCHAR(40);
    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS target_segment VARCHAR(255);
    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS specializations TEXT;
    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS language VARCHAR(8) DEFAULT 'en';
    ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

    ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS language_pref VARCHAR(8);

    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device VARCHAR(160);
    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip VARCHAR(64);
    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS location VARCHAR(160);
    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT;
    ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS verification_uploads (
      id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL,
      doc_type VARCHAR(50) NOT NULL,
      file_name VARCHAR(255),
      mime_type VARCHAR(100) NOT NULL,
      content_base64 TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE verification_uploads ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'pending';
    ALTER TABLE verification_uploads ADD COLUMN IF NOT EXISTS role VARCHAR(20);
    ALTER TABLE verification_uploads ADD COLUMN IF NOT EXISTS label VARCHAR(120);
    ALTER TABLE verification_uploads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
    ALTER TABLE verification_uploads ADD COLUMN IF NOT EXISTS reviewed_by BIGINT;

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_admin_id BIGINT,
      account_id BIGINT,
      action VARCHAR(80) NOT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_account ON admin_audit_logs (account_id, created_at DESC);
  `);
  ready = true;
}
