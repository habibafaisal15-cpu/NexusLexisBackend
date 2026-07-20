/**
 * Send a test OTP-style email via the configured provider (Graph, etc.).
 * Usage: node scripts/test-email-send.mjs you@example.com
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendSignupOtpEmail, isEmailDeliveryConfigured } from '../services/emailService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/test-email-send.mjs <recipient-email>');
  process.exit(1);
}

if (!isEmailDeliveryConfigured()) {
  console.error('No email provider configured. Add MS365_* to auth_backend/.env');
  process.exit(1);
}

try {
  const result = await sendSignupOtpEmail({
    email: to,
    otpCode: '123456',
    expiresMinutes: 10,
  });

  if (result.delivered) {
    console.log(`Test OTP email sent to ${to} via ${result.provider}`);
    process.exit(0);
  }

  console.error('Email provider returned without delivering.');
  process.exit(1);
} catch (err) {
  console.error('Send failed:', err.message);
  process.exit(1);
}
