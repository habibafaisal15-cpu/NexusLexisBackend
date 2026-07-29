import nodemailer from 'nodemailer';
import {
  isGraphConfigured,
  sendGraphMail,
  verifyGraphMailConnection,
} from './graphMailService.js';
import {
  isGraphDelegatedConfigured,
  sendDelegatedGraphMail,
  verifyGraphDelegatedConnection,
} from './graphDelegatedMailService.js';
import {
  isResendConfigured,
  sendResendMail,
  verifyResendConnection,
} from './resendMailService.js';

let transporterPromise = null;

export function resetSmtpTransporter() {
  transporterPromise = null;
}

function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_FROM
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
  );
}

let gmailTransporterPromise = null;

async function getGmailTransporter() {
  if (!isGmailConfigured()) return null;
  if (!gmailTransporterPromise) {
    gmailTransporterPromise = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
      },
    });
  }
  return gmailTransporterPromise;
}

function getEmailProviderOrder() {
  const configured = (process.env.EMAIL_PROVIDER || 'graph,resend,gmail,smtp')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured.length ? configured : ['graph', 'resend', 'gmail', 'smtp'];
}

function buildOtpEmailContent(otpCode, expiresMinutes) {
  const subject = 'Your Nexus Lexis verification code';
  const text = [
    'Welcome to Nexus Lexis.',
    '',
    `Your email verification code is: ${otpCode}`,
    '',
    `This code expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #16213e;">
      <h2 style="margin-bottom: 8px;">Verify your email</h2>
      <p>Use this code to continue creating your Nexus Lexis account:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; margin: 24px 0;">${otpCode}</p>
      <p style="color: #666;">This code expires in ${expiresMinutes} minutes.</p>
      <p style="color: #666; font-size: 13px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

function buildPasswordResetEmailContent(otpCode, expiresMinutes) {
  const subject = 'Reset your Nexus Lexis password';
  const text = [
    'You requested a password reset for your Nexus Lexis account.',
    '',
    `Your reset code is: ${otpCode}`,
    '',
    `This code expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #16213e;">
      <h2 style="margin-bottom: 8px;">Reset your password</h2>
      <p>Use this code to reset your Nexus Lexis password:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; margin: 24px 0;">${otpCode}</p>
      <p style="color: #666;">This code expires in ${expiresMinutes} minutes.</p>
      <p style="color: #666; font-size: 13px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
}

async function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
      auth: {
        user: process.env.SMTP_USER,
        pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
      },
    });
  }

  return transporterPromise;
}

async function sendViaGmail({ to, subject, text, html }) {
  const transporter = await getGmailTransporter();
  if (!transporter) {
    return { delivered: false, devMode: true };
  }

  const from = process.env.GMAIL_FROM || `Nexus Lexis <${process.env.GMAIL_USER}>`;
  await transporter.sendMail({ from, to, subject, text, html });
  return { delivered: true, provider: 'gmail' };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transporter = await getTransporter();
  if (!transporter) {
    return { delivered: false, devMode: true };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Nexus Lexis <contact@nexuslexis.law>',
    to,
    subject,
    text,
    html,
  });

  return { delivered: true, provider: 'smtp' };
}

async function sendWithProvider(provider, payload) {
  if (provider === 'graph-delegated' && isGraphDelegatedConfigured()) {
    return sendDelegatedGraphMail(payload);
  }
  if (provider === 'graph' && isGraphConfigured()) {
    return sendGraphMail(payload);
  }
  if (provider === 'resend' && isResendConfigured()) {
    return sendResendMail(payload);
  }
  if (provider === 'gmail' && isGmailConfigured()) {
    return sendViaGmail(payload);
  }
  if (provider === 'smtp' && isSmtpConfigured()) {
    return sendViaSmtp(payload);
  }
  return null;
}

export async function sendSignupOtpEmail({ email, otpCode, expiresMinutes = 10 }) {
  const { subject, text, html } = buildOtpEmailContent(otpCode, expiresMinutes);
  const payload = { to: email, subject, text, html };
  const providers = getEmailProviderOrder();
  const errors = [];

  for (const provider of providers) {
    try {
      const result = await sendWithProvider(provider, payload);
      if (result?.delivered) {
        console.log(`[signup-otp] Sent OTP to ${email} via ${result.provider || provider}`);
        return result;
      }
    } catch (err) {
      console.error(`[signup-otp] ${provider} failed for ${email}:`, err.message);
      errors.push(`${provider}: ${err.message}`);
    }
  }

  if (!isGraphConfigured() && !isResendConfigured() && !isGmailConfigured() && !isSmtpConfigured()) {
    console.warn(`[signup-otp] No email provider configured — OTP stored but not emailed to ${email}`);
    return { delivered: false, devMode: true };
  }

  const smtpError = new Error(
    errors[0]?.includes('smtp_auth_disabled') || errors.join(' ').includes('smtp_auth_disabled')
      ? 'Email delivery is blocked by Microsoft 365. Configure Microsoft Graph (MS365_* in .env) or Resend (RESEND_API_KEY).'
      : 'Could not send verification email. Configure Microsoft Graph or Resend in auth_backend/.env'
  );
  smtpError.code = 'EMAIL_DELIVERY_FAILED';
  throw smtpError;
}

