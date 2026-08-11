import { randomUUID } from 'crypto';
import { query } from './index.js';
import { ensureLexSchema } from './ensureLexSchema.js';

export class LexChatError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function titleFromMessage(message) {
  const text = String(message || '').trim().replace(/\s+/g, ' ');
  if (!text) return 'New chat';
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

export function resolveOwnerKey(req) {
  const userId = req.user?.userId || req.user?.sub;
  if (userId) return `user:${userId}`;
  const raw = String(
    req.headers['x-lex-owner'] || req.body?.owner_key || req.query?.owner_key || ''
  ).trim();
  return raw ? raw.slice(0, 200) : null;
}

export async function createLexSession(ownerKey, { title } = {}) {
  await ensureLexSchema();
  const owner = ownerKey || `guest:${randomUUID()}`;
  const sessionKey = `session_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const result = await query(
    `INSERT INTO lex_sessions (session_key, owner_key, title)
     VALUES ($1, $2, $3)
     RETURNING session_key, owner_key, title, created_at, updated_at`,
    [sessionKey, owner, title?.trim() || 'New chat']
  );
  const row = result.rows[0];
  return {
    id: row.session_key,
    session_key: row.session_key,
    owner_key: row.owner_key,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    messages: [],
  };
}

export async function listLexSessions(ownerKey) {
  await ensureLexSchema();
  if (!ownerKey) return [];
  const result = await query(
    `SELECT s.session_key, s.owner_key, s.title, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM lex_ai_chat_logs l WHERE l.session_id = s.session_key) AS turn_count
     FROM lex_sessions s
     WHERE s.owner_key = $1
     ORDER BY s.updated_at DESC
     LIMIT 100`,
    [ownerKey]
  );
  return result.rows.map((row) => ({
    id: row.session_key,
    session_key: row.session_key,
    owner_key: row.owner_key,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    turnCount: row.turn_count,
    messages: [],
  }));
}

function mapMessages(logs) {
  const messages = [];
  for (const chat of logs) {
    messages.push({
      id: `u_${chat.id}`,
      sender: 'user',
      text: chat.question,
    });
    messages.push({
      id: `l_${chat.id}`,
      sender: 'lex',
      text: chat.response,
      showReferral: Boolean(chat.referral_shown),
      referralLabel: chat.detected_lang === 'UR' || chat.language === 'UR'
        ? 'وکیل تلاش کریں ←'
        : 'Find a Lawyer →',
      referralType: 'lawyer',
      language: chat.language || chat.detected_lang || 'EN',
    });
  }
  return messages;
}

export async function getLexSession(sessionKey, ownerKey = null) {
  await ensureLexSchema();
  const session = await query(
    `SELECT session_key, owner_key, title, created_at, updated_at
     FROM lex_sessions WHERE session_key = $1`,
    [sessionKey]
  );
  const row = session.rows[0];
  if (!row) throw new LexChatError('Session not found', 404);
  if (ownerKey && row.owner_key !== ownerKey) {
    throw new LexChatError('Session not found', 404);
  }

  const logs = await query(
    `SELECT id, question, response, detected_lang, language, register, referral_shown, created_at
     FROM lex_ai_chat_logs
     WHERE session_id = $1
     ORDER BY created_at ASC, id ASC`,
    [sessionKey]
  );

  return {
    session_key: row.session_key,
    owner_key: row.owner_key,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    messages: mapMessages(logs.rows),
  };
}

export async function deleteLexSession(sessionKey, ownerKey) {
  await ensureLexSchema();
  const existing = await query(
    `SELECT session_key, owner_key FROM lex_sessions WHERE session_key = $1`,
    [sessionKey]
  );
  if (!existing.rows[0]) throw new LexChatError('Session not found', 404);
  if (ownerKey && existing.rows[0].owner_key !== ownerKey) {
    throw new LexChatError('Session not found', 404);
  }
  await query(`DELETE FROM lex_ai_chat_logs WHERE session_id = $1`, [sessionKey]);
  await query(`DELETE FROM lex_sessions WHERE session_key = $1`, [sessionKey]);
  return { ok: true, session_key: sessionKey };
}

export async function getRecentTurns(sessionKey, limit = 5) {
  await ensureLexSchema();
  const result = await query(
    `SELECT question, response FROM lex_ai_chat_logs
     WHERE session_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [sessionKey, limit]
  );
  return result.rows.reverse();
}

export async function ensureLexSession(sessionKey, ownerKey) {
  await ensureLexSchema();
  if (sessionKey) {
    const existing = await query(
      `SELECT session_key, owner_key, title FROM lex_sessions WHERE session_key = $1`,
      [sessionKey]
    );
    if (existing.rows[0]) {
      if (ownerKey && existing.rows[0].owner_key !== ownerKey) {
        throw new LexChatError('Session not found', 404);
      }
      return existing.rows[0];
    }
    const owner = ownerKey || `guest:${randomUUID()}`;
    const inserted = await query(
      `INSERT INTO lex_sessions (session_key, owner_key, title)
       VALUES ($1, $2, 'New chat')
       RETURNING session_key, owner_key, title`,
      [String(sessionKey).slice(0, 255), owner]
    );
    return inserted.rows[0];
  }
  return createLexSession(ownerKey, { title: 'New chat' });
}

export async function saveLexTurn({
  sessionKey,
  ownerKey,
  userId = null,
  question,
  response,
  language = 'EN',
  register = 'PLAIN',
  showLawyer = false,
}) {
  await ensureLexSchema();
  const session = await ensureLexSession(sessionKey, ownerKey);

  await query(
    `INSERT INTO lex_ai_chat_logs
       (session_id, user_id, question, response, detected_lang, language, register, referral_shown)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
    [session.session_key, userId || null, question, response, language, register, showLawyer]
  );

  const nextTitle = session.title === 'New chat' ? titleFromMessage(question) : session.title;
  await query(
    `UPDATE lex_sessions
     SET title = $2, updated_at = CURRENT_TIMESTAMP
     WHERE session_key = $1`,
    [session.session_key, nextTitle]
  );

  return {
    session_key: session.session_key,
    owner_key: session.owner_key,
    title: nextTitle,
  };
}
