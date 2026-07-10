import dotenv from 'dotenv';
import { pool } from './index.js';
import { runSchema } from './schema.js';
import { seedDatabase } from './seed.js';

dotenv.config();

async function migrate() {
  try {
    console.log('Applying schema...');
    await runSchema();
    console.log('Seeding database...');
    await seedDatabase();
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
