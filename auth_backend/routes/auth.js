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
import { getAccountAccessMeta } from '../services/accountAccess.js';
import { findDashboardUserByEmail, syncToDashboardUser } from '../db/userSync.js';
import {
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
} from '../services/passwordResetService.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';
import { isUniqueViolation, friendlyUniqueViolationMessage } from '../../shared/lib/dbErrors.js';

const router = Router();

const DEFAULT_PRODUCTION_FRONTENDS = [
  'https://nexuslexis.netlify.app',
  'https://nexuslexis.law',
  'https://www.nexuslexis.law',
];

function allowedFrontendOrigins() {
  const fromEnv = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_PRODUCTION_FRONTENDS, ...fromEnv]);
}

function normalizeFrontendOrigin(raw) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseGoogleRoleFromState(state) {
  const raw = String(state || '').trim();
  if (!raw) return 'client';

  if (raw.startsWith('signup:')) {
    const role = raw.split(':')[1]?.toLowerCase();
    if (['client', 'lawyer', 'ca'].includes(role)) return role;
  }

  try {
    const parsed = JSON.parse(raw);
    const role = String(parsed?.role || parsed?.defaultRole || '').toLowerCase();
    if (['client', 'lawyer', 'ca'].includes(role)) return role;
  } catch {
    // state is not JSON — fall through
  }

  return 'client';
}

/** Prefer FE origin from state/query so nexuslexis.law is not forced to Netlify. */
function resolveGoogleFrontendRedirect(req, state) {
  const allowed = allowedFrontendOrigins();
  const candidates = [];

  const rawState = String(state || '').trim();
  try {
    const parsed = JSON.parse(rawState);
    candidates.push(parsed?.returnTo, parsed?.frontend, parsed?.origin);
  } catch {
    // ignore
  }

  if (rawState.includes('|')) {
    // e.g. signup:client|https://nexuslexis.law
    const maybeUrl = rawState.split('|')[1];
    candidates.push(maybeUrl);
  }

  candidates.push(req.query?.returnTo, req.query?.frontend, req.get('referer'));

  for (const candidate of candidates) {
    const origin = normalizeFrontendOrigin(candidate);
    if (origin && allowed.has(origin)) return origin;
  }

  if (process.env.NODE_ENV === 'production') {
    return process.env.FRONTEND_URL?.trim().replace(/\/$/, '') || DEFAULT_PRODUCTION_FRONTENDS[0];
  }
  return (process.env.FRONTEND_URL || 'http://localhost:5175').trim().replace(/\/$/, '');
}

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

  // Prefer dashboard users.id (email sync) over JWT claim — avoids auth_users.id mismatch
  let dashboardUser = await findDashboardUserByEmail(user.email);
  if (!dashboardUser) {
    dashboardUser = await syncToDashboardUser(user, user.password_hash);
  }
  const userId = dashboardUser?.id || Number(req.user.userId || req.user.sub);
  const profile = userId ? await getProfileForUser(userId, req.user.email) : null;
  const bundle = userId ? await profileRepo.getFullProfileBundle(userId) : null;
  const payload = bundle
    ? buildTokenPayloadFromBundle(user, bundle)
    : buildTokenPayload(user, dashboardUser);
  const accountAccess = await getAccountAccessMeta(user, dashboardUser);

  res.json({
    user: {
      ...toPublicUser(user),
      roles: payload.roles,
      dashboardUserId: userId || payload.userId,
      phone: profile?.phone || user.phone || '',
      profile,
      verificationStatus: accountAccess.verificationStatus,
      canAccessDashboard: accountAccess.canAccessDashboard,
      nextStep: accountAccess.nextStep,
      pendingVerificationRole: accountAccess.pendingVerificationRole,
      canReapply: Boolean(accountAccess.canReapply),
      canApplyAsLawyer: Boolean(accountAccess.canApplyAsLawyer),
      canApplyAsCA: Boolean(accountAccess.canApplyAsCA),
      message: accountAccess.message || null,
    },
    accountAccess,
    message: accountAccess.message || undefined,
  });
}));

