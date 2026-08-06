import { pool, query } from './index.js';

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
export async function allocateUniqueUsername(displayName, email, authUserId, client = null) {
  const base = (displayName || email.split('@')[0] || 'User').trim();
  const localPart = email.split('@')[0] || 'user';
  const candidates = [
    base,
    `${base} (${localPart})`,
    `${base} (${email})`,
    `${base} (#${authUserId})`,
    `user-${authUserId}`,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const taken = await isUsernameTaken(candidate, client);
    if (!taken) return candidate;
  }

  return `user-${authUserId}-${Date.now()}`;
}

export async function syncToDashboardUser(authUser, passwordHash = null, client = null) {
  const email = authUser.email.toLowerCase().trim();
  const displayName = (authUser.full_name || email.split('@')[0] || 'User').trim();
  const phone = authUser.phone || null;
  let dashboardUser = await findDashboardUserByEmail(email, client);

  if (dashboardUser) {
    if (!dashboardUser.is_active) {
      throw new Error('This account has been deactivated');
    }

    if (passwordHash) {
      await runQuery(
        client,
        'UPDATE users SET password = $1, phone = COALESCE($2, phone) WHERE id = $3',
        [passwordHash, phone, dashboardUser.id]
      );
    } else if (phone) {
      await runQuery(
        client,
        'UPDATE users SET phone = $1 WHERE id = $2',
        [phone, dashboardUser.id]
      );
    }

    dashboardUser = await findDashboardUserByEmail(email, client);
    return dashboardUser;
  }

  const username = await allocateUniqueUsername(displayName, email, authUser.id, client);

  const result = await runQuery(
    client,
    `INSERT INTO users (username, email, password, role, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, role, phone, is_active`,
    [username, email, passwordHash || '', authUser.role, phone]
  );

  dashboardUser = result.rows[0];

  if (authUser.role === 'client') {
    await initializeClientWorkspace(dashboardUser.id, dashboardUser.username, client);
  }

  return dashboardUser;
}
