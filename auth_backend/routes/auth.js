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
import { getProfileForUser } from '../services/profileService.js';
import * as profileRepo from '../db/profileRepository.js';
import { authMiddleware, buildTokenPayload, buildTokenPayloadFromBundle, toPublicUser } from '../middleware/auth.js';
import { validateEmailForSignup } from '../utils/validation.js';
import { requestSignupOtp, verifySignupOtp, isSignupOtpSkipped, isPasswordResetOtpSkipped } from '../services/otpService.js';
import { buildAuthSession, refreshAuthSession, logoutRefreshToken } from '../services/tokenService.js';
import {
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
} from '../services/passwordResetService.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';

const router = Router();

async function sendAuthSuccess(res, result, status = 200) {
  const authUser = result.authUser || result;
  const dashboardUser = result.dashboardUser || null;
  const session = await buildAuthSession(authUser, dashboardUser);
  res.status(status).json(session);
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
  await sendAuthSuccess(res, user, 201);
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

router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.body.refresh_token;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const session = await refreshAuthSession(refreshToken);
    res.json(session);
  } catch (err) {
    res.status(401).json({ error: err.message || 'Invalid refresh token' });
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.body.refresh_token;
  try {
    const result = await logoutRefreshToken(refreshToken);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Logout failed' });
  }
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await requestPasswordReset(email);
  if (!result.ok) {
    const status = result.code === 'RATE_LIMITED' ? 429 : 400;
    return res.status(status).json(result);
  }
  res.json(result);
}));

router.post('/forgot-password/verify-otp', asyncHandler(async (req, res) => {
  const { email, code, otp } = req.body;
  const result = await verifyPasswordResetOtp(email, code || otp);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, resetToken, password, newPassword } = req.body;
  const result = await resetPasswordWithToken({
    email,
    resetToken,
    password: newPassword || password,
  });
  res.json(result);
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

router.get('/config', (_req, res) => {
  res.json({
    signupOtpRequired: !isSignupOtpSkipped(),
    passwordResetOtpRequired: !isPasswordResetOtpSkipped(),
    registerRoles: ['client', 'lawyer', 'ca'],
    authMethods: ['email', 'google'],
    productionUrls: {
      authApi: process.env.AUTH_PUBLIC_URL || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth',
      mainApi: process.env.MAIN_PUBLIC_URL || 'https://nexus-lexis-backend-ql8w.vercel.app/api/v2',
      lexApi: process.env.LEX_PUBLIC_URL || 'https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex',
    },
    verificationDocuments: {
      upload: 'POST /api/auth/profile/documents/upload',
      view: 'GET /api/auth/documents/:documentId',
      maxSizeMb: 3,
      allowedDocTypes: {
        lawyer: ['profilePhoto', 'barCertificate', 'cnicFront', 'cnicBack'],
        ca: ['photo', 'caCertificate', 'cnicFront', 'cnicBack'],
      },
    },
  });
});

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
  const session = await buildAuthSession(result.authUser, result.dashboardUser);
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5175').trim();
  const redirectUrl = new URL('/login', frontend);
  redirectUrl.searchParams.set('token', session.accessToken);
  redirectUrl.searchParams.set('refreshToken', session.refreshToken);
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
  await sendAuthSuccess(res, user);
}));

router.use((err, _req, res, _next) => {
  const message = err.message || 'Authentication request failed';
  const status = message.includes('not configured') ? 503 : 400;
  res.status(status).json({ error: message });
});

export default router;
