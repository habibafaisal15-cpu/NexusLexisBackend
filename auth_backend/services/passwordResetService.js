import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { findUserByEmail } from './authService.js';
import { validateEmailForSignup } from '../utils/validation.js';
import * as resetRepo from '../db/passwordResetRepository.js';
import { sendPasswordResetOtpEmail, isEmailDeliveryConfigured } from './emailService.js';
import { syncToDashboardUser } from '../db/userSync.js';
import { revokeAllRefreshTokens } from '../db/refreshTokenRepository.js';

export async function requestPasswordReset(email) {
  const emailCheck = await validateEmailForSignup(email);
  if (!emailCheck.valid) {
    return {
      ok: false,
      code: emailCheck.code,
      error: emailCheck.error || 'Please enter a valid email address.',
    };
  }

  const normalizedEmail = emailCheck.email;
  const user = await findUserByEmail(normalizedEmail);

  if (!user || !user.is_active) {
    return {
      ok: true,
      email: normalizedEmail,
      message: 'If an account exists for this email, a reset code has been sent.',
    };
  }

  if (!user.password_hash) {
    return {
      ok: true,
      email: normalizedEmail,
      message: 'If an account exists for this email, a reset code has been sent.',
    };
  }

  const recentSends = await resetRepo.countRecentPasswordResetSends(normalizedEmail);
  if (recentSends >= resetRepo.passwordResetLimits.MAX_SENDS_PER_WINDOW) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Too many reset codes requested. Please try again later.',
    };
  }

  const record = await resetRepo.createPasswordResetOtp(normalizedEmail);

  try {
    await sendPasswordResetOtpEmail({
      email: normalizedEmail,
      otpCode: record.otp_code,
      expiresMinutes: resetRepo.passwordResetLimits.OTP_TTL_MINUTES,
    });
  } catch (err) {
    return {
      ok: false,
      code: err.code || 'EMAIL_DELIVERY_FAILED',
      error: err.message || 'Could not send reset email. Please try again later.',
    };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[password-reset] Dev mode: reset OTP for ${normalizedEmail} is ${record.otp_code}`);
  }

  return {
    ok: true,
    email: normalizedEmail,
    message: isEmailDeliveryConfigured()
      ? 'If an account exists for this email, a reset code has been sent.'
      : 'Reset code generated. Configure email delivery for production.',
    expiresInMinutes: resetRepo.passwordResetLimits.OTP_TTL_MINUTES,
  };
}

export async function verifyPasswordResetOtp(email, code) {
  const normalizedEmail = email?.toLowerCase().trim();
  const otpValue = String(code || '').trim();

  if (!normalizedEmail || !/^\d{6}$/.test(otpValue)) {
    return {
      ok: false,
      code: 'INVALID_OTP',
      error: 'Please enter the 6-digit reset code.',
    };
  }

  const record = await resetRepo.findActivePasswordResetOtp(normalizedEmail);
  if (!record) {
    return {
      ok: false,
      code: 'OTP_EXPIRED',
      error: 'This reset code has expired. Request a new one.',
    };
  }

  if (record.attempts >= resetRepo.passwordResetLimits.MAX_ATTEMPTS) {
    return {
      ok: false,
      code: 'OTP_LOCKED',
      error: 'Too many incorrect attempts. Request a new reset code.',
    };
  }

  if (record.otp_code !== otpValue) {
    await resetRepo.incrementPasswordResetAttempts(record.id);
    return {
      ok: false,
      code: 'INVALID_OTP',
      error: 'Incorrect reset code. Please try again.',
    };
  }

  const verified = await resetRepo.markPasswordResetVerified(record.id);
  return {
    ok: true,
    email: verified.email,
    resetToken: verified.reset_token,
    message: 'Reset code verified. You can now set a new password.',
  };
}

export async function resetPasswordWithToken({ email, resetToken, password }) {
  const normalizedEmail = email?.toLowerCase().trim();
  const tokenValue = String(resetToken || '').trim();
  const newPassword = String(password || '');

  if (!normalizedEmail || !tokenValue) {
    throw new Error('Email and reset token are required');
  }

  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user || !user.is_active) {
    throw new Error('Account not found');
  }

  if (!user.password_hash) {
    throw new Error('This account uses Google sign-in. Continue with Google instead.');
  }

  const tokenRecord = await resetRepo.findValidResetToken(normalizedEmail, tokenValue);
  if (!tokenRecord) {
    throw new Error('Password reset expired. Please request a new code.');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE auth_users SET password_hash = $1 WHERE id = $2`,
    [passwordHash, user.id]
  );

  await syncToDashboardUser({ ...user, password_hash: passwordHash }, passwordHash);
  await resetRepo.consumeResetToken(tokenRecord.id);
  await revokeAllRefreshTokens(user.id);

  return { ok: true, message: 'Password updated successfully.' };
}