router.get('/config', (_req, res) => {
  const authApi = process.env.AUTH_PUBLIC_URL || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth';
  res.json({
    signupOtpRequired: !isSignupOtpSkipped(),
    passwordResetOtpRequired: !isPasswordResetOtpSkipped(),
    registerRoles: ['client', 'lawyer', 'ca'],
    authMethods: ['email', 'google'],
    googleAuth: {
      // Hostinger: use full-page redirect (no GIS popup / no CORS XHR)
      recommendedMode: 'redirect',
      startPath: '/google/start',
      startUrlExample: `${authApi}/google/start?role=client&returnTo=${encodeURIComponent('https://nexuslexis.law')}`,
      landingPath: googleFrontendLandingPath(),
      warmupPath: '/ping',
      note: 'FE must upload docs/hostinger/google-auth.html + .htaccess to Hostinger public_html',
    },
    productionUrls: {
      authApi,
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

/** Ultra-light ping for FE warm-up (no DB). */
router.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'auth', time: new Date().toISOString() });
});

/**
 * Full-page Google start (no XHR / no CORS).
 * FE should use: window.location.href = `${AUTH}/google/start?role=client&returnTo=${origin}`
 * Fixes browser FETCH_ERROR on popup + POST /google/token.
 */
router.get('/google/start', asyncHandler(async (req, res) => {
  const roleRaw = String(req.query.role || 'client').toLowerCase();
  const role = ['client', 'lawyer', 'ca'].includes(roleRaw) ? roleRaw : 'client';
  const allowed = allowedFrontendOrigins();
  const fromQuery = normalizeFrontendOrigin(req.query.returnTo);
  const fromReferer = normalizeFrontendOrigin(req.get('referer'));
  const returnTo = (fromQuery && allowed.has(fromQuery))
    ? fromQuery
    : (fromReferer && allowed.has(fromReferer))
      ? fromReferer
      : 'https://nexuslexis.law';

  const state = JSON.stringify({ role, returnTo });
  const url = getGoogleAuthUrl(state);
  res.redirect(url);
}));

router.get('/google/url', asyncHandler(async (req, res) => {
  const url = getGoogleAuthUrl(req.query.state || 'login');
  res.json({ url });
}));

/**
 * Hostinger has no SPA rewrite by default, so /login 404s.
 * Land on static /google-auth.html (uploaded to public_html) which writes
 * sessionStorage keys then sends the user into the React app.
 */
function googleFrontendLandingPath() {
  return process.env.GOOGLE_FE_LANDING_PATH?.trim() || '/google-auth.html';
}

function buildGoogleFrontendRedirect(frontend, { token, refreshToken, googleError, state, next } = {}) {
  const redirectUrl = new URL(googleFrontendLandingPath(), frontend);
  if (googleError) redirectUrl.searchParams.set('googleError', String(googleError));
  if (token) redirectUrl.searchParams.set('token', token);
  if (refreshToken) redirectUrl.searchParams.set('refreshToken', refreshToken);
  if (state) redirectUrl.searchParams.set('state', String(state));
  if (next) redirectUrl.searchParams.set('next', String(next));
  return redirectUrl.toString();
}

/** Downloadable Hostinger landing page (same bytes FE must put in public_html). */
const GOOGLE_AUTH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing you in… — NexusLexis</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Georgia,"Times New Roman",serif;background:#0f1c2e;color:#f4efe6}
    .card{max-width:28rem;padding:2rem;text-align:center;line-height:1.45}
    .err{color:#ffb4a8} a{color:#d4b483}
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title">Signing you in…</h1>
    <p id="msg">Please wait while we finish Google sign-in.</p>
    <p id="extra" hidden></p>
  </div>
  <script>
    (function () {
      var TOKEN_KEY = 'accessToken';
      var TOKEN_ALIAS = 'token';
      var REFRESH_KEY = 'refreshToken';
      var USER_KEY = 'user';
      var params = new URLSearchParams(window.location.search);
      var err = params.get('googleError');
      var token = params.get('token') || params.get('accessToken');
      var refresh = params.get('refreshToken');
      var next = params.get('next') || '/';
      var title = document.getElementById('title');
      var msg = document.getElementById('msg');
      var extra = document.getElementById('extra');
      if (err) {
        title.textContent = 'Google sign-in failed';
        title.className = 'err';
        msg.textContent = err;
        extra.hidden = false;
        extra.innerHTML = '<a href="/login">Back to login</a> · <a href="/signup">Sign up</a>';
        return;
      }
      if (!token) {
        title.textContent = 'Missing sign-in token';
        title.className = 'err';
        msg.textContent = 'No token returned from Google. Please try again.';
        extra.hidden = false;
        extra.innerHTML = '<a href="/signup">Try again</a>';
        return;
      }
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_ALIAS, token);
        if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
        sessionStorage.removeItem(USER_KEY);
      } catch (e) {
        title.textContent = 'Could not save session';
        title.className = 'err';
        msg.textContent = String(e && e.message || e);
        return;
      }
      var clean = next.charAt(0) === '/' ? next : '/';
      window.location.replace(clean);
    })();
  </script>
