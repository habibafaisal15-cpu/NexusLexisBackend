import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from '../index.js';

const clientEmail = process.env.DEMO_CLIENT_EMAIL || 'habibcorp@nexuslexis.law';
const password = 'Client@123';

const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [clientEmail]);
if (existing.rows[0]) {
  console.log('Demo client already exists:', clientEmail);
  await pool.end();
  process.exit(0);
}

const hash = await bcrypt.hash(password, 10);
const client = await query(
  `INSERT INTO users (username, email, password, role)
   VALUES ('Habib Corporate Solutions Ltd', $1, $2, 'client')
   RETURNING id, email`,
  [clientEmail, hash]
);

console.log('Restored demo client:', client.rows[0]);
await pool.end();
