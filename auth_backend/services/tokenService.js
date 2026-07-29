import * as profileRepo from '../db/profileRepository.js';
import * as refreshRepo from '../db/refreshTokenRepository.js';
import {
  signAccessToken,
  buildTokenPayload,
  buildTokenPayloadFromBundle,
  toPublicUser,
} from '../middleware/auth.js';
import { formatProfileResponse } from './profileService.js';

export async function buildAuthSession(authUser, dashboardUser = null) {
  const userId = dashboardUser?.id;
  let payload;
  let profile = null;

  if (userId) {
    const bundle = await profileRepo.getFullProfileBundle(userId);
    if (bundle) {
      payload = buildTokenPayloadFromBundle(authUser, bundle);
      profile = formatProfileResponse(bundle, authUser);
    }
  }

  if (!payload) {
    payload = buildTokenPayload(authUser, dashboardUser);
  }

  const accessToken = signAccessToken(payload);
  const refresh = await refreshRepo.createRefreshToken(authUser.id);

  return {
    accessToken,
    refreshToken: refresh.refreshToken,
    token: accessToken,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresAt: refresh.expiresAt,
    user: {
      ...toPublicUser(authUser),
      roles: payload.roles,
      dashboardUserId: userId || payload.userId,
      profile,
    },
  };
}

export async function refreshAuthSession(rawRefreshToken) {
  const rotated = await refreshRepo.rotateRefreshToken(rawRefreshToken);
  if (!rotated) {
    throw new Error('Invalid or expired refresh token');
  }

  const row = rotated.record;
  if (!row.is_active) {
    throw new Error('User not found or inactive');
  }

  const authUser = {
    id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    auth_provider: row.auth_provider,
    password_hash: row.password_hash,
    is_active: row.is_active,
    phone: row.phone,
  };

  const { syncToDashboardUser } = await import('../db/userSync.js');
  const dashboardUser = await syncToDashboardUser(authUser, authUser.password_hash);

  let payload;
  let profile = null;
  const userId = dashboardUser?.id;

  if (userId) {
    const bundle = await profileRepo.getFullProfileBundle(userId);
    if (bundle) {
      payload = buildTokenPayloadFromBundle(authUser, bundle);
      profile = formatProfileResponse(bundle, authUser);
    }
  }

  if (!payload) {
    payload = buildTokenPayload(authUser, dashboardUser);
  }

  const accessToken = signAccessToken(payload);

  return {
    accessToken,
    refreshToken: rotated.next.refreshToken,
    token: accessToken,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresAt: rotated.next.expiresAt,
    user: {
      ...toPublicUser(authUser),
      roles: payload.roles,
      dashboardUserId: userId || payload.userId,
      profile,
    },
  };
}

export async function logoutRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new Error('Refresh token is required');
  }
  const revoked = await refreshRepo.revokeRefreshToken(rawRefreshToken);
  if (!revoked) {
    throw new Error('Refresh token not found or already revoked');
  }
  return { ok: true, message: 'Logged out successfully' };
}
