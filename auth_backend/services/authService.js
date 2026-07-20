import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { pool, query } from '../db/index.js';
import { syncToDashboardUser } from '../db/userSync.js';
import { buildTokenPayload, toPublicUser } from '../middleware/auth.js';
import { validateEmailForSignup } from '../utils/validation.js';
import { assertEmailVerificationToken } from './otpService.js';
import { notifyNewUser } from '../utils/notifyNewUser.js';

const REGISTER_ROLES = ['client', 'lawyer', 'ca'];
const ALL_ROLES = ['client', 'lawyer', 'ca', 'admin'];

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function findUserByEmail(email) {
  const result = await query(
    `SELECT id, full_name, email, password_hash, role, auth_provider, google_id, is_active, phone
     FROM auth_users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(
    `SELECT id, full_name, email, role, auth_provider, is_active, created_at, last_login_at
     FROM auth_users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function touchLastLogin(userId) {
  await query('UPDATE auth_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
}

export async function registerUser({ fullName, email, password, phone, role = 'client', verificationToken }) {
  const normalizedEmail = email?.toLowerCase().trim();
  const name = fullName?.trim();
  const normalizedPhone = phone?.trim() || null;

  if (!name || !normalizedEmail || !password) {
    throw new Error('Full name, email, and password are required');
  }

  await assertEmailVerificationToken(normalizedEmail, verificationToken);

  const emailCheck = await validateEmailForSignup(normalizedEmail);
  if (!emailCheck.valid) {
    throw new Error(emailCheck.error);
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  if (!REGISTER_ROLES.includes(role)) {
    throw new Error('Invalid account type. Choose client, lawyer, or ca.');
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const db = await pool.connect();

  try {
    await db.query('BEGIN');

    const result = await db.query(
      `INSERT INTO auth_users (full_name, email, password_hash, role, auth_provider, phone)
       VALUES ($1, $2, $3, $4, 'local', $5)
       RETURNING id, full_name, email, role, auth_provider, is_active, phone`,
      [name, normalizedEmail, passwordHash, role, normalizedPhone]
    );

    const authUser = result.rows[0];
    const dashboardUser = await syncToDashboardUser(authUser, passwordHash, db);

    await db.query('COMMIT');
    await notifyNewUser({ email: normalizedEmail, role, source: 'register' });
    return { authUser, dashboardUser };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

export async function loginUser({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new Error('Invalid email or password');
  }

  if (!user.password_hash) {
    throw new Error('This account uses Google sign-in. Continue with Google instead.');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  await touchLastLogin(user.id);
  const dashboardUser = await syncToDashboardUser(user, user.password_hash);
  return { authUser: user, dashboardUser };
}

export async function loginWithGoogleIdToken(idToken, defaultRole = 'client') {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in is not configured on the server');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Google account did not return an email address');
  }

  return upsertGoogleUser({
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    fullName: payload.name || payload.email.split('@')[0],
    defaultRole
  });
}

export async function exchangeGoogleAuthCode(code, defaultRole = 'client') {
  const { tokens } = await googleClient.getToken(code);
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error('Google account did not return an email address');
  }

  return upsertGoogleUser({
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    fullName: payload.name || payload.email.split('@')[0],
    defaultRole
  });
}

async function upsertGoogleUser({ googleId, email, fullName, defaultRole }) {
  if (!REGISTER_ROLES.includes(defaultRole)) {
    defaultRole = 'client';
  }

  let user = await query(
    `SELECT id, full_name, email, role, auth_provider, google_id, is_active
     FROM auth_users WHERE google_id = $1 OR LOWER(email) = LOWER($2)`,
    [googleId, email]
  ).then((res) => res.rows[0] || null);

  if (user && !user.is_active) {
    throw new Error('This account has been deactivated');
  }

  if (!user) {
    const created = await query(
      `INSERT INTO auth_users (full_name, email, role, auth_provider, google_id, password_hash)
       VALUES ($1, $2, $3, 'google', $4, NULL)
       RETURNING id, full_name, email, role, auth_provider, google_id, is_active`,
      [fullName, email, defaultRole, googleId]
    );
    user = created.rows[0];
    await notifyNewUser({ email, role: defaultRole, source: 'google' });
  } else if (!user.google_id) {
    const linked = await query(
      `UPDATE auth_users
       SET google_id = $1, auth_provider = 'google', full_name = COALESCE(NULLIF(full_name, ''), $2)
       WHERE id = $3
       RETURNING id, full_name, email, role, auth_provider, google_id, is_active`,
      [googleId, fullName, user.id]
    );
    user = linked.rows[0];
  }

  await touchLastLogin(user.id);
  const dashboardUser = await syncToDashboardUser(user, user.password_hash);
  return { authUser: user, dashboardUser };
}

export function getGoogleAuthUrl(state = 'login') {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials are not configured');
  }

  return googleClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['openid', 'email', 'profile'],
    state
  });
}

export { buildTokenPayload, toPublicUser, ALL_ROLES };
