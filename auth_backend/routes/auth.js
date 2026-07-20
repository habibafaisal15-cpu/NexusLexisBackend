import { Router } from 'express';
import {
  registerUser,
  loginUser,
  loginWithGoogleIdToken,
  exchangeGoogleAuthCode,
  getGoogleAuthUrl,
  findUserByEmail,
  ALL_ROLES
} from '../services/authService.js';
import { getProfileForUser, formatProfileResponse } from '../services/profileService.js';
import * as profileRepo from '../db/profileRepository.js';
import { signToken, authMiddleware, buildTokenPayload, buildTokenPayloadFromBundle, toPublicUser } from '../middleware/auth.js';
import { validateEmailForSignup } from '../utils/validation.js';
import { requestSignupOtp, verifySignupOtp } from '../services/otpService.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';

const router = Router();

async function sendAuthSuccess(res, result, status = 200) {
  const authUser = result.authUser || result;
  const dashboardUser = result.dashboardUser || null;
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

  const token = signToken(payload);
  res.status(status).json({
    token,
    user: {
      ...toPublicUser(authUser),
      roles: payload.roles,
      dashboardUserId: userId || payload.userId,
      profile
    }
  });
}

router.post('/register', asyncHandler(async (req, res) => {
  const { fullName, name, email, password, phone, role = 'client', verificationToken } = req.body;
  const user = await registerUser({
    fullName: fullName || name,
    email,
    password,
    phone,
    role,
    verificationToken,
  });
  sendAuthSuccess(res, user, 201);
}));

router.post('/register/send-otp', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await requestSignupOtp(email);
  if (!result.ok) {
    const status = result.code === 'RATE_LIMITED' ? 429 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}));

router.post('/register/verify-otp', asyncHandler(async (req, res) => {
  const { email, code, otp } = req.body;
  const result = await verifySignupOtp(email, code || otp);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
}));

router.post('/register/validate', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const emailCheck = await validateEmailForSignup(email);
  if (!emailCheck.valid) {
    return res.json({
      valid: false,
      available: false,
      code: emailCheck.code,
      error: emailCheck.error,
    });
  }

  const existing = await findUserByEmail(emailCheck.email);
  if (existing) {
    return res.json({
      valid: true,
      available: false,
      code: 'ALREADY_EXISTS',
      error: 'An account with this email already exists.',
    });
  }

  res.json({ valid: true, available: true });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await loginUser({ email, password });
  await sendAuthSuccess(res, user);
}));

router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const user = await findUserByEmail(req.user.email);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  const userId = Number(req.user.userId || req.user.sub);
  const profile = userId ? await getProfileForUser(userId, req.user.email) : null;
  const bundle = userId ? await profileRepo.getFullProfileBundle(userId) : null;
  const payload = bundle
    ? buildTokenPayloadFromBundle(user, bundle)
    : buildTokenPayload(user);

  res.json({
    user: {
      ...toPublicUser(user),
      roles: payload.roles,
      dashboardUserId: userId || payload.userId,
      phone: profile?.phone || user.phone || '',
      profile
    }
  });
}));

router.get('/roles', (_req, res) => {
  res.json({
    registerRoles: ['client', 'lawyer', 'ca'],
    allRoles: ALL_ROLES
  });
});

router.get('/google/url', asyncHandler(async (req, res) => {
  const url = getGoogleAuthUrl(req.query.state || 'login');
  res.json({ url });
}));

router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing Google authorization code' });
  }

  const result = await exchangeGoogleAuthCode(String(code), 'client');
  const payload = buildTokenPayload(result.authUser, result.dashboardUser);
  const token = signToken(payload);
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5175';
  const redirectUrl = new URL('/login', frontend);
  redirectUrl.searchParams.set('token', token);
  redirectUrl.searchParams.set('state', String(state || 'login'));
  res.redirect(redirectUrl.toString());
}));

router.post('/google/token', asyncHandler(async (req, res) => {
  const { idToken, credential, role = 'client' } = req.body;
  const tokenValue = idToken || credential;

  if (!tokenValue) {
    return res.status(400).json({ error: 'Google ID token is required' });
  }

  const user = await loginWithGoogleIdToken(tokenValue, role);
  sendAuthSuccess(res, user);
}));

router.use((err, _req, res, _next) => {
  const message = err.message || 'Authentication request failed';
  const status = message.includes('not configured') ? 503 : 400;
  res.status(status).json({ error: message });
});

export default router;
