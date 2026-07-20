import { query } from './index.js';

const OTP_TTL_MINUTES = 10;
const TOKEN_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MINUTES = 15;

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

export async function countRecentSends(email) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM signup_otps
     WHERE LOWER(email) = LOWER($1)
       AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [normalizeEmail(email), SEND_WINDOW_MINUTES]
  );
  return result.rows[0]?.count || 0;
}

/** Ask PostgreSQL to generate and persist a temporary token, then return it for email delivery only. */
export async function createSignupOtp(email) {
  const result = await query(
    `SELECT rec_id, rec_email, temp_token, rec_expires_at, rec_created_at
     FROM create_signup_otp_record($1, $2)`,
    [normalizeEmail(email), OTP_TTL_MINUTES]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Could not create verification token');
  }

  return {
    id: row.rec_id,
    email: row.rec_email,
    otp_code: row.temp_token,
    expires_at: row.rec_expires_at,
    created_at: row.rec_created_at,
  };
}

export async function findActiveOtp(email) {
  const result = await query(
    `SELECT id, email, otp_code, expires_at, verified_at, attempts, verification_token,
            verification_token_expires_at
     FROM signup_otps
     WHERE LOWER(email) = LOWER($1)
       AND verified_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

export async function incrementOtpAttempts(id) {
  await query(
    `UPDATE signup_otps SET attempts = attempts + 1 WHERE id = $1`,
    [id]
  );
}

/** Issue registration token via PostgreSQL after OTP is validated in the app layer. */
export async function markOtpVerified(id) {
  const result = await query(
    `SELECT rec_email, registration_token, token_expires_at
     FROM issue_signup_verification_token($1, $2)`,
    [id, TOKEN_TTL_MINUTES]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Verification token could not be issued');
  }

  return {
    email: row.rec_email,
    verification_token: row.registration_token,
    verification_token_expires_at: row.token_expires_at,
  };
}

export async function findVerifiedToken(email, token) {
  const result = await query(
    `SELECT id, email, verification_token, verification_token_expires_at
     FROM signup_otps
     WHERE LOWER(email) = LOWER($1)
       AND verification_token = $2
       AND verified_at IS NOT NULL
       AND verification_token_expires_at > NOW()
     ORDER BY verified_at DESC
     LIMIT 1`,
    [normalizeEmail(email), token]
  );
  return result.rows[0] || null;
}

export async function consumeVerificationToken(id) {
  await query(
    `UPDATE signup_otps
     SET verification_token = NULL,
         verification_token_expires_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export const otpLimits = {
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  SEND_WINDOW_MINUTES,
  OTP_TTL_MINUTES,
  TOKEN_TTL_MINUTES,
};
