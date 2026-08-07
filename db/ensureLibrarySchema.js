import { query } from './index.js';
import { seedLibraryCatalog } from './librarySeed.js';

let readyPromise = null;

async function addColumn(sql) {
  await query(sql);
}

/** Ensure library/catalog columns exist on Neon (Vercel never ran local initDatabase). */
export async function ensureLibrarySchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
    await addColumn(`ALTER TABLE services ADD COLUMN IF NOT EXISTS access_type VARCHAR(20) DEFAULT 'paid'`);
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS template_file_name VARCHAR(255)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS template_mime_type VARCHAR(100)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS template_content_base64 TEXT');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS code VARCHAR(50)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS block VARCHAR(100)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS language VARCHAR(50)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS author VARCHAR(255)');
    await addColumn('ALTER TABLE services ADD COLUMN IF NOT EXISTS version VARCHAR(50)');

    await query(`UPDATE services SET is_active = TRUE WHERE is_active IS NULL`);
    await query(`UPDATE services SET access_type = 'paid' WHERE access_type IS NULL OR access_type = ''`);
    await query(`UPDATE services SET language = 'English' WHERE language IS NULL OR language = ''`);
    await query(`UPDATE services SET version = '1.0' WHERE version IS NULL OR version = ''`);
    await query(`
      UPDATE services SET access_type = 'public'
      WHERE slug LIKE 'kb-%' AND access_type IS DISTINCT FROM 'public'
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active)');
    await query('CREATE INDEX IF NOT EXISTS idx_services_access_type ON services (access_type)');
    await query('CREATE INDEX IF NOT EXISTS idx_services_block ON services (block)');
    await query('CREATE INDEX IF NOT EXISTS idx_services_language ON services (language)');

    await seedLibraryCatalog();
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
