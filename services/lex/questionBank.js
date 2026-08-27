import * as XLSX from 'xlsx';
import { SimpleTfidf } from './tfidf.js';
import { embedText, embedMany, cosineSimilarity } from './embeddings.js';
import {
  CACHE_TTL_MS,
  DEFAULT_QUESTION_BANK_URL,
  EMBEDDING_MATCH_THRESHOLD,
  TFIDF_MATCH_THRESHOLD,
} from './constants.js';

let cache = {
  entries: [],
  tfidf: null,
  embeddingEntries: [],
  etag: null,
  loadedAt: 0,
  sheetBuilding: null,
  embeddingBuilding: null,
};

function findColumnIndex(headerRow, candidates) {
  const normalized = headerRow.map((cell) => String(cell || '').toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseQuestionBankRows(rows) {
  if (!rows.length) return [];

  const header = rows[0];
  let questionIdx = findColumnIndex(header, ['question text', 'question']);
  let answerIdx = findColumnIndex(header, ['notes', 'answer']);

  // Nexus Lexis sheet: B=Q No., C=Question, M=Notes
  if (questionIdx < 0) questionIdx = 2;
  if (answerIdx < 0) answerIdx = 12;

  const entries = [];
  rows.slice(1).forEach((row) => {
    const question = String(row[questionIdx] || '').trim();
    const answer = String(row[answerIdx] || '').trim();
    if (question && answer && question.toLowerCase() !== 'question text (verbatim)') {
      entries.push({ question, answer });
    }
  });
  return entries;
}

async function downloadSheetEntries(sheetUrl) {
  const headers = {};
  if (cache.etag) headers['If-None-Match'] = cache.etag;

  const response = await fetch(sheetUrl, { headers });
  if (response.status === 304 && cache.entries.length) {
    cache.loadedAt = Date.now();
    return cache.entries;
  }
  if (!response.ok) {
    throw new Error(`Question bank download failed (${response.status})`);
  }

  cache.etag = response.headers.get('etag');
  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets['Question Bank'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Question Bank sheet not found');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const parsed = parseQuestionBankRows(rows);
  if (!parsed.length) throw new Error('No Q&A rows found in question bank');
  return parsed;
}

function buildTfidfIndex(entries) {
  const tfidf = new SimpleTfidf();
  tfidf.fitTransform(entries.map((e) => e.question), entries.map((e) => e.answer));
  return tfidf;
}

function startEmbeddingBuild(entries, apiKey) {
  if (!apiKey || cache.embeddingEntries.length || cache.embeddingBuilding) return;

  cache.embeddingBuilding = (async () => {
    try {
      console.log(`[lex] Background: embedding ${entries.length} question-bank rows (batch)...`);
      const vectors = await embedMany(entries.map((e) => e.question), apiKey);
      cache.embeddingEntries = entries.map((item, i) => ({
        question: item.question,
        answer: item.answer,
        vector: vectors[i],
      }));
      console.log(`[lex] Background: embedding index ready (${cache.embeddingEntries.length} vectors)`);
    } catch (err) {
      console.warn('[lex] Background embedding build skipped:', err.message);
    } finally {
      cache.embeddingBuilding = null;
    }
  })();
}

async function ensureTfidfIndex(apiKey) {
  const now = Date.now();
  if (cache.entries.length && cache.tfidf && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache;
  }
  if (cache.sheetBuilding) return cache.sheetBuilding;

  const sheetUrl = process.env.LEX_QUESTION_BANK_URL || DEFAULT_QUESTION_BANK_URL;
  cache.sheetBuilding = (async () => {
    const started = Date.now();
    const entries = await downloadSheetEntries(sheetUrl);
    cache.entries = entries;
    cache.tfidf = buildTfidfIndex(entries);
    cache.loadedAt = Date.now();
    console.log(`[lex] Question bank loaded (${entries.length} rows, TF-IDF) in ${Date.now() - started}ms`);
    startEmbeddingBuild(entries, apiKey);
    return cache;
  })()
    .catch((err) => {
      console.error('[lex] Question bank load error:', err.message);
      throw err;
    })
    .finally(() => {
      cache.sheetBuilding = null;
    });

  return cache.sheetBuilding;
}

async function searchEmbeddings(userMessage, apiKey) {
  if (!cache.embeddingEntries.length) return null;

  const queryVector = await embedText(userMessage, apiKey);
  const scored = cache.embeddingEntries.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryVector, entry.vector),
  }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const threshold = Number(process.env.LEX_EMBEDDING_THRESHOLD || EMBEDDING_MATCH_THRESHOLD);
  if (!best || best.score < threshold) {
    return { found: false, matches: scored.slice(0, 3), score: best?.score || 0, method: 'embedding' };
  }

  return {
    found: true,
    matches: scored.slice(0, 3),
    score: best.score,
    top: best,
    method: 'embedding',
  };
}

/** Fast sheet search — TF-IDF first; optional semantic upgrade when embeddings are ready. */
export async function searchQuestionBank(userMessage, apiKey) {
  const { entries, tfidf } = await ensureTfidfIndex(apiKey);
  const threshold = Number(process.env.LEX_TFIDF_THRESHOLD || TFIDF_MATCH_THRESHOLD);
  const tfidfHit = tfidf.search(userMessage, threshold);

  if (tfidfHit.found && typeof tfidfHit.index === 'number') {
    const entry = entries[tfidfHit.index];
    const match = { ...entry, score: tfidfHit.score };
    return {
      found: true,
      matches: [match],
      score: tfidfHit.score,
      top: match,
      method: 'tfidf',
    };
  }

  const semantic = await searchEmbeddings(userMessage, apiKey);
  if (semantic?.found) return semantic;

  return { found: false, matches: [], score: tfidfHit.score || 0, method: 'none' };
}

/** Clear in-memory sheet/TF-IDF/embeddings so next chat reloads from Google Sheet. */
export function invalidateQuestionBankCache() {
  cache = {
    entries: [],
    tfidf: null,
    embeddingEntries: [],
    etag: null,
    loadedAt: 0,
    sheetBuilding: null,
    embeddingBuilding: null,
  };
}

export function getQuestionBankMeta() {
  return {
    entryCount: cache.entries.length,
    embeddingCount: cache.embeddingEntries.length,
    loadedAt: cache.loadedAt || null,
    cacheTtlMs: CACHE_TTL_MS,
    hasTfidf: Boolean(cache.tfidf),
  };
}

/** Pre-load sheet + TF-IDF on startup so the first chat is fast. */
export function warmQuestionBank(apiKey) {
  if (!apiKey) return Promise.resolve();
  return ensureTfidfIndex(apiKey).catch((err) => {
    console.warn('[lex] Warm-up failed:', err.message);
  });
}

export function formatReferenceContext(matches) {
  return matches
    .slice(0, 2)
    .map((m, i) => `Reference ${i + 1}:\nQ: ${m.question}\nA: ${m.answer}`)
    .join('\n\n');
}
