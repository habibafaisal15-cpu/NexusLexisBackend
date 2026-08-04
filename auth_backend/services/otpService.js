import { query } from '../db/index.js';
import { findDashboardUserByEmail } from '../db/userSync.js';
import { validateEmailForSignup } from '../utils/validation.js';
import * as otpRepo from '../db/otpRepository.js';
import { sendSignupOtpEmail, isEmailDeliveryConfigured } from './emailService.js';

async function findExistingAccount(email) {
  const normalized = email.trim();
  const authResult = await query(
    `SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)`,
    [normalized]
  );
  if (authResult.rows[0]) return authResult.rows[0];

  return findDashboardUserByEmail(normalized);
}

export async function requestSignupOtp(email) {
  const emailCheck = await validateEmailForSignup(email);
  if (!emailCheck.valid) {
    return {
      ok: false,
      code: emailCheck.code,
      error: emailCheck.error || 'Please enter a valid email address.',
    };
  }

  const normalizedEmail = emailCheck.email;
  const existing = await findExistingAccount(normalizedEmail);
  if (existing) {
    return {
      ok: false,
      code: 'ALREADY_EXISTS',
      error: 'An account with this email already exists.',
    };
  }

  const recentSends = await otpRepo.countRecentSends(normalizedEmail);
  if (recentSends >= otpRepo.otpLimits.MAX_SENDS_PER_WINDOW) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Too many verification codes requested. Please try again later.',
    };
  }

  // PostgreSQL generates and stores the temporary token
  const record = await otpRepo.createSignupOtp(normalizedEmail);
  const tempToken = record.otp_code;

  let delivery;
  try {
    delivery = await sendSignupOtpEmail({
      email: normalizedEmail,
      otpCode: tempToken,
      expiresMinutes: otpRepo.otpLimits.OTP_TTL_MINUTES,
    });
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'EMAIL_DELIVERY_FAILED',
      error: err.message || 'Could not send verification email. Please try again later.',
    };
  }

  if (!delivery.delivered && process.env.NODE_ENV === 'production') {
    return {
      ok: false,
      code: 'EMAIL_DELIVERY_FAILED',
      error: 'Could not send verification email. Please try again later.',
    };
  }

  if (!delivery.delivered && process.env.NODE_ENV !== 'production') {
    console.log(
      `[signup-otp] Dev mode: OTP stored for ${normalizedEmail} (id=${record.id}). Configure MS365_* in .env to email codes.`
    );
  }

  return {
    ok: true,
    email: normalizedEmail,
    message: isEmailDeliveryConfigured()
      ? 'Verification code sent to your email.'
      : 'Verification code generated. Check your email once SMTP is configured.',
    expiresInMinutes: otpRepo.otpLimits.OTP_TTL_MINUTES,
  };
}

export async function verifySignupOtp(email, code) {
  const normalizedEmail = email?.toLowerCase().trim();
  const otpValue = String(code || '').trim();

  if (!normalizedEmail || !/^\d{6}$/.test(otpValue)) {
    return {
      ok: false,
      code: 'INVALID_OTP',
      error: 'Please enter the 6-digit verification code.',
    };
  }

  const record = await otpRepo.findActiveOtp(normalizedEmail);
  if (!record) {
    return {
      ok: false,
      code: 'OTP_EXPIRED',
      error: 'This verification code has expired. Request a new one.',
    };
  }

  if (record.attempts >= otpRepo.otpLimits.MAX_ATTEMPTS) {
    return {
      ok: false,
      code: 'OTP_LOCKED',
      error: 'Too many incorrect attempts. Request a new verification code.',
    };
  }

  if (record.otp_code !== otpValue) {
    await otpRepo.incrementOtpAttempts(record.id);
    return {
      ok: false,
      code: 'INVALID_OTP',
      error: 'Incorrect verification code. Please try again.',
    };
  }

  // PostgreSQL issues the one-time registration token after OTP matches DB record
  const verified = await otpRepo.markOtpVerified(record.id);
  return {
    ok: true,
    email: verified.email,
    verificationToken: verified.verification_token,
    message: 'Email verified successfully.',
  };
}

export function isSignupOtpSkipped() {
  return process.env.SKIP_SIGNUP_OTP === 'true';
}

export function isPasswordResetOtpSkipped() {
  return process.env.SKIP_PASSWORD_RESET_OTP === 'true' || isSignupOtpSkipped();
}

export async function assertEmailVerificationToken(email, token) {
  if (isSignupOtpSkipped()) return true;

  const normalizedEmail = email?.toLowerCase().trim();
  const tokenValue = String(token || '').trim();

  if (!normalizedEmail || !tokenValue) {
    throw new Error('Email verification is required before registration.');
  }

  const record = await otpRepo.findVerifiedToken(normalizedEmail, tokenValue);
  if (!record) {
    throw new Error('Email verification expired. Please verify your email again.');
  }

  await otpRepo.consumeVerificationToken(record.id);
  return true;
}
