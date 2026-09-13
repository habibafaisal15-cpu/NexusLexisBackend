import { query } from './index.js';
import { getDefaultCalculatorSchedules } from './calculatorSeed.js';

let readyPromise = null;

export async function ensureCalculatorSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS knowledge_calculators (
        id VARCHAR(40) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'live'
          CHECK (status IN ('live', 'draft')),
        hint TEXT,
        note TEXT,
        resource JSONB,
        groups JSONB NOT NULL DEFAULT '[]'::jsonb,
        resource_file_name VARCHAR(255),
        resource_mime_type VARCHAR(100),
        resource_content_base64 TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_calc_status ON knowledge_calculators (status)`);

    const count = await query(`SELECT COUNT(*)::int AS n FROM knowledge_calculators`);
    if ((count.rows[0]?.n || 0) === 0) {
      const seeds = getDefaultCalculatorSchedules();
      for (const s of seeds) {
        await query(
          `INSERT INTO knowledge_calculators (
             id, title, subtitle, status, hint, note, resource, groups, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.title,
            s.subtitle || null,
            s.status || 'live',
            s.hint || null,
            s.note || null,
            JSON.stringify(s.resource ?? null),
            JSON.stringify(s.groups || []),
          ]
        );
      }
      console.log(`[kb-calc] Seeded ${seeds.length} calculator schedules`);
    }
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
