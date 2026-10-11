import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function shouldUseSsl() {
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.DATABASE_URL?.includes('sslmode=require')) return true;
  const host = String(process.env.DB_HOST || '');
  return host.includes('neon.tech') || Boolean(process.env.VERCEL);
}

function buildPoolConfig(maxConnections = 10) {
  // Prefer DATABASE_URL when present (Neon dashboard copy-paste).
  if (process.env.DATABASE_URL?.trim()) {
    const config = {
      connectionString: process.env.DATABASE_URL.trim(),
      max: Number(process.env.DB_POOL_MAX || maxConnections),
    };
    if (shouldUseSsl()) {
      config.ssl = { rejectUnauthorized: false };
    }
    if (process.env.VERCEL) {
      config.connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS || 30000);
      config.idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS || 5000);
      config.allowExitOnIdle = true;
    }
    return config;
  }

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'nexuslexis',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_POOL_MAX || maxConnections),
  };

  if (shouldUseSsl()) {
    config.ssl = { rejectUnauthorized: false };
  }

  if (process.env.VERCEL) {
    config.connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT_MS || 30000);
    config.idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS || 5000);
    config.allowExitOnIdle = true;
  }

  return config;
}

export const pool = new Pool(buildPoolConfig(process.env.VERCEL ? 1 : 10));

export function isTransientDbError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('timeout exceeded when trying to connect')
    || msg.includes('connection terminated')
    || msg.includes('cannot connect')
    || msg.includes('server closed the connection')
    || err?.code === 'ETIMEDOUT'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ECONNREFUSED'
    || err?.code === '57P01'
  );
}

async function withDbRetry(operation, { attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (!process.env.VERCEL || !isTransientDbError(err) || i === attempts - 1) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function query(text, params) {
  return withDbRetry(() => pool.query(text, params));
}

/** Use instead of pool.connect() so Neon cold starts get retries. */
export async function getClient() {
  return withDbRetry(() => pool.connect());
}

export async function testConnection() {
  const result = await query('SELECT NOW() AS now');
  return result.rows[0];
}
