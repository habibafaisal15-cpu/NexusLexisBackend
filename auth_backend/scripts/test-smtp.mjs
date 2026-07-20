/**
 * Verify SMTP settings by sending a test email.
 * Usage: node scripts/test-smtp.mjs you@example.com
 */
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/test-smtp.mjs <recipient-email>');
  process.exit(1);
}

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_FROM) {
  console.error('Missing SMTP_HOST or SMTP_FROM in auth_backend/.env');
  process.exit(1);
}

if (!SMTP_USER || !SMTP_PASS) {
  console.error('Missing SMTP_USER or SMTP_PASS in auth_backend/.env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: SMTP_SECURE === 'true',
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  await transporter.verify();
  console.log('SMTP connection OK');

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: 'Nexus Lexis — SMTP test',
    text: 'If you received this, OTP emails will work.',
    html: '<p>If you received this, <strong>OTP emails will work</strong>.</p>',
  });

  console.log('Test email sent:', info.messageId);
} catch (err) {
  console.error('SMTP failed:', err.message);
  if (/smtp_auth_disabled|SmtpClientAuthentication is disabled/i.test(err.message)) {
    console.error('\nMicrosoft 365 blocked SMTP login for this tenant.');
    console.error('Enable Authenticated SMTP for contact@nexuslexis.law in Exchange Admin Center.');
    console.error('https://aka.ms/smtp_auth_disabled\n');
  } else if (/BadCredentials|gsmtp/i.test(err.message)) {
    console.error('\nWrong mail server or password.');
    console.error('nexuslexis.law uses Microsoft 365 — use smtp.office365.com and a Microsoft mailbox password.');
  }
  process.exit(1);
}
