import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import { pool, query } from './index.js';
import { syncToDashboardUser } from './userSync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveSchemaSql() {
  const monorepoSchema = join(__dirname, '..', '..', 'db', 'full_schema.sql');
  if (existsSync(monorepoSchema)) {
    return readFileSync(monorepoSchema, 'utf-8');
  }

  const authSchema = join(__dirname, 'schema.sql');
  const otpSchema = join(__dirname, 'otpSchema.sql');
  const profileSchema = join(__dirname, 'profileSchema.sql');
  return [authSchema, otpSchema, profileSchema]
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf-8'))
    .join('\n');
}

export async function runSchema() {
  await pool.query(resolveSchemaSql());
}

const DEMO_USERS = [
  { fullName: 'Demo Client', email: 'client@nexuslexis.law', password: 'password123', role: 'client' },
  { fullName: 'Demo Lawyer', email: 'lawyer@nexuslexis.law', password: 'password123', role: 'lawyer' },
  { fullName: 'Demo CA', email: 'ca@nexuslexis.law', password: 'password123', role: 'ca' },
  { fullName: 'Demo Admin', email: 'admin@nexuslexis.law', password: 'admin123', role: 'admin' }
];

export async function seedDemoUsers() {
  const forceSeed = process.env.SEED_DEMO === 'true';
  const autoSeedDev = process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== 'false';

  if (!forceSeed && !autoSeedDev) {
    return;
  }

  if (autoSeedDev && !forceSeed) {
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM auth_users');
    if (rows[0].c > 0) {
      console.log('[seed] auth_users already has accounts; skipping demo seed (set SEED_DEMO=true to force)');
      return;
    }
    console.log('[seed] auth_users is empty — creating demo accounts for local dev');
  }

  for (const user of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    let authUser = await query(
      `SELECT id, full_name, email, password_hash, role, auth_provider, is_active
       FROM auth_users WHERE LOWER(email) = LOWER($1)`,
      [user.email]
    ).then((res) => res.rows[0] || null);

    if (!authUser) {
      const created = await query(
        `INSERT INTO auth_users (full_name, email, password_hash, role, auth_provider)
         VALUES ($1, $2, $3, $4, 'local')
         RETURNING id, full_name, email, password_hash, role, auth_provider, is_active`,
        [user.fullName, user.email.toLowerCase(), passwordHash, user.role]
      );
      authUser = created.rows[0];
    }

    await syncToDashboardUser(authUser, passwordHash);
  }
}
