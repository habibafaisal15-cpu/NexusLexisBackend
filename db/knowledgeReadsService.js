/**
 * Knowledge Bank reads — articles, summaries, judgements (NL-BE-KB-READS-001)
 * Card JSON + one PDF per entry. Not Library templates, not calculators, not SEO CMS.
 */
import { query } from './index.js';
import { ensureKnowledgeReadsSchema } from './ensureKnowledgeReadsSchema.js';
import { buildPaginationMeta } from '../shared/lib/pagination.js';
import {
  expiresAtFrom,
  isExpired,
  resolveVerifiedAt,
  toIso,
} from '../shared/lib/knowledgeValidity.js';

export class KnowledgeReadError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const PILLARS = new Set(['articles', 'summaries', 'judgements']);
const STATUSES = new Set(['published', 'draft', 'retired']);
const PLACEMENTS = new Set(['featured', 'stack', 'mini']);
const BANDS = new Set(['seal', 'gold', 'navy']);
const SPINES = new Set(['sc', 'hc', 'lhc']);
const SUMMARY_TAGS = new Set(['Constitutional', 'Criminal', 'Civil', 'Family', 'Property', 'Tax']);
const RELATED_OK = new Set(['drafting', 'consultation', 'vlo']);
const LIST_LIMITS = [12, 24, 48];

function fail(message, status = 422, fields = {}) {
  throw new KnowledgeReadError(message, status, {
    success: false,
    error: 'Validation failed',
    message,
    fields,
  });
}

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).toLowerCase().trim();
  if (['true', '1', 'yes'].includes(raw)) return true;
  if (['false', '0', 'no'].includes(raw)) return false;
  return fallback;
}

