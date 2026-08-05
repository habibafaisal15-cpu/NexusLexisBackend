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

export async function syncToDashboardUser(authUser, passwordHash = null, client = null) {
  const email = authUser.email.toLowerCase().trim();
  const displayName = authUser.full_name.trim();
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
    } else {
      await runQuery(
        client,
        'UPDATE users SET username = $1, phone = $2 WHERE id = $3',
        [displayName, phone, dashboardUser.id]
      );
    }

    dashboardUser = await findDashboardUserByEmail(email, client);
    return dashboardUser;
  }

  const usernameCheck = await runQuery(client, 'SELECT id FROM users WHERE username = $1', [displayName]);
  let username = displayName;
  if (usernameCheck.rows[0]) {
    username = `${displayName} (${email.split('@')[0]})`;
    const again = await runQuery(client, 'SELECT id FROM users WHERE username = $1', [username]);
    if (again.rows[0]) {
      username = `${displayName} (${email})`;
    }
  }

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

  // Lawyer/CA professional profiles are created when the user submits the application form,
  // not at signup (avoids duplicate placeholder CNIC constraint errors).

  return dashboardUser;
}
