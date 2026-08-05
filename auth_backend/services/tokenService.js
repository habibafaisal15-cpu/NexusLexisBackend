import * as profileRepo from '../db/profileRepository.js';
import * as refreshRepo from '../db/refreshTokenRepository.js';
import {
  signAccessToken,
  buildTokenPayload,
  buildTokenPayloadFromBundle,
  toPublicUser,
} from '../middleware/auth.js';
import { formatProfileResponse } from './profileService.js';
import { getAccountAccessMeta } from './accountAccess.js';

function useFastAuthSession() {
  return process.env.FAST_AUTH_SESSION === 'true' || Boolean(process.env.VERCEL);
}

async function loadProfileBundle(userId) {
  if (!userId || useFastAuthSession()) return null;
  try {
    return await profileRepo.getFullProfileBundle(userId);
  } catch (err) {
    console.warn('[auth-session] Profile bundle skipped:', err.message);
    return null;
  }
}

export async function buildAuthSession(authUser, dashboardUser = null) {
  const userId = dashboardUser?.id;
  let payload;
  let profile = null;

  const bundle = await loadProfileBundle(userId);
  if (bundle) {
    payload = buildTokenPayloadFromBundle(authUser, bundle);
    profile = formatProfileResponse(bundle, authUser);
  }

  if (!payload) {
    payload = buildTokenPayload(authUser, dashboardUser);
  }

  const accessToken = signAccessToken(payload);
  const refresh = await refreshRepo.createRefreshToken(authUser.id);
  const accountAccess = await getAccountAccessMeta(authUser, dashboardUser);

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
      verificationStatus: accountAccess.verificationStatus,
      canAccessDashboard: accountAccess.canAccessDashboard,
      nextStep: accountAccess.nextStep,
      pendingVerificationRole: accountAccess.pendingVerificationRole,
    },
    accountAccess,
    message: accountAccess.message || undefined,
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

  const bundle = await loadProfileBundle(userId);
  if (bundle) {
    payload = buildTokenPayloadFromBundle(authUser, bundle);
    profile = formatProfileResponse(bundle, authUser);
  }

  if (!payload) {
    payload = buildTokenPayload(authUser, dashboardUser);
  }

  const accessToken = signAccessToken(payload);
  const accountAccess = await getAccountAccessMeta(authUser, dashboardUser);

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
      verificationStatus: accountAccess.verificationStatus,
      canAccessDashboard: accountAccess.canAccessDashboard,
      nextStep: accountAccess.nextStep,
      pendingVerificationRole: accountAccess.pendingVerificationRole,
    },
    accountAccess,
    message: accountAccess.message || undefined,
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
