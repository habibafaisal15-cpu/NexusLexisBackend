import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

try {
  const table = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'signup_otps'
     ) AS exists`
  );
  console.log('signup_otps table:', table.rows[0].exists);

  if (table.rows[0].exists) {
    const count = await pool.query('SELECT COUNT(*)::int AS c FROM signup_otps');
    console.log('otp rows:', count.rows[0].c);
  } else {
    console.log('Run auth backend once to apply full_schema.sql via seed.js');
  }
} catch (err) {
  console.error('DB error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
