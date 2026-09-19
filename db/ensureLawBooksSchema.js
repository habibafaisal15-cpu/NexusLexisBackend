import { query } from './index.js';

let readyPromise = null;

/** Law Books — NL-BE-KB-DYN-001 */
export async function ensureLawBooksSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS knowledge_law_books (
        id BIGSERIAL PRIMARY KEY,
        slug VARCHAR(120) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'published', 'retired')),
        kind VARCHAR(40) NOT NULL
          CHECK (kind IN ('annotated', 'constitution', 'reporter', 'practice', 'commentary')),
        subject VARCHAR(40) NOT NULL
          CHECK (subject IN ('criminal', 'constitutional', 'procedure', 'family', 'tax', 'civil')),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        spine_band VARCHAR(80),
        spine_code VARCHAR(40),
        edition VARCHAR(80),
        year INT,
        pages INT,
        languages JSONB NOT NULL DEFAULT '["EN"]'::jsonb,
        spine_tone VARCHAR(20)
          CHECK (spine_tone IS NULL OR spine_tone IN ('seal', 'navy', 'blue', 'green', 'teal', 'brown')),
        author VARCHAR(255),
        contents JSONB NOT NULL DEFAULT '[]'::jsonb,
        sample_chapter JSONB,
        cover_url TEXT,
        file_name VARCHAR(255),
        file_mime VARCHAR(100),
        file_size_bytes INT,
        file_content_base64 TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_books_status ON knowledge_law_books (status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_books_kind ON knowledge_law_books (kind)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_books_subject ON knowledge_law_books (subject)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_books_year ON knowledge_law_books (year)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_kb_books_updated ON knowledge_law_books (updated_at DESC)`);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
