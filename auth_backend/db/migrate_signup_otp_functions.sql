-- Run in Neon Console → SQL Editor (once)
-- Required for signup OTP: POST /api/auth/register/send-otp and verify-otp

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

-- Verify (should return 3 rows):
-- SELECT proname FROM pg_proc WHERE proname IN ('generate_signup_temp_token','create_signup_otp_record','issue_signup_verification_token');
