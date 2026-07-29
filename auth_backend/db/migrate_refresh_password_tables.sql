-- Run in Neon Console → SQL Editor (Project: neondb)
-- Creates tables for refresh tokens + forgot-password OTP flow

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
