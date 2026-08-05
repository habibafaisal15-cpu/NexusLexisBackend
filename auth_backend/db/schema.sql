CREATE TABLE IF NOT EXISTS auth_users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    auth_provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
    google_id VARCHAR(255) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users (role) WHERE is_active IS TRUE;

CREATE TABLE IF NOT EXISTS signup_otps (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    verification_token VARCHAR(64),
    verification_token_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    send_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_otps_email ON signup_otps (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_signup_otps_token ON signup_otps (verification_token)
    WHERE verification_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    auth_user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (auth_user_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    reset_token VARCHAR(64),
    reset_token_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_token ON password_reset_otps (reset_token)
    WHERE reset_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS verification_uploads (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    mime_type VARCHAR(100) NOT NULL,
    content_base64 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_uploads_user ON verification_uploads (user_id);

-- Signup OTP PostgreSQL functions (required on Neon — see migrate_signup_otp_functions.sql)
CREATE OR REPLACE FUNCTION generate_signup_temp_token()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION create_signup_otp_record(p_email TEXT, p_ttl_minutes INT DEFAULT 10)
RETURNS TABLE(
    rec_id BIGINT,
    rec_email TEXT,
    temp_token VARCHAR(6),
    rec_expires_at TIMESTAMPTZ,
    rec_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized TEXT;
  v_token VARCHAR(6);
BEGIN
  v_normalized := LOWER(TRIM(p_email));

  UPDATE signup_otps
  SET expires_at = NOW()
  WHERE LOWER(signup_otps.email) = v_normalized
    AND verified_at IS NULL
    AND expires_at > NOW();

  v_token := generate_signup_temp_token();

  RETURN QUERY
  INSERT INTO signup_otps (email, otp_code, expires_at)
  VALUES (
    v_normalized,
    v_token,
    NOW() + (p_ttl_minutes || ' minutes')::interval
  )
  RETURNING
    signup_otps.id::BIGINT,
    signup_otps.email::TEXT,
    signup_otps.otp_code::VARCHAR(6),
    signup_otps.expires_at::TIMESTAMPTZ,
    signup_otps.created_at::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION issue_signup_verification_token(p_otp_id BIGINT, p_token_ttl_minutes INT DEFAULT 30)
RETURNS TABLE(
    rec_email TEXT,
    registration_token VARCHAR(64),
    token_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE signup_otps
  SET verified_at = NOW(),
      verification_token = encode(gen_random_bytes(32), 'hex'),
      verification_token_expires_at = NOW() + (p_token_ttl_minutes || ' minutes')::interval
  WHERE id = p_otp_id
    AND verified_at IS NULL
    AND expires_at > NOW()
  RETURNING signup_otps.email::TEXT, signup_otps.verification_token::VARCHAR(64), signup_otps.verification_token_expires_at::TIMESTAMPTZ;
END;
$$;
