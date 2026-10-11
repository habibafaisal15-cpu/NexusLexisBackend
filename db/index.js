import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

function buildPoolConfig(maxConnections = 20) {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'nexuslexis',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_POOL_MAX || maxConnections),
    idleTimeoutMillis: process.env.VERCEL ? Number(process.env.DB_IDLE_TIMEOUT_MS || 5000) : 30000,
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || (process.env.VERCEL ? 20000 : 10000)),
    allowExitOnIdle: Boolean(process.env.VERCEL),
  };

  if (process.env.DB_SSL === 'true' || process.env.DATABASE_URL?.includes('sslmode=require')) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

export const pool = new Pool(buildPoolConfig(process.env.VERCEL ? 1 : 20));

function isTransientDbError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return (
    msg.includes('timeout exceeded when trying to connect')
    || msg.includes('connection terminated')
    || msg.includes('cannot connect')
    || err?.code === 'ETIMEDOUT'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ECONNREFUSED'
  );
}

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!process.env.VERCEL || !isTransientDbError(err)) throw err;
    await new Promise((r) => setTimeout(r, 250));
    return pool.query(text, params);
  }
}

export async function testConnection() {
  const result = await query('SELECT NOW() AS now');
  return result.rows[0];
}
