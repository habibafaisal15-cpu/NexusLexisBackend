import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from './index.js';
import { validateEmailForSignup } from '../shared/validation/email.js';

export async function findUserByEmail(email) {
  const result = await query(
    'SELECT id, username, email, password, role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
    [email.trim()]
  );
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(
    'SELECT id, username, email, role, is_active, date_joined FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

function verifyDjangoPassword(password, encoded) {
  try {
    const parts = encoded.split('$');
    if (parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const expectedHash = parts[3];
    const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return derived.toString('base64') === expectedHash;
  } catch {
    return false;
  }
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  // bcrypt (signup accounts)
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compare(password, storedHash);
  }

  // Django dummy data (pbkdf2_sha256$...)
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    return verifyDjangoPassword(password, storedHash);
  }

  // Plain-text passwords from manual SQL inserts
  return password === storedHash;
}

async function upgradePasswordIfNeeded(userId, password, storedHash) {
  const isHashed = storedHash.startsWith('$2') || storedHash.startsWith('pbkdf2_sha256$');
  if (isHashed) return;

  const hashed = await bcrypt.hash(password, 10);
  await query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
}

export async function initializeClientWorkspace(userId, displayName) {
  await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, 'Welcome to NexusLexis', $2, 'welcome', '/account', 'client')`,
    [userId, `Your corporate workspace is ready, ${displayName}. Explore lawyers, document services, and your retainer hub.`]
  );

  await query(
    `INSERT INTO client_activities (client_id, activity_type, lang_key, params)
     VALUES ($1, 'signup', 'Welcome', $2)`,
    [userId, JSON.stringify({ name: displayName })]
  );
}

export async function registerUser({ name, email, password, role = 'client' }) {
  const emailCheck = await validateEmailForSignup(email);
  if (!emailCheck.valid) {
    throw new Error(emailCheck.error);
  }

  const normalizedEmail = emailCheck.email;
  const username = name.trim();

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const usernameCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
  if (usernameCheck.rows[0]) {
    throw new Error('This organization name is already taken. Try a different name.');
  }

  const allowedRoles = ['client', 'lawyer', 'ca'];
  if (!allowedRoles.includes(role)) {
    throw new Error('Invalid account type');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await query(
    `INSERT INTO users (username, email, password, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, role, date_joined`,
    [username, normalizedEmail, hashedPassword, role]
  );

  const user = result.rows[0];

  if (role === 'client') {
    await initializeClientWorkspace(user.id, user.username);
  }

  return user;
}

export async function loginUser({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.is_active) {
    throw new Error('This account has been deactivated');
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  await upgradePasswordIfNeeded(user.id, password, user.password);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
}

export function buildTokenPayload(user) {
  const roles = [];
  if (user.role === 'client') roles.push('CorporateClient');
  if (user.role === 'lawyer') roles.push('LegalAdvocate');
  if (user.role === 'ca') roles.push('CharteredAccountant');
  if (user.role === 'admin') roles.push('Admin');

  const displayName = user.username || user.name;

  return {
    userId: user.id,
    sub: String(user.id),
    name: displayName,
    email: user.email,
    role: user.role,
    roles
  };
}