export async function sendPasswordResetOtpEmail({ email, otpCode, expiresMinutes = 10 }) {
  const { subject, text, html } = buildPasswordResetEmailContent(otpCode, expiresMinutes);
  const payload = { to: email, subject, text, html };
  const providers = getEmailProviderOrder();
  const errors = [];

  for (const provider of providers) {
    try {
      const result = await sendWithProvider(provider, payload);
      if (result?.delivered) {
        console.log(`[password-reset] Sent reset OTP to ${email} via ${result.provider || provider}`);
        return result;
      }
    } catch (err) {
      console.error(`[password-reset] ${provider} failed for ${email}:`, err.message);
      errors.push(`${provider}: ${err.message}`);
    }
  }

  if (!isGraphConfigured() && !isResendConfigured() && !isGmailConfigured() && !isSmtpConfigured()) {
    console.warn(`[password-reset] No email provider configured — OTP stored but not emailed to ${email}`);
    return { delivered: false, devMode: true };
  }

  const smtpError = new Error(
    errors[0] || 'Could not send password reset email. Configure Microsoft Graph or SMTP in auth_backend/.env'
  );
  smtpError.code = 'EMAIL_DELIVERY_FAILED';
  throw smtpError;
}

export function isEmailDeliveryConfigured() {
  return isGraphDelegatedConfigured() || isGraphConfigured() || isResendConfigured() || isGmailConfigured() || isSmtpConfigured();
}

function explainSmtpError(message = '') {
  if (/smtp_auth_disabled|SmtpClientAuthentication is disabled/i.test(message)) {
    return [
      'Microsoft 365 SMTP AUTH is disabled for this tenant.',
      'Use Microsoft Graph instead (MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET in .env).',
      'See https://aka.ms/smtp_auth_disabled',
    ].join(' ');
  }
  if (/BadCredentials|Authentication unsuccessful/i.test(message)) {
    return 'SMTP login failed. For nexuslexis.law use Microsoft Graph, not Gmail SMTP.';
  }
  return message;
}

export async function verifyGmailConnection() {
  const transporter = await getGmailTransporter();
  if (!transporter) {
    return { ok: false, error: 'Gmail not configured' };
  }
  try {
    await transporter.verify();
    return { ok: true, provider: 'gmail', sender: process.env.GMAIL_USER };
  } catch (err) {
    return {
      ok: false,
      error: 'Gmail SMTP login failed. Check GMAIL_USER and GMAIL_APP_PASSWORD.',
      raw: err.message,
    };
  }
}

export async function verifySmtpConnection() {
  const transporter = await getTransporter();
  if (!transporter) {
    return { ok: false, error: 'SMTP not configured' };
  }
  try {
    await transporter.verify();
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    return { ok: false, error: explainSmtpError(err.message), raw: err.message };
  }
}

export async function verifyEmailDelivery() {
  const providers = getEmailProviderOrder();
  const errors = [];

  for (const provider of providers) {
    let result = null;

    if (provider === 'graph-delegated' && isGraphDelegatedConfigured()) {
      result = await verifyGraphDelegatedConnection();
    } else if (provider === 'graph' && isGraphConfigured()) {
      result = await verifyGraphMailConnection();
    } else if (provider === 'resend' && isResendConfigured()) {
      result = await verifyResendConnection();
    } else if (provider === 'gmail' && isGmailConfigured()) {
      result = await verifyGmailConnection();
    } else if (provider === 'smtp' && isSmtpConfigured()) {
      result = await verifySmtpConnection();
    }

    if (!result) continue;
    if (result.ok) return result;

    errors.push(result.error || result.raw);
    // Fail on primary provider — don't silently fall back during health check
    return { ok: false, error: result.error || result.raw, raw: result.raw };
  }

  if (!isEmailDeliveryConfigured()) {
    return { ok: false, error: 'No email provider configured' };
  }

  return {
    ok: false,
    error: errors.filter(Boolean).join(' ') || 'All configured email providers failed verification.',
  };
}
