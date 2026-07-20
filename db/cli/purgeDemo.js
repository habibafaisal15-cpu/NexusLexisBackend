import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool, testConnection } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_FILE = join(__dirname, '..', '..', 'data', 'professional-store.json');

export async function purgeDemoData() {
  const sql = readFileSync(join(__dirname, '..', 'manual', 'purge_demo_data.sql'), 'utf-8');
  await pool.query(sql);
  writeFileSync(
    STORE_FILE,
    JSON.stringify(
      { lawyerCases: {}, lawyerTeams: {}, caTaxProfiles: {}, caDocuments: {}, caRetainers: {} },
      null,
      2
    )
  );
  console.log('Demo data purged.');
}

if (process.argv[1]?.includes('purgeDemo')) {
  await testConnection();
  await purgeDemoData();
  await pool.end();
}
