import crypto from 'crypto';
import { query } from './index.js';

const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeExpiryDays() {
  return Number.isFinite(REFRESH_TTL_DAYS) && REFRESH_TTL_DAYS > 0 ? REFRESH_TTL_DAYS : 30;
}

export async function createRefreshToken(authUserId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const days = normalizeExpiryDays();

  const result = await query(
    `INSERT INTO refresh_tokens (auth_user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval)
     RETURNING id, expires_at`,
    [authUserId, tokenHash, String(days)]
  );

  return {
    refreshToken: rawToken,
    expiresAt: result.rows[0].expires_at,
    id: result.rows[0].id,
  };
}

export async function findValidRefreshToken(rawToken) {
  const tokenHash = hashToken(String(rawToken || '').trim());
  const result = await query(
    `SELECT rt.id, rt.auth_user_id, rt.expires_at,
            au.id AS user_id, au.full_name, au.email, au.role, au.auth_provider,
            au.password_hash, au.is_active, au.phone
     FROM refresh_tokens rt
     JOIN auth_users au ON au.id = rt.auth_user_id
     WHERE rt.token_hash = $1
       AND rt.revoked_at IS NULL
       AND rt.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(String(rawToken || '').trim());
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash]
  );
  return Boolean(result.rows[0]);
}

export async function revokeAllRefreshTokens(authUserId) {
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE auth_user_id = $1 AND revoked_at IS NULL`,
    [authUserId]
  );
}

export async function rotateRefreshToken(rawToken) {
  const record = await findValidRefreshToken(rawToken);
  if (!record) return null;

  await revokeRefreshToken(rawToken);
  const next = await createRefreshToken(record.auth_user_id);
  return { record, next };
}
