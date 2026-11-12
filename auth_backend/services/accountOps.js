import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

async function resolveAuthUserId(dashboardUserId, email) {
  if (email) {
    const byEmail = await query(
      `SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (byEmail.rows[0]) return byEmail.rows[0].id;
  }
  if (!dashboardUserId) return null;
  const user = await query('SELECT email FROM users WHERE id = $1', [dashboardUserId]);
  if (!user.rows[0]?.email) return null;
  const auth = await query(
    `SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [user.rows[0].email]
  );
  return auth.rows[0]?.id || null;
}

export async function changePassword(userId, email, { currentPassword, newPassword } = {}) {
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
    `SELECT id, password_hash FROM auth_users WHERE id = $1`,
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
  const hash = await bcrypt.hash(String(newPassword), Number(process.env.BCRYPT_ROUNDS) || 8);
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
  ).catch(() => ({ rows: [] }));
  let currentId = result.rows[0]?.id;
  if (currentRefreshRaw) {
    const hash = crypto.createHash('sha256').update(String(currentRefreshRaw).trim()).digest('hex');
    const match = await query(
      `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND auth_user_id = $2 LIMIT 1`,
      [hash, authId]
    ).catch(() => ({ rows: [] }));
    if (match.rows[0]) currentId = match.rows[0].id;
  }
  return { items: result.rows.map((row) => sessionShape(row, currentId)) };
}

function parseSessionId(sessionId) {
  const id = Number(String(sessionId || '').replace(/^sess_/, ''));
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
  if (language && !['en', 'ur'].includes(String(language))) {
    const err = new Error('language must be en or ur');
    err.status = 400;
    throw err;
  }
  if (language) {
    await query('UPDATE users SET language_pref = $1 WHERE id = $2', [language, userId]).catch(() => {});
    if (email) {
      await query(
        'UPDATE auth_users SET language_pref = $1 WHERE LOWER(email) = LOWER($2)',
        [language, email]
      ).catch(() => {});
    }
  }
  return { ok: true, language: language || 'en' };
}

export async function listVault(userId) {
  const result = await query(
    `SELECT id, user_id, doc_type, file_name, mime_type, state, role, label, created_at
     FROM verification_uploads
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  ).catch(() => ({ rows: [] }));
  const authBase = (process.env.AUTH_PUBLIC_URL || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth').replace(/\/$/, '');
  return {
    items: result.rows.map((row) => ({
      id: String(row.id),
      docType: row.doc_type,
      label: row.label || row.doc_type,
      fileName: row.file_name || `${row.doc_type}.bin`,
      fileUrl: `${authBase}/documents/${row.id}`,
      state: row.state || 'pending',
      role: row.role || null,
    })),
  };
}

export async function updateClientPhoto(userId, file) {
  if (!file?.filename && !file?.path) {
    const err = new Error('Photo file required');
    err.status = 400;
    throw err;
  }
  const photoPath = `/uploads/${file.filename}`;
  await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [photoPath, userId]).catch(() => {});
  return { avatarUrl: photoPath, photoUrl: photoPath };
}
