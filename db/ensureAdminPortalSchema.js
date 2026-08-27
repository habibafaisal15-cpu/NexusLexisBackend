import { query } from './index.js';

let readyPromise = null;

export async function ensureAdminPortalSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS knowledge_articles (
        id BIGSERIAL PRIMARY KEY,
        slug VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(500) NOT NULL,
        pillar VARCHAR(40) NOT NULL
          CHECK (pillar IN ('legal_articles', 'law_summaries', 'free_templates', 'legal_calculators')),
        summary TEXT,
        body TEXT NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'published', 'retired')),
        seo_title VARCHAR(500),
        seo_description TEXT,
        keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
        related_service_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
        cover_image VARCHAR(500),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_knowledge_articles_pillar ON knowledge_articles (pillar, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status ON knowledge_articles (status, published_at DESC)`);

    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`);
    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMPTZ`);
    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS drafting_room VARCHAR(40) DEFAULT 'drafting_desk'`);
    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS remittance_status VARCHAR(30) DEFAULT 'not_applicable'`);
    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ`);
    await query(`ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS settlement_note TEXT`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMPTZ`);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
