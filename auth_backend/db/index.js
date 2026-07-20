import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'nexuslexis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 10
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function testConnection() {
  const result = await query('SELECT NOW() AS now');
  return result.rows[0];
}
