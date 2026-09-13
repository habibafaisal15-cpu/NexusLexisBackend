import { query } from './index.js';

let readyPromise = null;

export async function ensureKnowledgeReadsSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS knowledge_reads (
        id BIGSERIAL PRIMARY KEY,
        pillar VARCHAR(20) NOT NULL
          CHECK (pillar IN ('articles', 'summaries', 'judgements')),
        slug VARCHAR(72) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('published', 'draft', 'retired')),
        title VARCHAR(140) NOT NULL,
        excerpt VARCHAR(400),
        category VARCHAR(120),
        keyword VARCHAR(255),
        meta_title VARCHAR(255),
        meta_desc TEXT,
        schema_flag BOOLEAN NOT NULL DEFAULT FALSE,
        related JSONB NOT NULL DEFAULT '[]'::jsonb,
        display_order INT NOT NULL DEFAULT 0,
        -- articles
        placement VARCHAR(20)
          CHECK (placement IS NULL OR placement IN ('featured', 'stack', 'mini')),
        kicker VARCHAR(120),
        band VARCHAR(20)
          CHECK (band IS NULL OR band IN ('seal', 'gold', 'navy')),
        author VARCHAR(255),
        credit VARCHAR(255),
        read_mins INT,
        -- summaries
        tag VARCHAR(40),
        chapters VARCHAR(120),
        amended VARCHAR(120),
        -- judgements
        court VARCHAR(120),
        cite VARCHAR(120),
        holding TEXT,
        spine VARCHAR(10)
          CHECK (spine IS NULL OR spine IN ('sc', 'hc', 'lhc')),
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        -- PDF
        file_name VARCHAR(255),
        file_mime VARCHAR(100),
        file_size_bytes INT,
        file_content_base64 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (slug)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_reads_pillar_status ON knowledge_reads (pillar, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_reads_display ON knowledge_reads (pillar, display_order ASC, updated_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_reads_placement ON knowledge_reads (pillar, placement) WHERE pillar = 'articles'`);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
