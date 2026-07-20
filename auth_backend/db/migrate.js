import dotenv from 'dotenv';
import { pool } from './index.js';
import { runSchema, seedDemoUsers } from './seed.js';

dotenv.config();

async function migrate() {
  try {
    await runSchema();
    await seedDemoUsers();
    console.log('Auth database ready with demo accounts.');
  } catch (err) {
    console.error('Auth migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
