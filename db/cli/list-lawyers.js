import 'dotenv/config';
import { query, pool } from '../index.js';

const rows = await query(`
  SELECT lp.id, lp.full_name, lp.city, u.email, u.role
  FROM lawyer_profiles lp
  LEFT JOIN users u ON u.id = lp.user_id
  ORDER BY lp.id
`);

console.log(JSON.stringify(rows.rows, null, 2));
await pool.end();
