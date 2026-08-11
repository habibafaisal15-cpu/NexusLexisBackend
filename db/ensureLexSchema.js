import { query } from './index.js';

let readyPromise = null;

export async function ensureLexSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS lex_sessions (
        id BIGSERIAL PRIMARY KEY,
        session_key VARCHAR(255) UNIQUE NOT NULL,
        owner_key VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'New chat',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_lex_sessions_owner
      ON lex_sessions (owner_key, updated_at DESC)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS lex_ai_chat_logs (
        id BIGSERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        user_id BIGINT,
        question TEXT NOT NULL,
        response TEXT NOT NULL,
        detected_lang VARCHAR(10) NOT NULL DEFAULT 'EN',
        lawyer_tier VARCHAR(20),
        referral_shown BOOLEAN DEFAULT FALSE,
        is_flagged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_lex_session ON lex_ai_chat_logs (session_id)`);
    await query(`ALTER TABLE lex_ai_chat_logs ADD COLUMN IF NOT EXISTS language VARCHAR(10)`);
    await query(`ALTER TABLE lex_ai_chat_logs ADD COLUMN IF NOT EXISTS register VARCHAR(20)`);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
