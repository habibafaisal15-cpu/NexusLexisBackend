import crypto from 'crypto';
import { query } from './index.js';

const OTP_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MINUTES = 15;

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function countRecentPasswordResetSends(email) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM password_reset_otps
     WHERE LOWER(email) = LOWER($1)
       AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [normalizeEmail(email), SEND_WINDOW_MINUTES]
  );
  return result.rows[0]?.count || 0;
}

export async function invalidateActivePasswordResets(email) {
  await query(
    `UPDATE password_reset_otps
     SET expires_at = NOW()
     WHERE LOWER(email) = LOWER($1)
       AND verified_at IS NULL
       AND expires_at > NOW()`,
    [normalizeEmail(email)]
  );
}

export async function createPasswordResetOtp(email) {
  const normalizedEmail = normalizeEmail(email);
  const otpCode = generateOtpCode();

  await invalidateActivePasswordResets(normalizedEmail);

  const result = await query(
    `INSERT INTO password_reset_otps (email, otp_code, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)
     RETURNING id, email, otp_code, expires_at, created_at`,
    [normalizedEmail, otpCode, String(OTP_TTL_MINUTES)]
  );

  return result.rows[0];
}

export async function findActivePasswordResetOtp(email) {
  const result = await query(
    `SELECT id, email, otp_code, expires_at, verified_at, attempts,
            reset_token, reset_token_expires_at
     FROM password_reset_otps
     WHERE LOWER(email) = LOWER($1)
       AND verified_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

export async function incrementPasswordResetAttempts(id) {
  await query(
    `UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = $1`,
    [id]
  );
}

export async function markPasswordResetVerified(id) {
  const resetToken = generateResetToken();
  const result = await query(
    `UPDATE password_reset_otps
     SET verified_at = NOW(),
         reset_token = $2,
         reset_token_expires_at = NOW() + ($3 || ' minutes')::interval
     WHERE id = $1
     RETURNING email, reset_token, reset_token_expires_at`,
    [id, resetToken, String(RESET_TOKEN_TTL_MINUTES)]
  );
  return result.rows[0] || null;
}

export async function findValidResetToken(email, resetToken) {
  const result = await query(
    `SELECT id, email
     FROM password_reset_otps
     WHERE LOWER(email) = LOWER($1)
       AND reset_token = $2
       AND verified_at IS NOT NULL
       AND reset_token_expires_at > NOW()
     ORDER BY verified_at DESC
     LIMIT 1`,
    [normalizeEmail(email), String(resetToken || '').trim()]
  );
  return result.rows[0] || null;
}

export async function consumeResetToken(id) {
  await query(
    `UPDATE password_reset_otps
     SET reset_token = NULL,
         reset_token_expires_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export const passwordResetLimits = {
  OTP_TTL_MINUTES,
  RESET_TOKEN_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  SEND_WINDOW_MINUTES,
};
