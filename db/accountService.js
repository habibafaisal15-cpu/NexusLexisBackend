import bcrypt from 'bcryptjs';
import { query } from './index.js';
import { ensureAccountSchema } from './ensureAccountSchema.js';
import { getUserId } from '../middleware/auth.js';

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

export async function resolveAuthUserId(dashboardUserId, email) {
  await ensureAccountSchema();
  if (email) {
    const byEmail = await query(
      `SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (byEmail.rows[0]) return byEmail.rows[0].id;
  }
  const user = await query('SELECT email FROM users WHERE id = $1', [dashboardUserId]);
  if (!user.rows[0]?.email) return null;
  const auth = await query(
    `SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [user.rows[0].email]
  );
  return auth.rows[0]?.id || null;
}

export async function getClientProfilePayload(userId) {
  await ensureAccountSchema();
  const result = await query(
    `SELECT u.id, u.username, u.email, u.phone, u.language_pref, u.avatar_url, u.date_joined,
            u.account_status, u.is_active, cp.cnic, cp.city, cp.profile_photo
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const photo = row.avatar_url || row.profile_photo || null;
  return {
    id: String(row.id),
    name: row.username,
    email: row.email,
    phone: row.phone || '',
    cnic: row.cnic || '',
    city: row.city || '',
    language: row.language_pref || 'en',
    avatarUrl: photo,
    memberSince: iso(row.date_joined),
    status: row.is_active === false ? 'suspended' : (row.account_status || 'active'),
  };
}

export async function updateClientPhoto(userId, file) {
  await ensureAccountSchema();
  if (!file?.filename && !file?.path) {
    const err = new Error('Photo file required');
    err.status = 400;
    throw err;
  }
  const photoPath = `/uploads/${file.filename}`;
  await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [photoPath, userId]);
  await query(
    `INSERT INTO client_profiles (user_id, profile_photo, documents)
     VALUES ($1, $2, '{}'::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET profile_photo = EXCLUDED.profile_photo, updated_at = CURRENT_TIMESTAMP`,
    [userId, photoPath]
  ).catch(async () => {
    await query(
      `UPDATE client_profiles SET profile_photo = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [photoPath, userId]
    );
  });
  return { avatarUrl: photoPath, photoUrl: photoPath };
}

export async function changePassword(userId, email, { currentPassword, newPassword }) {
  if (!currentPassword || !newPassword) {
    const err = new Error('currentPassword and newPassword are required');
    err.status = 400;
    throw err;
  }
  if (String(newPassword).length < 8) {
    const err = new Error('New password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  const authId = await resolveAuthUserId(userId, email);
  const auth = await query(
    `SELECT id, password_hash, email FROM auth_users WHERE id = $1`,
    [authId]
  );
  const row = auth.rows[0];
  if (!row?.password_hash) {
    const err = new Error('This account uses Google sign-in. Set a password via forgot-password or keep using Google.');
    err.status = 400;
    throw err;
  }
  const ok = await bcrypt.compare(String(currentPassword), row.password_hash);
  if (!ok) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 8;
  const hash = await bcrypt.hash(String(newPassword), rounds);
  await query('UPDATE auth_users SET password_hash = $1 WHERE id = $2', [hash, row.id]);
  await query('UPDATE users SET password = $1 WHERE id = $2', [hash, userId]).catch(() => {});
  return { ok: true };
}

function sessionShape(row, currentId) {
  return {
    id: `sess_${row.id}`,
    device: row.device || 'Unknown device',
    location: row.location || null,
    ip: row.ip || null,
    lastActiveAt: iso(row.last_seen_at || row.created_at),
    current: Number(row.id) === Number(currentId),
  };
}

export async function listSessions(userId, email, currentRefreshRaw = null) {
  const authId = await resolveAuthUserId(userId, email);
  if (!authId) return { items: [] };
  const result = await query(
    `SELECT id, device, ip, location, user_agent, created_at, last_seen_at, expires_at
     FROM refresh_tokens
     WHERE auth_user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY COALESCE(last_seen_at, created_at) DESC`,
    [authId]
  );
  let currentId = result.rows[0]?.id;
  if (currentRefreshRaw) {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(String(currentRefreshRaw).trim()).digest('hex');
    const match = await query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND auth_user_id = $2 LIMIT 1`,
      [hash, authId]
    );
    if (match.rows[0]) currentId = match.rows[0].id;
  }
  return { items: result.rows.map((row) => sessionShape(row, currentId)) };
}

function parseSessionId(sessionId) {
  const raw = String(sessionId || '').replace(/^sess_/, '');
  const id = Number(raw);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid session id');
    err.status = 400;
    throw err;
  }
  return id;
}

export async function revokeSession(userId, email, sessionId) {
  const authId = await resolveAuthUserId(userId, email);
  const id = parseSessionId(sessionId);
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE id = $1 AND auth_user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [id, authId]
  );
  if (!result.rows[0]) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

export async function revokeOtherSessions(userId, email, currentRefreshRaw = null) {
  const authId = await resolveAuthUserId(userId, email);
  let keepId = null;
  if (currentRefreshRaw) {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(String(currentRefreshRaw).trim()).digest('hex');
    const match = await query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND auth_user_id = $2 LIMIT 1`,
      [hash, authId]
    );
    keepId = match.rows[0]?.id || null;
  }
  if (!keepId) {
    const latest = await query(
      `SELECT id FROM refresh_tokens
       WHERE auth_user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [authId]
    );
    keepId = latest.rows[0]?.id || null;
  }
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE auth_user_id = $1 AND revoked_at IS NULL
       AND ($2::bigint IS NULL OR id <> $2)`,
    [authId, keepId]
  );
  return { ok: true };
}

export async function updatePreferences(userId, email, { language } = {}) {
  await ensureAccountSchema();
  if (language && !['en', 'ur'].includes(String(language))) {
    const err = new Error('language must be en or ur');
    err.status = 400;
    throw err;
  }
  if (language) {
    await query('UPDATE users SET language_pref = $1 WHERE id = $2', [language, userId]);
    if (email) {
      await query(
        'UPDATE auth_users SET language_pref = $1 WHERE LOWER(email) = LOWER($2)',
        [language, email]
      ).catch(() => {});
    }
    await query(
      'UPDATE client_profiles SET language_pref = $1 WHERE user_id = $2',
      [language, userId]
    ).catch(() => {});
  }
  return { ok: true, language: language || 'en' };
}

export function getRequestUserId(req) {
  return getUserId(req);
}
