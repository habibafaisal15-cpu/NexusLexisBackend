import { query } from './index.js';
import { isUniqueViolation, uniqueConstraintField } from '../../shared/lib/dbErrors.js';

function runQuery(client, text, params) {
  return client ? client.query(text, params) : query(text, params);
}

export async function findDashboardUserByEmail(email, client = null) {
  const result = await runQuery(
    client,
    `SELECT id, username, email, role, is_active, phone
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );
  return result.rows[0] || null;
}

async function initializeClientWorkspace(userId, displayName, client = null) {
  const existing = await runQuery(
    client,
    `SELECT id FROM notifications WHERE user_id = $1 AND notification_type = 'welcome' LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) return;

  await runQuery(
    client,
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, 'Welcome to NexusLexis', $2, 'welcome', '/account', 'client')`,
    [userId, `Your corporate workspace is ready, ${displayName}. Explore lawyers, document services, and your retainer hub.`]
  );

  await runQuery(
    client,
    `INSERT INTO client_activities (client_id, activity_type, lang_key, params)
     VALUES ($1, 'signup', 'Welcome', $2)`,
    [userId, JSON.stringify({ name: displayName })]
  );
}

async function isUsernameTaken(username, client = null, excludeUserId = null) {
  const result = await runQuery(
    client,
    excludeUserId
      ? 'SELECT id FROM users WHERE username = $1 AND id <> $2 LIMIT 1'
      : 'SELECT id FROM users WHERE username = $1 LIMIT 1',
    excludeUserId ? [username, excludeUserId] : [username]
  );
  return Boolean(result.rows[0]);
}

/** Always returns a username that is not used by another users row. */
export async function allocateUniqueUsername(displayName, email, authUserId, client = null, retryAttempt = 0) {
  const base = (displayName || email.split('@')[0] || 'User').trim();
  const localPart = email.split('@')[0] || 'user';
  const candidates = [
    base,
    `${base} (${localPart})`,
    `${base} (${email})`,
    `${base} (#${authUserId})`,
    `user-${authUserId}`,
  ];

  if (retryAttempt > 0) {
    candidates.unshift(`${base} (${localPart}-${retryAttempt})`);
    candidates.unshift(`${base}-${retryAttempt}`);
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const taken = await isUsernameTaken(candidate, client);
    if (!taken) return candidate;
  }

  return `user-${authUserId}-${Date.now()}-${retryAttempt}`;
}

async function insertDashboardUser(authUser, passwordHash, client = null) {
  const email = authUser.email.toLowerCase().trim();
  const displayName = (authUser.full_name || email.split('@')[0] || 'User').trim();
  const phone = authUser.phone || null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const username = await allocateUniqueUsername(displayName, email, authUser.id, client, attempt);

    try {
      const result = await runQuery(
        client,
        `INSERT INTO users (username, email, password, role, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, role, phone, is_active`,
        [username, email, passwordHash || '', authUser.role, phone]
      );
      return result.rows[0];
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      const field = uniqueConstraintField(err);
      if (field === 'email') {
        const existing = await findDashboardUserByEmail(email, client);
        if (existing) return existing;
      }
      if (field === 'username' && attempt < 7) continue;

      throw new Error('Could not complete signup. Please try again.');
    }
  }

  throw new Error('Could not complete signup. Please try again.');
}

async function syncExistingDashboardUser(dashboardUser, authUser, passwordHash, client = null) {
  if (!dashboardUser.is_active) {
    throw new Error('This account has been deactivated');
  }

  const phone = authUser.phone || null;
  const shouldUpgradeRole = dashboardUser.role === 'client'
    && ['lawyer', 'ca'].includes(authUser.role);

  if (passwordHash) {
    await runQuery(
      client,
      `UPDATE users
       SET password = $1,
           phone = COALESCE($2, phone),
           role = CASE WHEN $4 THEN $5 ELSE role END
       WHERE id = $3`,
      [passwordHash, phone, dashboardUser.id, shouldUpgradeRole, authUser.role]
    );
  } else if (phone || shouldUpgradeRole) {
    await runQuery(
      client,
      `UPDATE users
       SET phone = COALESCE($1, phone),
           role = CASE WHEN $3 THEN $4 ELSE role END
       WHERE id = $2`,
      [phone, dashboardUser.id, shouldUpgradeRole, authUser.role]
    );
  }

  return findDashboardUserByEmail(authUser.email.toLowerCase().trim(), client);
}

export async function syncToDashboardUser(authUser, passwordHash = null, client = null) {
  const email = authUser.email.toLowerCase().trim();
  let dashboardUser = await findDashboardUserByEmail(email, client);

  if (dashboardUser) {
    return syncExistingDashboardUser(dashboardUser, authUser, passwordHash, client);
  }

  dashboardUser = await insertDashboardUser(authUser, passwordHash, client);

  if (authUser.role === 'client') {
    await initializeClientWorkspace(dashboardUser.id, dashboardUser.username, client);
  }

  return dashboardUser;
}
