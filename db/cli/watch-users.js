import 'dotenv/config';
import { pool } from '../index.js';

let lastAuthId = 0;
let lastUserId = 0;

async function bootstrap() {
  const authMax = await pool.query('SELECT COALESCE(MAX(id), 0)::int AS m FROM auth_users');
  const userMax = await pool.query('SELECT COALESCE(MAX(id), 0)::int AS m FROM users');
  lastAuthId = authMax.rows[0].m;
  lastUserId = userMax.rows[0].m;

  console.log('Live user watch — new sign-ups appear here automatically');
  console.log(`Database: ${process.env.DB_NAME || 'nexuslexis'} @ ${process.env.DB_HOST || 'localhost'}`);
  console.log(`Tracking auth_users id > ${lastAuthId}, users id > ${lastUserId}`);
  console.log('Press Ctrl+C to stop.\n');
}

function printAuthUser(row) {
  console.log(
    `[auth_users] + id=${row.id} | ${row.email} | ${row.role} | ${row.auth_provider} | ${row.created_at}`
  );
}

function printDashboardUser(row) {
  console.log(`[users]      + id=${row.id} | ${row.email} | ${row.role} | ${row.username}`);
}

async function pollNewRows() {
  const authRows = await pool.query(
    `SELECT id, full_name, email, role, auth_provider, created_at
     FROM auth_users
     WHERE id > $1
     ORDER BY id`,
    [lastAuthId]
  );

  for (const row of authRows.rows) {
    printAuthUser(row);
    lastAuthId = row.id;
  }

  const userRows = await pool.query(
    `SELECT id, username, email, role
     FROM users
     WHERE id > $1
     ORDER BY id`,
    [lastUserId]
  );

  for (const row of userRows.rows) {
    printDashboardUser(row);
    lastUserId = row.id;
  }
}

async function listenForNotify() {
  const client = await pool.connect();
  client.on('notification', (msg) => {
    if (msg.channel !== 'nexuslexis_new_user') return;
    try {
      const payload = JSON.parse(msg.payload || '{}');
      console.log(`[notify]     New sign-up: ${payload.email || '?'} (${payload.role || '?'}) via ${payload.source || 'app'}`);
    } catch {
      console.log(`[notify]     ${msg.payload}`);
    }
    pollNewRows().catch(console.error);
  });

  await client.query('LISTEN nexuslexis_new_user');
  return client;
}

await bootstrap();
await pollNewRows();

const listener = await listenForNotify();
const interval = setInterval(() => {
  pollNewRows().catch(console.error);
}, 3000);

process.on('SIGINT', async () => {
  clearInterval(interval);
  await listener.query('UNLISTEN nexuslexis_new_user');
  listener.release();
  await pool.end();
  process.exit(0);
});