function parseList(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function parsePagination(q = {}) {
  let page = Number.parseInt(q.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(q.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  else if (!LIST_LIMITS.includes(limit)) {
    limit = LIST_LIMITS.reduce((best, a) => (Math.abs(a - limit) < Math.abs(best - limit) ? a : best), 12);
  }
  return { page, limit };
}

function fileObject(row, { publicBaseUrl = null, cacheBust = true } = {}) {
  if (!row.file_content_base64) return null;
  const base = publicBaseUrl || '';
  const path = `/api/v2/knowledge-bank/${row.pillar}/${row.slug}/file`;
  const bust = cacheBust && row.updated_at
    ? `?v=${new Date(row.updated_at).getTime()}`
    : '';
  return {
    url: `${base}${path}${bust}`,
    fileName: row.file_name || `${row.slug}.pdf`,
    mime: row.file_mime || 'application/pdf',
    sizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
  };
}

export function mapReadEntry(row, { publicBaseUrl = null, compact = false } = {}) {
  if (!row) return null;
  const base = {
    id: String(row.id),
    pillar: row.pillar,
    slug: row.slug,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt || '',
    category: row.category || null,
    keyword: row.keyword || null,
    metaTitle: row.meta_title || null,
    metaDesc: row.meta_desc || null,
    schema: Boolean(row.schema_flag),
    related: Array.isArray(row.related) ? row.related : [],
    displayOrder: Number(row.display_order) || 0,
    hasFile: Boolean(row.file_content_base64),
    file: fileObject(row, { publicBaseUrl }),
    verifiedAt: toIso(row.verified_at),
    expiresAt: expiresAtFrom(row.verified_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
  };

  if (row.pillar === 'articles') {
    Object.assign(base, {
      placement: row.placement || null,
      kicker: row.kicker || null,
      band: row.band || null,
      author: row.author || null,
      credit: row.credit || null,
      readMins: row.read_mins != null ? Number(row.read_mins) : null,
    });
  } else if (row.pillar === 'summaries') {
    Object.assign(base, {
      tag: row.tag || null,
      chapters: row.chapters || null,
      amended: row.amended || null,
    });
  } else if (row.pillar === 'judgements') {
    Object.assign(base, {
      court: row.court || null,
      cite: row.cite || null,
      holding: row.holding || null,
      spine: row.spine || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      readMins: row.read_mins != null ? Number(row.read_mins) : null,
      judges: row.judges || null,
      result: row.result || null,
      caseNo: row.case_no || null,
      year: row.judgement_year != null ? Number(row.judgement_year) : null,
      citedBy: row.cited_by || null,
      bodyText: row.body_text || null,
    });
  }

  if (compact) {
    return {
      id: base.id,
      pillar: base.pillar,
      slug: base.slug,
      title: base.title,
      category: base.category,
      keyword: base.keyword,
      status: base.status,
      updatedAt: base.updatedAt,
      verifiedAt: base.verifiedAt,
      expiresAt: base.expiresAt,
      hasFile: base.hasFile,
      displayOrder: base.displayOrder,
      placement: base.placement ?? undefined,
      tag: base.tag ?? undefined,
      cite: base.cite ?? undefined,
    };
  }
  return base;
}

function validatePublishExtras(pillar, fields, hasFile) {
  if (!fields.title?.trim()) fail('title is required', 422, { title: 'required' });
  if (!hasFile) fail('A PDF is required to publish', 422, { file: 'required' });

  if (pillar === 'articles') {
    if (!PLACEMENTS.has(fields.placement)) {
      fail('placement is required on published articles (featured|stack|mini)', 422, { placement: 'required' });
    }
  }
  if (pillar === 'summaries') {
    if (!SUMMARY_TAGS.has(fields.tag)) {
      fail('tag must be one of Constitutional|Criminal|Civil|Family|Property|Tax', 422, { tag: 'invalid' });
    }
  }
  if (pillar === 'judgements') {
    if (!String(fields.cite || '').trim()) fail('cite is required on published judgements', 422, { cite: 'required' });
  }
}

async function assertPlacementRules(pillar, placement, excludeId = null) {
  if (pillar !== 'articles' || !placement) return;
  if (placement === 'featured') {
    const params = ['articles', 'published', 'featured'];
    let sql = `SELECT id, title FROM knowledge_reads
      WHERE pillar = $1 AND status = $2 AND placement = $3`;
    if (excludeId) {
      params.push(Number(excludeId));
      sql += ` AND id <> $${params.length}`;
    }
    const existing = await query(sql, params);
    if (existing.rows[0]) {
      fail(
        `Only one featured article allowed. "${existing.rows[0].title}" is already featured — demote it first.`,
        422,
        { placement: 'featured_taken' }
      );
    }
  }
  if (placement === 'stack') {
    const params = ['articles', 'published', 'stack'];
    let sql = `SELECT COUNT(*)::int AS n FROM knowledge_reads
      WHERE pillar = $1 AND status = $2 AND placement = $3`;
    if (excludeId) {
      params.push(Number(excludeId));
      sql += ` AND id <> $${params.length}`;
    }
    const count = await query(sql, params);
    if ((count.rows[0]?.n || 0) >= 2) {
      fail(
        'At most two stack articles allowed. Move one stack card to mini before publishing another as stack.',
        422,
        { placement: 'stack_full' }
      );
    }
  }
}

function normalizeBody(body = {}, { partial = false } = {}) {
  const out = {};
  const take = (key, map) => {
    if (body[key] !== undefined) out[map || key] = body[key];
  };

  if (!partial || body.pillar !== undefined) out.pillar = body.pillar != null ? String(body.pillar) : undefined;
  if (!partial || body.slug !== undefined) out.slug = body.slug != null ? slugify(body.slug) : undefined;
  if (!partial || body.status !== undefined) out.status = body.status != null ? String(body.status) : undefined;
  if (!partial || body.title !== undefined) out.title = body.title != null ? String(body.title).trim().slice(0, 140) : undefined;
  // admin UI "body" → excerpt
  if (!partial || body.excerpt !== undefined || body.body !== undefined) {
    const raw = body.excerpt !== undefined ? body.excerpt : body.body;
    out.excerpt = raw != null ? String(raw).trim().slice(0, 400) : undefined;
  }
  if (!partial || body.category !== undefined) out.category = body.category != null ? String(body.category).trim() : undefined;
  if (!partial || body.keyword !== undefined) out.keyword = body.keyword != null ? String(body.keyword).trim() : undefined;
  if (!partial || body.metaTitle !== undefined) out.metaTitle = body.metaTitle != null ? String(body.metaTitle).trim() : undefined;
  if (!partial || body.metaDesc !== undefined) out.metaDesc = body.metaDesc != null ? String(body.metaDesc).trim() : undefined;
  if (!partial || body.schema !== undefined) out.schema = parseBool(body.schema, false);
  if (!partial || body.related !== undefined) {
    out.related = parseList(body.related).filter((r) => RELATED_OK.has(r));
  }
  if (!partial || body.displayOrder !== undefined) {
    const n = Number(body.displayOrder);
    out.displayOrder = Number.isFinite(n) ? n : 0;
  }
  if (!partial || body.placement !== undefined) out.placement = body.placement || null;
  if (!partial || body.kicker !== undefined) out.kicker = body.kicker != null ? String(body.kicker) : null;
  if (!partial || body.band !== undefined) out.band = body.band || null;
  if (!partial || body.author !== undefined) out.author = body.author != null ? String(body.author) : null;
  if (!partial || body.credit !== undefined) out.credit = body.credit != null ? String(body.credit) : null;
  if (!partial || body.readMins !== undefined) {
    const n = Number(body.readMins);
    out.readMins = Number.isFinite(n) ? Math.min(60, Math.max(1, Math.round(n))) : null;
  }
  if (!partial || body.tag !== undefined) out.tag = body.tag || null;
  if (!partial || body.chapters !== undefined) out.chapters = body.chapters != null ? String(body.chapters) : null;
  if (!partial || body.amended !== undefined) out.amended = body.amended != null ? String(body.amended) : null;
  if (!partial || body.court !== undefined) out.court = body.court != null ? String(body.court) : null;
  if (!partial || body.cite !== undefined) out.cite = body.cite != null ? String(body.cite) : null;
  if (!partial || body.holding !== undefined) out.holding = body.holding != null ? String(body.holding) : null;
  if (!partial || body.spine !== undefined) out.spine = body.spine || null;
  if (!partial || body.tags !== undefined) out.tags = parseList(body.tags).slice(0, 6);
  if (!partial || body.judges !== undefined) out.judges = body.judges != null ? String(body.judges) : null;
  if (!partial || body.result !== undefined) out.result = body.result != null ? String(body.result) : null;
  if (!partial || body.caseNo !== undefined) out.caseNo = body.caseNo != null ? String(body.caseNo) : null;
  if (!partial || body.year !== undefined) {
    const n = Number(body.year);
    out.year = Number.isFinite(n) ? Math.round(n) : null;
  }
  if (!partial || body.citedBy !== undefined) out.citedBy = body.citedBy != null ? String(body.citedBy) : null;
  if (!partial || body.bodyText !== undefined) out.bodyText = body.bodyText != null ? String(body.bodyText) : null;
  if (!partial || body.verifiedAt !== undefined) out.verifiedAt = body.verifiedAt;

  return out;
}

function validateEnums(fields) {
  if (fields.pillar !== undefined && fields.pillar != null && !PILLARS.has(fields.pillar)) {
    fail('Unknown pillar — use articles|summaries|judgements', 422, { pillar: 'invalid' });
  }
  if (fields.status !== undefined && fields.status != null && !STATUSES.has(fields.status)) {
    fail('status must be published|draft|retired', 422, { status: 'invalid' });
  }
  if (fields.placement != null && fields.placement !== '' && !PLACEMENTS.has(fields.placement)) {
    fail('placement must be featured|stack|mini', 422, { placement: 'invalid' });
  }
  if (fields.band != null && fields.band !== '' && !BANDS.has(fields.band)) {
    fail('band must be seal|gold|navy', 422, { band: 'invalid' });
  }
  if (fields.spine != null && fields.spine !== '' && !SPINES.has(fields.spine)) {
    fail('spine must be sc|hc|lhc', 422, { spine: 'invalid' });
  }
  if (fields.tag != null && fields.tag !== '' && !SUMMARY_TAGS.has(fields.tag)) {
    fail('Unknown summary tag', 422, { tag: 'invalid' });
  }
  if (fields.slug !== undefined && fields.slug != null) {
    if (fields.slug.length < 4 || fields.slug.length > 72) {
      fail('slug must be 4–72 kebab-case characters', 422, { slug: 'invalid' });
    }
  }
}

export async function createKnowledgeRead(body = {}, file = null, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  const fields = normalizeBody(body, { partial: false });
  if (!fields.pillar || !PILLARS.has(fields.pillar)) {
    fail('pillar is required (articles|summaries|judgements)', 422, { pillar: 'required' });
  }
  if (!fields.title) fail('title is required', 422, { title: 'required' });
  fields.status = fields.status || 'draft';
  fields.slug = fields.slug || slugify(fields.title);
  if (!fields.slug || fields.slug.length < 4) {
    fields.slug = `${fields.slug || 'entry'}-${Date.now().toString(36)}`.slice(0, 72);
  }
  validateEnums(fields);

  const hasFile = Boolean(file?.buffer);
  if (fields.status === 'published') {
    validatePublishExtras(fields.pillar, fields, hasFile);
    await assertPlacementRules(fields.pillar, fields.placement);
  }

  if (hasFile) {
    assertPdfFile(file);
  }

  let verifiedAt = null;
  try {
    verifiedAt = resolveVerifiedAt({
      verifiedAt: fields.verifiedAt,
      stampNow: fields.status === 'published',
    });
  } catch (err) {
    fail(err.message || 'Invalid verifiedAt', 422, err.fields || { verifiedAt: 'invalid' });
  }

  try {
    const result = await query(
      `INSERT INTO knowledge_reads (
         pillar, slug, status, title, excerpt, category, keyword, meta_title, meta_desc,
         schema_flag, related, display_order,
         placement, kicker, band, author, credit, read_mins,
         tag, chapters, amended,
         court, cite, holding, spine, tags,
         judges, result, case_no, judgement_year, cited_by, body_text,
         file_name, file_mime, file_size_bytes, file_content_base64,
         verified_at, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,
         $13,$14,$15,$16,$17,$18,
         $19,$20,$21,
         $22,$23,$24,$25,$26::jsonb,
         $27,$28,$29,$30,$31,$32,
         $33,$34,$35,$36,
         $37,$38
       )
       RETURNING *`,
      [
        fields.pillar,
        fields.slug,
        fields.status,
        fields.title,
        fields.excerpt || '',
        fields.category || null,
        fields.keyword || null,
        fields.metaTitle || null,
        fields.metaDesc || null,
        Boolean(fields.schema),
        JSON.stringify(fields.related || []),
        fields.displayOrder ?? 0,
        fields.placement || null,
        fields.kicker || null,
        fields.band || null,
        fields.author || null,
        fields.credit || null,
        fields.readMins ?? null,
        fields.tag || null,
        fields.chapters || null,
        fields.amended || null,
        fields.court || null,
        fields.cite || null,
        fields.holding || null,
        fields.spine || null,
        JSON.stringify(fields.tags || []),
        fields.judges || null,
        fields.result || null,
        fields.caseNo || null,
        fields.year ?? null,
        fields.citedBy || null,
        fields.bodyText || null,
        hasFile ? (file.originalname || `${fields.slug}.pdf`) : null,
        hasFile ? 'application/pdf' : null,
        hasFile ? file.buffer.length : null,
        hasFile ? file.buffer.toString('base64') : null,
        verifiedAt,
        adminUserId || null,
      ]
    );
    return { success: true, data: mapReadEntry(result.rows[0], { publicBaseUrl }) };
  } catch (err) {
    if (err.code === '23505') {
      throw new KnowledgeReadError('Slug already taken', 409, {
        success: false,
        error: 'Slug already taken',
        message: 'Slug already taken',
        fields: { slug: 'taken' },
      });
    }
    throw err;
  }
}

export async function updateKnowledgeRead(id, body = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  const existing = await query(`SELECT * FROM knowledge_reads WHERE id = $1`, [Number(id)]);
  const row = existing.rows[0];
  if (!row) throw new KnowledgeReadError('Entry not found', 404);

  const patch = normalizeBody(body, { partial: true });
  validateEnums(patch);

  // Pillar change only while draft
  if (patch.pillar != null && patch.pillar !== row.pillar) {
    if (row.status === 'published') {
      throw new KnowledgeReadError('Cannot change pillar after publish', 409, {
        success: false,
        error: 'Cannot change pillar after publish',
        fields: { pillar: 'locked' },
      });
    }
  }

  // Slug immutable after first publish
  if (patch.slug != null && patch.slug !== row.slug) {
    if (row.status === 'published') {
      throw new KnowledgeReadError('Slug is immutable after publish', 409, {
        success: false,
        error: 'Slug is immutable after publish',
        fields: { slug: 'locked' },
      });
    }
  }

  const next = {
    pillar: patch.pillar ?? row.pillar,
    slug: patch.slug ?? row.slug,
    status: patch.status ?? row.status,
    title: patch.title ?? row.title,
    excerpt: patch.excerpt !== undefined ? patch.excerpt : row.excerpt,
    category: patch.category !== undefined ? patch.category : row.category,
    keyword: patch.keyword !== undefined ? patch.keyword : row.keyword,
    meta_title: patch.metaTitle !== undefined ? patch.metaTitle : row.meta_title,
    meta_desc: patch.metaDesc !== undefined ? patch.metaDesc : row.meta_desc,
    schema_flag: patch.schema !== undefined ? Boolean(patch.schema) : row.schema_flag,
    related: patch.related !== undefined ? patch.related : (row.related || []),
    display_order: patch.displayOrder !== undefined ? patch.displayOrder : row.display_order,
    placement: patch.placement !== undefined ? patch.placement : row.placement,
    kicker: patch.kicker !== undefined ? patch.kicker : row.kicker,
    band: patch.band !== undefined ? patch.band : row.band,
    author: patch.author !== undefined ? patch.author : row.author,
    credit: patch.credit !== undefined ? patch.credit : row.credit,
    read_mins: patch.readMins !== undefined ? patch.readMins : row.read_mins,
    tag: patch.tag !== undefined ? patch.tag : row.tag,
    chapters: patch.chapters !== undefined ? patch.chapters : row.chapters,
    amended: patch.amended !== undefined ? patch.amended : row.amended,
    court: patch.court !== undefined ? patch.court : row.court,
    cite: patch.cite !== undefined ? patch.cite : row.cite,
    holding: patch.holding !== undefined ? patch.holding : row.holding,
    spine: patch.spine !== undefined ? patch.spine : row.spine,
    tags: patch.tags !== undefined ? patch.tags : (row.tags || []),
    judges: patch.judges !== undefined ? patch.judges : row.judges,
    result: patch.result !== undefined ? patch.result : row.result,
    case_no: patch.caseNo !== undefined ? patch.caseNo : row.case_no,
    judgement_year: patch.year !== undefined ? patch.year : row.judgement_year,
    cited_by: patch.citedBy !== undefined ? patch.citedBy : row.cited_by,
    body_text: patch.bodyText !== undefined ? patch.bodyText : row.body_text,
  };

  const hasFile = Boolean(row.file_content_base64);
  if (next.status === 'published') {
    validatePublishExtras(next.pillar, {
      title: next.title,
      placement: next.placement,
      tag: next.tag,
      cite: next.cite,
    }, hasFile);
    await assertPlacementRules(next.pillar, next.placement, row.id);
  }

  let verifiedAt = row.verified_at;
  try {
    if (patch.verifiedAt !== undefined || (next.status === 'published' && !row.verified_at)) {
      verifiedAt = resolveVerifiedAt({
        verifiedAt: patch.verifiedAt !== undefined ? patch.verifiedAt : undefined,
        existingVerifiedAt: row.verified_at,
        stampNow: patch.verifiedAt === undefined && next.status === 'published' && !row.verified_at,
      });
    }
  } catch (err) {
    fail(err.message || 'Invalid verifiedAt', 422, err.fields || { verifiedAt: 'invalid' });
  }

  try {
    const updated = await query(
      `UPDATE knowledge_reads SET
         pillar = $2, slug = $3, status = $4, title = $5, excerpt = $6, category = $7,
         keyword = $8, meta_title = $9, meta_desc = $10, schema_flag = $11, related = $12::jsonb,
         display_order = $13, placement = $14, kicker = $15, band = $16, author = $17, credit = $18,
         read_mins = $19, tag = $20, chapters = $21, amended = $22,
         court = $23, cite = $24, holding = $25, spine = $26, tags = $27::jsonb,
         judges = $28, result = $29, case_no = $30, judgement_year = $31, cited_by = $32, body_text = $33,
         verified_at = $34,
         updated_at = CURRENT_TIMESTAMP, updated_by = $35
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        next.pillar,
        next.slug,
        next.status,
        next.title,
        next.excerpt,
        next.category,
        next.keyword,
        next.meta_title,
        next.meta_desc,
        next.schema_flag,
        JSON.stringify(next.related || []),
        next.display_order,
        next.placement,
        next.kicker,
        next.band,
        next.author,
        next.credit,
        next.read_mins,
        next.tag,
        next.chapters,
        next.amended,
        next.court,
        next.cite,
        next.holding,
        next.spine,
        JSON.stringify(next.tags || []),
        next.judges,
        next.result,
        next.case_no,
        next.judgement_year,
        next.cited_by,
        next.body_text,
        verifiedAt,
        adminUserId || null,
      ]
    );
    return { success: true, data: mapReadEntry(updated.rows[0], { publicBaseUrl }) };
  } catch (err) {
    if (err.code === '23505') {
      throw new KnowledgeReadError('Slug already taken', 409, {
        success: false,
        error: 'Slug already taken',
        fields: { slug: 'taken' },
      });
    }
    throw err;
  }
}

export async function patchKnowledgeReadStatus(id, status, adminUserId = null, { publicBaseUrl = null } = {}) {
  return updateKnowledgeRead(id, { status }, adminUserId, { publicBaseUrl });
}

function assertPdfFile(file) {
  if (!file?.buffer) fail('file is required', 400, { file: 'required' });
  if (file.buffer.length > 15 * 1024 * 1024) {
    throw new KnowledgeReadError('PDF too large — cap 15 MB', 413, {
      success: false,
      error: 'PDF too large — cap 15 MB',
    });
  }
  const mime = file.mimetype || '';
  const name = String(file.originalname || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
    || file.buffer.slice(0, 4).toString() === '%PDF';
  if (!isPdf) {
    throw new KnowledgeReadError('file is not application/pdf', 415, {
      success: false,
      error: 'file is not application/pdf',
    });
  }
}

export async function uploadKnowledgeReadFile(id, file, { fileName } = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  assertPdfFile(file);
  const existing = await query(`SELECT * FROM knowledge_reads WHERE id = $1`, [Number(id)]);
  if (!existing.rows[0]) throw new KnowledgeReadError('Entry not found', 404);

  const displayName = fileName || file.originalname || `${existing.rows[0].slug}.pdf`;
  const updated = await query(
    `UPDATE knowledge_reads SET
       file_name = $2,
       file_mime = 'application/pdf',
       file_size_bytes = $3,
       file_content_base64 = $4,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $5
     WHERE id = $1
     RETURNING *`,
    [Number(id), displayName, file.buffer.length, file.buffer.toString('base64'), adminUserId || null]
  );
  return { success: true, data: mapReadEntry(updated.rows[0], { publicBaseUrl }) };
}

export async function deleteKnowledgeReadFile(id, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  const updated = await query(
    `UPDATE knowledge_reads SET
       file_name = NULL,
       file_mime = NULL,
       file_size_bytes = NULL,
       file_content_base64 = NULL,
       status = 'draft',
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $2
     WHERE id = $1
     RETURNING *`,
    [Number(id), adminUserId || null]
  );
  if (!updated.rows[0]) throw new KnowledgeReadError('Entry not found', 404);
  return { success: true, data: mapReadEntry(updated.rows[0], { publicBaseUrl }) };
}

export async function getKnowledgeReadById(id, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  const result = await query(`SELECT * FROM knowledge_reads WHERE id = $1`, [Number(id)]);
  if (!result.rows[0]) throw new KnowledgeReadError('Entry not found', 404);
  return { success: true, data: mapReadEntry(result.rows[0], { publicBaseUrl }) };
}

export async function getPublishedBySlug(pillar, slug, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  if (!PILLARS.has(pillar)) throw new KnowledgeReadError('Not found', 404);
  const result = await query(
    `SELECT * FROM knowledge_reads
     WHERE pillar = $1 AND slug = $2 AND status = 'published'`,
    [pillar, slug]
  );
  const row = result.rows[0];
  if (!row) throw new KnowledgeReadError('Not found', 404);
  if ((pillar === 'articles' || pillar === 'summaries') && isExpired(row.verified_at)) {
    throw new KnowledgeReadError('Not found', 404);
  }
  return { success: true, data: mapReadEntry(row, { publicBaseUrl }) };
}

export async function getPublishedFile(pillar, slug) {
  await ensureKnowledgeReadsSchema();
  const result = await query(
    `SELECT * FROM knowledge_reads
     WHERE pillar = $1 AND slug = $2 AND status = 'published'`,
    [pillar, slug]
  );
  const row = result.rows[0];
  if (!row?.file_content_base64) throw new KnowledgeReadError('Not found', 404);
  if ((pillar === 'articles' || pillar === 'summaries') && isExpired(row.verified_at)) {
    throw new KnowledgeReadError('Not found', 404);
  }
  return {
    fileName: row.file_name || `${row.slug}.pdf`,
    mimeType: row.file_mime || 'application/pdf',
    buffer: Buffer.from(row.file_content_base64, 'base64'),
  };
}

export async function getAdminFile(id) {
  await ensureKnowledgeReadsSchema();
  const result = await query(`SELECT * FROM knowledge_reads WHERE id = $1`, [Number(id)]);
  const row = result.rows[0];
  if (!row?.file_content_base64) throw new KnowledgeReadError('Not found', 404);
  return {
    fileName: row.file_name || `${row.slug}.pdf`,
    mimeType: row.file_mime || 'application/pdf',
    buffer: Buffer.from(row.file_content_base64, 'base64'),
  };
}

export async function listAdminEntries(filters = {}, { publicBaseUrl = null } = {}) {
  await ensureKnowledgeReadsSchema();
  const { page, limit } = parsePagination(filters);
  const params = [];
  const where = [];

  if (filters.pillar && PILLARS.has(String(filters.pillar))) {
    params.push(String(filters.pillar));
    where.push(`pillar = $${params.length}`);
  }
  if (filters.status && STATUSES.has(String(filters.status))) {
    params.push(String(filters.status));
    where.push(`status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(
      title ILIKE $${i} OR slug ILIKE $${i} OR COALESCE(keyword,'') ILIKE $${i}
      OR COALESCE(category,'') ILIKE $${i} OR COALESCE(cite,'') ILIKE $${i}
      OR COALESCE(court,'') ILIKE $${i}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM knowledge_reads ${whereSql}`, params);
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ page, limit, totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT * FROM knowledge_reads ${whereSql}
     ORDER BY display_order ASC, updated_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const kpi = await query(`
    SELECT
      COUNT(*) FILTER (WHERE pillar = 'articles')::int AS articles,
      COUNT(*) FILTER (WHERE pillar = 'summaries')::int AS summaries,
      COUNT(*) FILTER (WHERE pillar = 'judgements')::int AS judgements,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
      COUNT(*) FILTER (WHERE status = 'retired')::int AS retired
    FROM knowledge_reads
  `);

  return {
    success: true,
    data: {
      items: rows.rows.map((r) => mapReadEntry(r, { publicBaseUrl, compact: true })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
      },
      counts: kpi.rows[0] || {
        articles: 0, summaries: 0, judgements: 0, published: 0, draft: 0, retired: 0,
      },
    },
  };
}

function sortPublished(rows) {
  return [...rows].sort((a, b) => {
    const d = (a.display_order || 0) - (b.display_order || 0);
    if (d !== 0) return d;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

export async function listPublicArticles({ search, publicBaseUrl } = {}) {
  await ensureKnowledgeReadsSchema();
  const params = ['articles', 'published'];
  let where = `pillar = $1 AND status = $2
    AND (verified_at IS NULL OR verified_at > (CURRENT_TIMESTAMP - INTERVAL '6 months'))`;
  if (search) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (title ILIKE $3 OR COALESCE(excerpt,'') ILIKE $3 OR COALESCE(keyword,'') ILIKE $3)`;
  }
  const result = await query(`SELECT * FROM knowledge_reads WHERE ${where}`, params);
  const items = sortPublished(result.rows).map((r) => mapReadEntry(r, { publicBaseUrl }));

  const featured = items.find((i) => i.placement === 'featured') || null;
  const stack = items.filter((i) => i.placement === 'stack').slice(0, 2);
  const used = new Set([featured?.id, ...stack.map((s) => s.id)].filter(Boolean));
  const mini = items.filter((i) => !used.has(i.id));

  return {
    success: true,
    data: {
      featured,
      stack,
      mini,
      items,
      counts: { published: items.length },
    },
  };
}

export async function listPublicSummaries({ tag, publicBaseUrl } = {}) {
  await ensureKnowledgeReadsSchema();
  const filters = ['All', 'Constitutional', 'Criminal', 'Civil', 'Family', 'Property', 'Tax'];
  const params = ['summaries', 'published'];
  let where = `pillar = $1 AND status = $2
    AND (verified_at IS NULL OR verified_at > (CURRENT_TIMESTAMP - INTERVAL '6 months'))`;
  if (tag && tag !== 'All') {
    if (!SUMMARY_TAGS.has(tag)) fail('Unknown tag', 422, { tag: 'invalid' });
    params.push(tag);
    where += ` AND tag = $3`;
  }
  const result = await query(`SELECT * FROM knowledge_reads WHERE ${where}`, params);
  const items = sortPublished(result.rows).map((r) => mapReadEntry(r, { publicBaseUrl }));
  return {
    success: true,
    data: {
      filters,
      items,
      counts: { published: items.length },
    },
  };
}

export async function listPublicJudgements({ publicBaseUrl } = {}) {
  await ensureKnowledgeReadsSchema();
  const result = await query(
    `SELECT * FROM knowledge_reads WHERE pillar = 'judgements' AND status = 'published'`
  );
  const items = sortPublished(result.rows).map((r) => mapReadEntry(r, { publicBaseUrl }));
  return {
    success: true,
    data: {
      items,
      counts: { published: items.length },
    },
  };
}
