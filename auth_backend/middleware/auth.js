import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nexuslexis-dev-secret-key';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '24h';

const ROLE_LABELS = {
  client: 'CorporateClient',
  lawyer: 'LegalAdvocate',
  ca: 'CharteredAccountant',
  admin: 'Admin',
};

export function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
}

export function signToken(payload) {
  return signAccessToken(payload);
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminMiddleware(req, res, next) {
  const role = req.user?.role || req.user?.activeRole;
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function buildTokenPayload(authUser, dashboardUser = null) {
  const role = dashboardUser?.active_role || dashboardUser?.role || authUser.role;
  const userId = dashboardUser?.id || authUser.id;

  return {
    userId,
    sub: String(userId),
    name: dashboardUser?.username || authUser.full_name,
    email: authUser.email,
    role,
    activeRole: role,
    roles: [ROLE_LABELS[role]].filter(Boolean),
    authProvider: authUser.auth_provider,
  };
}

export function buildTokenPayloadFromBundle(authUser, bundle) {
  const { user, availableRoles, activeRoleKey } = bundle;
  const activeRole = activeRoleKey || user.active_role || user.role || 'client';

  return {
    userId: user.id,
    sub: String(user.id),
    name: user.username,
    email: authUser.email,
    role: activeRole,
    activeRole,
    roles: (availableRoles || [activeRole]).map((r) => ROLE_LABELS[r]).filter(Boolean),
    authProvider: authUser.auth_provider,
  };
}

export function toPublicUser(user) {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    authProvider: user.auth_provider,
  };
}
