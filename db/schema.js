import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './index.js';
import { ensureLibrarySchema } from './ensureLibrarySchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runSchema() {
  const schema = readFileSync(join(__dirname, 'full_schema.sql'), 'utf-8');
  await pool.query(schema);

  // One-time data backfills for notification audience (safe to re-run)
  await pool.query(`UPDATE notifications SET audience = 'client' WHERE audience IS NULL`);
  await pool.query(`
    UPDATE notifications SET audience = 'lawyer'
    WHERE audience = 'client'
      AND (
        link LIKE '/account/appointments%'
        OR link LIKE '/account/lawyer/%'
        OR title ILIKE '%consultation request%'
        OR title ILIKE '%new client message%'
        OR title ILIKE '%new vlo matter%'
        OR title ILIKE '%new client review%'
        OR title ILIKE '%new enquiry%'
      )
  `);
  await pool.query(`
    UPDATE notifications SET audience = 'ca'
    WHERE audience = 'client'
      AND (
        link LIKE '/account/compliance%'
        OR title ILIKE '%compliance reminder%'
      )
  `);

  await ensureLibrarySchema();
}
