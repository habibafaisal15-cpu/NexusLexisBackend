import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'nexuslexis-dev-secret-key';

const ROLE_EMAIL_MAP = {
  CorporateClient: 'client@nexuslexis.law',
  LegalAdvocate: 'lawyer@nexuslexis.law',
  CharteredAccountant: 'ca@nexuslexis.law',
  Admin: 'admin@nexuslexis.law'
};

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function buildUserPayload(user) {
  const roleMap = {
    client: 'CorporateClient',
    lawyer: 'LegalAdvocate',
    ca: 'CharteredAccountant',
    admin: 'Admin'
  };
  return {
    userId: user.id,
    sub: String(user.id),
    email: user.email,
    name: user.username,
    role: user.role,
    roles: [roleMap[user.role] || user.role]
  };
}

async function resolveUserByRoleHeader(roleHeader) {
  const email = ROLE_EMAIL_MAP[roleHeader];
  if (!email) return null;

  const result = await query(
    'SELECT id, username, email, role FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
    [email]
  );
  return result.rows[0] || null;
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.workspace = req.headers['x-workspace-context'] || 'HabibCorp';
    return next();
  } catch {
    // Support mainsite mock tokens (localStorage auth) via X-Client-Role header
    if (token.startsWith('mock-jwt-token-')) {
      const roleHeader = req.headers['x-client-role'];
      const user = await resolveUserByRoleHeader(roleHeader);
      if (user) {
        req.user = buildUserPayload(user);
        req.workspace = req.headers['x-workspace-context'] || 'HabibCorp';
        req.mockAuth = true;
        return next();
      }
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function getUserId(req) {
  return Number(req.user?.userId || req.user?.sub);
}

export function adminMiddleware(req, res, next) {
  const role = req.user?.role || req.user?.activeRole;
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

/** Attach user if Bearer token is valid; never reject (for owned flags on public catalogs). */
export function optionalAuthMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    req.user = decoded;
  } catch {
    // ignore invalid token for optional auth
  }
  return next();
}
