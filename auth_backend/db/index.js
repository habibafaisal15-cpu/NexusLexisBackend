import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function buildPoolConfig(maxConnections = 10) {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'nexuslexis',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: Number(process.env.DB_POOL_MAX || maxConnections),
  };

  if (process.env.DB_SSL === 'true' || process.env.DATABASE_URL?.includes('sslmode=require')) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

export const pool = new Pool(buildPoolConfig(process.env.VERCEL ? 1 : 10));

export async function query(text, params) {
  return pool.query(text, params);
}

export async function testConnection() {
  const result = await query('SELECT NOW() AS now');
  return result.rows[0];
}