</body>
</html>`;

router.get('/google/hostinger/google-auth.html', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="google-auth.html"');
  res.send(GOOGLE_AUTH_HTML);
});

router.get('/google/hostinger/.htaccess', (_req, res) => {
  const body = `# NexusLexis Hostinger SPA fallback — upload as public_html/.htaccess
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule ^ index.html [L]
</IfModule>
Options -Indexes
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=".htaccess"');
  res.send(body);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const { code, state, error: oauthError, error_description: oauthErrorDescription } = req.query;
  const frontend = resolveGoogleFrontendRedirect(req, state);
  const redirectWithError = (message) =>
    res.redirect(buildGoogleFrontendRedirect(frontend, {
      googleError: message,
      state: state || 'login',
      next: '/login',
    }));

  if (oauthError) {
    return redirectWithError(String(oauthErrorDescription || oauthError));
  }
  if (!code) {
    return redirectWithError('Missing Google authorization code');
  }

  try {
    const roleFromState = parseGoogleRoleFromState(state);
    const result = await exchangeGoogleAuthCode(String(code), roleFromState);
    const session = await buildAuthSession(result.authUser, result.dashboardUser);
    return res.redirect(buildGoogleFrontendRedirect(frontend, {
      token: session.accessToken,
      refreshToken: session.refreshToken,
      state: state || 'login',
      next: '/',
    }));
  } catch (err) {
    console.error('[google/callback]', err.message);
    return redirectWithError(err.message || 'Google sign-in failed');
  }
}));

router.post('/google/token', asyncHandler(async (req, res) => {
  const { idToken, credential, role = 'client' } = req.body;
  const tokenValue = idToken || credential;

  if (!tokenValue) {
    return res.status(400).json({ error: 'Google ID token is required' });
  }

  // Warm Neon before verify+upsert so Hostinger GIS clients avoid long cold hangs.
  try {
    const { testConnection } = await import('../db/index.js');
    await testConnection();
  } catch {
    // continue — loginWithGoogleIdToken will surface DB errors
  }

  const user = await loginWithGoogleIdToken(tokenValue, role);
  await sendAuthSuccess(res, user);
}));

router.use((err, _req, res, _next) => {
  if (isUniqueViolation(err)) {
    return res.status(409).json({ error: friendlyUniqueViolationMessage(err) });
  }

  const raw = err.message || 'Authentication request failed';
  const isDbTimeout = /timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|connection terminated/i.test(raw);
  if (isDbTimeout) {
    return res.status(503).json({
      error: 'Server is warming up. Please try again in a moment.',
      code: 'DB_CONNECT_TIMEOUT',
    });
  }

  const status = raw.includes('not configured') ? 503 : 400;
  res.status(status).json({ error: raw });
});

export default router;
