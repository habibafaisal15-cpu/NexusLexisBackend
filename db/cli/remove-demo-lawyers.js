import 'dotenv/config';
import { query, pool } from '../index.js';

await query(`
  DELETE FROM messages
  WHERE sender_id IN (SELECT id FROM users WHERE role = 'lawyer')
     OR recipient_id IN (SELECT id FROM users WHERE role = 'lawyer')
`);

const removed = await query(`
  DELETE FROM users
  WHERE role = 'lawyer'
  RETURNING email
`);

const orphaned = await query(`
  DELETE FROM lawyer_profiles
  WHERE user_id NOT IN (SELECT id FROM users)
  RETURNING id, full_name
`);

console.log('Removed lawyer accounts:', removed.rows.map((row) => row.email));
console.log('Removed orphaned profiles:', orphaned.rows);
await pool.end();
