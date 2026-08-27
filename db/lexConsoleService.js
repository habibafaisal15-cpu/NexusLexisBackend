/**
 * Admin LEX Console — NL-BE-LEX-CONSOLE-001
 * Oversight of client/public LEX sessions only (not lawyer LEX).
 */
import { query } from './index.js';
import { ensureLexSchema } from './ensureLexSchema.js';
import { buildPaginationMeta } from '../shared/lib/pagination.js';
import { GUEST_LEX_PROMPT_LIMIT } from './lexChatService.js';
import { invalidateQuestionBankCache, getQuestionBankMeta } from '../services/lex/questionBank.js';

export async function getLexConsoleStats() {
  await ensureLexSchema();
  const [sessions, turns, guests, flagged] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM lex_sessions`),
    query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today
      FROM lex_ai_chat_logs
    `),
    query(`
      SELECT COUNT(DISTINCT owner_key)::int AS guests
      FROM lex_sessions
      WHERE owner_key NOT LIKE 'user:%'
    `),
    query(`SELECT COUNT(*)::int AS total FROM lex_ai_chat_logs WHERE is_flagged = TRUE`),
  ]);
  const bank = getQuestionBankMeta();
  return {
    success: true,
    stats: {
      sessions: sessions.rows[0]?.total || 0,
      turns: turns.rows[0]?.total || 0,
      turnsToday: turns.rows[0]?.today || 0,
      guestOwners: guests.rows[0]?.guests || 0,
      flaggedTurns: flagged.rows[0]?.total || 0,
      guestPromptLimit: GUEST_LEX_PROMPT_LIMIT,
      questionBank: bank,
    },
  };
}

export async function listLexConsoleSessions(filters = {}) {
  await ensureLexSchema();
  let page = Number.parseInt(filters.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(filters.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 50);

  const params = [];
  const where = [];
  if (filters.guestOnly === true || filters.guestOnly === 'true') {
    where.push(`s.owner_key NOT LIKE 'user:%'`);
  }
  if (filters.userOnly === true || filters.userOnly === 'true') {
    where.push(`s.owner_key LIKE 'user:%'`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(s.title ILIKE $${i} OR s.session_key ILIKE $${i} OR s.owner_key ILIKE $${i})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(
    `SELECT COUNT(*)::int AS total FROM lex_sessions s ${whereSql}`,
    params
  );
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ page, limit, totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT s.session_key, s.owner_key, s.title, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM lex_ai_chat_logs l WHERE l.session_id = s.session_key) AS turn_count,
            (SELECT COUNT(*)::int FROM lex_ai_chat_logs l WHERE l.session_id = s.session_key AND l.is_flagged) AS flagged_count
     FROM lex_sessions s
     ${whereSql}
     ORDER BY s.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    success: true,
    sessions: rows.rows.map((row) => ({
      id: row.session_key,
      sessionKey: row.session_key,
      ownerKey: row.owner_key,
      isGuest: !String(row.owner_key || '').startsWith('user:'),
      title: row.title,
      turnCount: row.turn_count,
      flaggedCount: row.flagged_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalItems: pagination.totalItems,
      totalPages: pagination.totalPages,
      hasNext: pagination.hasNext,
      hasPrev: pagination.hasPrev,
    },
  };
}

export async function getLexConsoleSession(sessionKey) {
  await ensureLexSchema();
  const session = await query(
    `SELECT session_key, owner_key, title, created_at, updated_at
     FROM lex_sessions WHERE session_key = $1`,
    [sessionKey]
  );
  const row = session.rows[0];
  if (!row) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  const logs = await query(
    `SELECT id, question, response, detected_lang, language, register,
            referral_shown, is_flagged, created_at, user_id
     FROM lex_ai_chat_logs
     WHERE session_id = $1
     ORDER BY created_at ASC, id ASC`,
    [sessionKey]
  );
  return {
    success: true,
    session: {
      id: row.session_key,
      sessionKey: row.session_key,
      ownerKey: row.owner_key,
      isGuest: !String(row.owner_key || '').startsWith('user:'),
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      turns: logs.rows.map((t) => ({
        id: String(t.id),
        question: t.question,
        response: t.response,
        language: t.language || t.detected_lang || 'EN',
        register: t.register || null,
        referralShown: Boolean(t.referral_shown),
        isFlagged: Boolean(t.is_flagged),
        userId: t.user_id ? String(t.user_id) : null,
        createdAt: t.created_at,
      })),
    },
  };
}

export async function flagLexTurn(turnId, flagged = true) {
  await ensureLexSchema();
  const result = await query(
    `UPDATE lex_ai_chat_logs SET is_flagged = $2 WHERE id = $1
     RETURNING id, is_flagged`,
    [Number(turnId), Boolean(flagged)]
  );
  if (!result.rows[0]) {
    const err = new Error('Turn not found');
    err.status = 404;
    throw err;
  }
  return { success: true, turnId: String(result.rows[0].id), isFlagged: result.rows[0].is_flagged };
}

export async function deleteLexConsoleSession(sessionKey) {
  await ensureLexSchema();
  const existing = await query(`SELECT session_key FROM lex_sessions WHERE session_key = $1`, [sessionKey]);
  if (!existing.rows[0]) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  await query(`DELETE FROM lex_ai_chat_logs WHERE session_id = $1`, [sessionKey]);
  await query(`DELETE FROM lex_sessions WHERE session_key = $1`, [sessionKey]);
  return { success: true, sessionKey };
}

export async function reloadLexQuestionBank() {
  invalidateQuestionBankCache();
  const { warmQuestionBank } = await import('../services/lex/questionBank.js');
  await warmQuestionBank(process.env.OPENAI_API_KEY || process.env.LEX_OPENAI_API_KEY);
  return {
    success: true,
    questionBank: getQuestionBankMeta(),
    message: 'Question bank cache cleared and reload started',
  };
}
