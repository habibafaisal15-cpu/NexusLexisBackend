/**
 * Knowledge Bank Law Books — NL-BE-KB-DYN-001
 * Replaces FE localStorage nexus-lexis-law-books-v2.
 */
import { query } from './index.js';
import { ensureLawBooksSchema } from './ensureLawBooksSchema.js';
import { buildPaginationMeta, parsePagination } from '../shared/lib/pagination.js';

export class LawBookError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const STATUSES = new Set(['draft', 'published', 'retired']);
const KINDS = new Set(['annotated', 'constitution', 'reporter', 'practice', 'commentary']);
const SUBJECTS = new Set(['criminal', 'constitutional', 'procedure', 'family', 'tax', 'civil']);
const SPINE_TONES = new Set(['seal', 'navy', 'blue', 'green', 'teal', 'brown']);
const LANGS = new Set(['EN', 'UR']);
const KIND_LABELS = {
  annotated: 'Annotated statute',
  constitution: 'Constitution',
  reporter: 'Law reporter',
  practice: 'Practice guide',
  commentary: 'Commentary',
};
const LIST_LIMITS = [12, 24, 48];

function fail(message, status = 422, fields = {}) {
  throw new LawBookError(message, status, {
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
    .slice(0, 120);
}

function parseList(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch { /* fall through */ }
    }
    return t.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function normalizeLanguages(value) {
  const raw = parseList(value).map((v) => String(v).toUpperCase().replace('-', '_'));
  const out = [];
  for (const item of raw) {
    if (item === 'EN_UR' || item === 'ENUR') {
      if (!out.includes('EN')) out.push('EN');
      if (!out.includes('UR')) out.push('UR');
      continue;
    }
    if (LANGS.has(item) && !out.includes(item)) out.push(item);
  }
  return out.length ? out : ['EN'];
}

function normalizeContents(value) {
  if (value === undefined || value === null || value === '') return [];
  let arr = value;
  if (typeof value === 'string') {
    try { arr = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      title: String(c.title || '').trim(),
      page: Number.isFinite(Number(c.page)) ? Number(c.page) : null,
    }))
    .filter((c) => c.title);
}

function normalizeSampleChapter(value) {
  if (value === undefined || value === null || value === '') return null;
  let obj = value;
  if (typeof value === 'string') {
    try { obj = JSON.parse(value); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const title = String(obj.title || '').trim();
  const body = String(obj.body || '').trim();
  if (!title && !body) return null;
  return { title: title || 'Sample', body };
}

function fileObject(row, { publicBaseUrl = null } = {}) {
  if (!row.file_content_base64) return null;
  const base = publicBaseUrl || '';
  const bust = row.updated_at ? `?v=${new Date(row.updated_at).getTime()}` : '';
  return {
    url: `${base}/api/v2/knowledge-bank/books/${row.slug}/file${bust}`,
    fileName: row.file_name || `${row.slug}.pdf`,
    mime: row.file_mime || 'application/pdf',
    sizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
  };
}

export function mapLawBook(row, { publicBaseUrl = null } = {}) {
  if (!row) return null;
  const languages = Array.isArray(row.languages) ? row.languages : [];
  return {
    id: String(row.id),
    slug: row.slug,
    status: row.status,
    kind: row.kind,
    kindLabel: KIND_LABELS[row.kind] || row.kind,
    subject: row.subject,
    title: row.title,
    description: row.description || '',
    spineBand: row.spine_band || null,
    spineCode: row.spine_code || null,
    edition: row.edition || null,
    year: row.year != null ? Number(row.year) : null,
    pages: row.pages != null ? Number(row.pages) : null,
    languages,
    spineTone: row.spine_tone || null,
    author: row.author || null,
    contents: Array.isArray(row.contents) ? row.contents : [],
    sampleChapter: row.sample_chapter || null,
    coverUrl: row.cover_url || null,
    hasFile: Boolean(row.file_content_base64),
    file: fileObject(row, { publicBaseUrl }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by != null ? String(row.updated_by) : null,
  };
}

function normalizeBody(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.slug !== undefined) out.slug = body.slug != null ? slugify(body.slug) : undefined;
  if (!partial || body.status !== undefined) out.status = body.status != null ? String(body.status) : undefined;
  if (!partial || body.kind !== undefined) out.kind = body.kind != null ? String(body.kind) : undefined;
  if (!partial || body.subject !== undefined) out.subject = body.subject != null ? String(body.subject) : undefined;
  if (!partial || body.title !== undefined) out.title = body.title != null ? String(body.title).trim().slice(0, 255) : undefined;
  if (!partial || body.description !== undefined) {
    out.description = body.description != null ? String(body.description).trim() : undefined;
  }
  if (!partial || body.spineBand !== undefined) out.spineBand = body.spineBand != null ? String(body.spineBand) : null;
  if (!partial || body.spineCode !== undefined) out.spineCode = body.spineCode != null ? String(body.spineCode) : null;
  if (!partial || body.edition !== undefined) out.edition = body.edition != null ? String(body.edition) : null;
  if (!partial || body.year !== undefined) {
    const n = Number(body.year);
    out.year = Number.isFinite(n) ? Math.round(n) : null;
  }
  if (!partial || body.pages !== undefined) {
    const n = Number(body.pages);
    out.pages = Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
  }
  if (!partial || body.languages !== undefined) out.languages = normalizeLanguages(body.languages);
  if (!partial || body.spineTone !== undefined) out.spineTone = body.spineTone || null;
  if (!partial || body.author !== undefined) out.author = body.author != null ? String(body.author) : null;
  if (!partial || body.contents !== undefined) out.contents = normalizeContents(body.contents);
  if (!partial || body.sampleChapter !== undefined) out.sampleChapter = normalizeSampleChapter(body.sampleChapter);
  if (!partial || body.coverUrl !== undefined) out.coverUrl = body.coverUrl != null ? String(body.coverUrl) : null;
  return out;
}

function validateEnums(fields) {
  if (fields.status != null && !STATUSES.has(fields.status)) fail('status must be draft|published|retired', 400, { status: 'invalid' });
  if (fields.kind != null && !KINDS.has(fields.kind)) fail('Unknown kind', 400, { kind: 'invalid' });
  if (fields.subject != null && !SUBJECTS.has(fields.subject)) fail('Unknown subject', 400, { subject: 'invalid' });
  if (fields.spineTone != null && fields.spineTone !== '' && !SPINE_TONES.has(fields.spineTone)) {
    fail('Unknown spineTone', 400, { spineTone: 'invalid' });
  }
  if (fields.slug != null && (fields.slug.length < 3 || fields.slug.length > 120)) {
    fail('slug must be 3–120 kebab-case characters', 422, { slug: 'invalid' });
  }
}

function validatePublish(fields, { hasFile = false } = {}) {
  if (!fields.title?.trim()) fail('title is required', 422, { title: 'required' });
  if (!String(fields.description || '').trim()) {
    fail('description is required when publishing', 422, { description: 'required' });
  }
  if (!fields.kind || !KINDS.has(fields.kind)) fail('kind is required', 422, { kind: 'required' });
  if (!fields.subject || !SUBJECTS.has(fields.subject)) fail('subject is required', 422, { subject: 'required' });
  if (!hasFile) {
    fail('A PDF or DOCX volume file is required to publish', 400, { file: 'required' });
  }
}

const MAX_BOOK_FILE_BYTES = 25 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function assertVolumeFile(file) {
  if (!file?.buffer) fail('file is required', 400, { file: 'required' });
  if (file.buffer.length > MAX_BOOK_FILE_BYTES) {
    throw new LawBookError('File too large — cap 25 MB', 400, {
      success: false,
      error: 'File too large — cap 25 MB',
      message: 'File too large — cap 25 MB',
      fields: { file: 'too_large' },
    });
  }
  const mime = String(file.mimetype || file.mimeType || '').toLowerCase();
  const name = String(file.originalname || file.fileName || '').toLowerCase();
  const isPdf = mime === 'application/pdf' || name.endsWith('.pdf')
    || file.buffer.slice(0, 4).toString() === '%PDF';
  const isDocx = mime === DOCX_MIME
    || name.endsWith('.docx')
    || (file.buffer.slice(0, 2).toString() === 'PK' && name.endsWith('.docx'));
  if (!isPdf && !isDocx) {
    throw new LawBookError('file must be application/pdf or DOCX', 400, {
      success: false,
      error: 'file must be application/pdf or DOCX',
      message: 'file must be application/pdf or DOCX',
      fields: { file: 'invalid_type' },
    });
  }
  return {
    fileName: file.originalname || file.fileName || (isPdf ? 'volume.pdf' : 'volume.docx'),
    mimeType: isPdf ? 'application/pdf' : DOCX_MIME,
    buffer: file.buffer,
    sizeBytes: file.buffer.length,
  };
}

async function findByIdOrSlug(idOrSlug) {
  const raw = String(idOrSlug || '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const byId = await query(`SELECT * FROM knowledge_law_books WHERE id = $1`, [Number(raw)]);
    if (byId.rows[0]) return byId.rows[0];
  }
  const bySlug = await query(`SELECT * FROM knowledge_law_books WHERE slug = $1`, [raw]);
  return bySlug.rows[0] || null;
}

export async function createLawBook(body = {}, adminUserId = null, { publicBaseUrl = null, file = null } = {}) {
  await ensureLawBooksSchema();
  const fields = normalizeBody(body, { partial: false });
  if (!fields.title) fail('title is required', 422, { title: 'required' });
  fields.status = fields.status || 'draft';
  fields.kind = fields.kind || 'annotated';
  fields.subject = fields.subject || 'civil';
  fields.slug = fields.slug || slugify(fields.title);
  if (!fields.slug || fields.slug.length < 3) {
    fields.slug = `book-${Date.now().toString(36)}`;
  }
  fields.languages = fields.languages || ['EN'];
  fields.contents = fields.contents || [];
  validateEnums(fields);

  let volume = null;
  if (file) volume = assertVolumeFile(file);
  if (fields.status === 'published') validatePublish(fields, { hasFile: Boolean(volume) });

  try {
    const result = await query(
      `INSERT INTO knowledge_law_books (
         slug, status, kind, subject, title, description,
         spine_band, spine_code, edition, year, pages, languages,
         spine_tone, author, contents, sample_chapter, cover_url,
         file_name, file_mime, file_size_bytes, file_content_base64,
         updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16::jsonb,$17,
         $18,$19,$20,$21,$22
       ) RETURNING *`,
      [
        fields.slug,
        fields.status,
        fields.kind,
        fields.subject,
        fields.title,
        fields.description || '',
        fields.spineBand || null,
        fields.spineCode || null,
        fields.edition || null,
        fields.year ?? null,
        fields.pages ?? null,
        JSON.stringify(fields.languages),
        fields.spineTone || null,
        fields.author || null,
        JSON.stringify(fields.contents),
        fields.sampleChapter ? JSON.stringify(fields.sampleChapter) : null,
        fields.coverUrl || null,
        volume?.fileName || null,
        volume?.mimeType || null,
        volume?.sizeBytes ?? null,
        volume ? volume.buffer.toString('base64') : null,
        adminUserId || null,
      ]
    );
    return { success: true, data: mapLawBook(result.rows[0], { publicBaseUrl }) };
  } catch (err) {
    if (err.code === '23505') {
      throw new LawBookError('Slug already taken', 409, {
        success: false,
        error: 'Slug already taken',
        message: 'Slug already taken',
        fields: { slug: 'taken' },
      });
    }
    throw err;
  }
}

export async function updateLawBook(idOrSlug, body = {}, adminUserId = null, { publicBaseUrl = null, file = null } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row) throw new LawBookError('Book not found', 404);

  const patch = normalizeBody(body, { partial: true });
  validateEnums(patch);

  if (patch.slug != null && patch.slug !== row.slug && row.status === 'published') {
    throw new LawBookError('Slug is immutable after publish', 409, {
      success: false,
      error: 'Slug is immutable after publish',
      fields: { slug: 'locked' },
    });
  }

  let volume = null;
  if (file) volume = assertVolumeFile(file);

  const next = {
    slug: patch.slug ?? row.slug,
    status: patch.status ?? row.status,
    kind: patch.kind ?? row.kind,
    subject: patch.subject ?? row.subject,
    title: patch.title ?? row.title,
    description: patch.description !== undefined ? patch.description : row.description,
    spine_band: patch.spineBand !== undefined ? patch.spineBand : row.spine_band,
    spine_code: patch.spineCode !== undefined ? patch.spineCode : row.spine_code,
    edition: patch.edition !== undefined ? patch.edition : row.edition,
    year: patch.year !== undefined ? patch.year : row.year,
    pages: patch.pages !== undefined ? patch.pages : row.pages,
    languages: patch.languages !== undefined ? patch.languages : (row.languages || ['EN']),
    spine_tone: patch.spineTone !== undefined ? patch.spineTone : row.spine_tone,
    author: patch.author !== undefined ? patch.author : row.author,
    contents: patch.contents !== undefined ? patch.contents : (row.contents || []),
    sample_chapter: patch.sampleChapter !== undefined ? patch.sampleChapter : row.sample_chapter,
    cover_url: patch.coverUrl !== undefined ? patch.coverUrl : row.cover_url,
  };

  const hasFile = Boolean(volume) || Boolean(row.file_content_base64);
  if (next.status === 'published') {
    validatePublish({
      title: next.title,
      description: next.description,
      kind: next.kind,
      subject: next.subject,
    }, { hasFile });
  }

  try {
    const updated = await query(
      `UPDATE knowledge_law_books SET
         slug = $2, status = $3, kind = $4, subject = $5, title = $6, description = $7,
         spine_band = $8, spine_code = $9, edition = $10, year = $11, pages = $12,
         languages = $13::jsonb, spine_tone = $14, author = $15, contents = $16::jsonb,
         sample_chapter = $17::jsonb, cover_url = $18,
         file_name = COALESCE($20, file_name),
         file_mime = COALESCE($21, file_mime),
         file_size_bytes = COALESCE($22, file_size_bytes),
         file_content_base64 = COALESCE($23, file_content_base64),
         updated_at = CURRENT_TIMESTAMP, updated_by = $19
       WHERE id = $1
       RETURNING *`,
      [
        row.id,
        next.slug,
        next.status,
        next.kind,
        next.subject,
        next.title,
        next.description,
        next.spine_band,
        next.spine_code,
        next.edition,
        next.year,
        next.pages,
        JSON.stringify(next.languages || []),
        next.spine_tone,
        next.author,
        JSON.stringify(next.contents || []),
        next.sample_chapter ? JSON.stringify(next.sample_chapter) : null,
        next.cover_url,
        adminUserId || null,
        volume?.fileName || null,
        volume?.mimeType || null,
        volume?.sizeBytes ?? null,
        volume ? volume.buffer.toString('base64') : null,
      ]
    );
    return { success: true, data: mapLawBook(updated.rows[0], { publicBaseUrl }) };
  } catch (err) {
    if (err.code === '23505') {
      throw new LawBookError('Slug already taken', 409, {
        success: false,
        error: 'Slug already taken',
        fields: { slug: 'taken' },
      });
    }
    throw err;
  }
}

export async function patchLawBookStatus(idOrSlug, status, adminUserId = null, opts = {}) {
  return updateLawBook(idOrSlug, { status }, adminUserId, opts);
}

export async function uploadLawBookFile(idOrSlug, file, { fileName } = {}, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row) throw new LawBookError('Book not found', 404);
  const volume = assertVolumeFile({
    ...file,
    originalname: fileName || file.originalname || file.fileName,
    fileName: fileName || file.originalname || file.fileName,
  });

  const updated = await query(
    `UPDATE knowledge_law_books SET
       file_name = $2,
       file_mime = $3,
       file_size_bytes = $4,
       file_content_base64 = $5,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $6
     WHERE id = $1
     RETURNING *`,
    [
      row.id,
      volume.fileName,
      volume.mimeType,
      volume.sizeBytes,
      volume.buffer.toString('base64'),
      adminUserId || null,
    ]
  );
  return { success: true, data: mapLawBook(updated.rows[0], { publicBaseUrl }) };
}

export async function deleteLawBookFile(idOrSlug, adminUserId = null, { publicBaseUrl = null } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row) throw new LawBookError('Book not found', 404);

  const updated = await query(
    `UPDATE knowledge_law_books SET
       file_name = NULL,
       file_mime = NULL,
       file_size_bytes = NULL,
       file_content_base64 = NULL,
       status = 'draft',
       updated_at = CURRENT_TIMESTAMP,
       updated_by = $2
     WHERE id = $1
     RETURNING *`,
    [row.id, adminUserId || null]
  );
  return { success: true, data: mapLawBook(updated.rows[0], { publicBaseUrl }) };
}

export async function getLawBookFile(idOrSlug, { publicOnly = false } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row?.file_content_base64) throw new LawBookError('File not found', 404);
  if (publicOnly && row.status !== 'published') throw new LawBookError('File not found', 404);
  return {
    fileName: row.file_name || `${row.slug}.pdf`,
    mimeType: row.file_mime || 'application/pdf',
    buffer: Buffer.from(row.file_content_base64, 'base64'),
  };
}

export async function deleteLawBook(idOrSlug, { hard = false } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row) throw new LawBookError('Book not found', 404);

  if (hard) {
    await query(`DELETE FROM knowledge_law_books WHERE id = $1`, [row.id]);
    return { success: true, data: { id: String(row.id), hardDeleted: true } };
  }
  const updated = await query(
    `UPDATE knowledge_law_books SET status = 'retired', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [row.id]
  );
  return { success: true, data: mapLawBook(updated.rows[0]) };
}

export async function getLawBookByIdOrSlug(idOrSlug, { publicOnly = false, publicBaseUrl = null } = {}) {
  await ensureLawBooksSchema();
  const row = await findByIdOrSlug(idOrSlug);
  if (!row) throw new LawBookError('Book not found', 404);
  if (publicOnly && row.status !== 'published') throw new LawBookError('Book not found', 404);
  return { success: true, data: mapLawBook(row, { publicBaseUrl }) };
}

function parseBookPagination(q = {}) {
  let page = Number.parseInt(q.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(q.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  else if (!LIST_LIMITS.includes(limit)) {
    limit = LIST_LIMITS.reduce((best, a) => (Math.abs(a - limit) < Math.abs(best - limit) ? a : best), 12);
  }
  return { page, limit };
}

export async function listAdminLawBooks(filters = {}, { publicBaseUrl = null } = {}) {
  await ensureLawBooksSchema();
  const { page, limit } = parseBookPagination(filters);
  const params = [];
  const where = [];

  if (filters.status && STATUSES.has(String(filters.status))) {
    params.push(String(filters.status));
    where.push(`status = $${params.length}`);
  }
  if (filters.kind && KINDS.has(String(filters.kind))) {
    params.push(String(filters.kind));
    where.push(`kind = $${params.length}`);
  }
  if (filters.subject && SUBJECTS.has(String(filters.subject))) {
    params.push(String(filters.subject));
    where.push(`subject = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(
      title ILIKE $${i} OR slug ILIKE $${i}
      OR COALESCE(spine_code,'') ILIKE $${i}
      OR COALESCE(author,'') ILIKE $${i}
      OR COALESCE(description,'') ILIKE $${i}
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM knowledge_law_books ${whereSql}`, params);
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ ...parsePagination({ page, limit }), totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT * FROM knowledge_law_books ${whereSql}
     ORDER BY updated_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const kpi = await query(`
    SELECT
      COUNT(*)::int AS books,
      COUNT(*) FILTER (WHERE status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
      COUNT(*) FILTER (WHERE status = 'retired')::int AS retired
    FROM knowledge_law_books
  `);

  return {
    success: true,
    data: {
      items: rows.rows.map((r) => mapLawBook(r, { publicBaseUrl })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
      },
      counts: kpi.rows[0] || { books: 0, published: 0, draft: 0, retired: 0 },
    },
  };
}

export async function listPublicLawBooks(filters = {}, { publicBaseUrl = null } = {}) {
  await ensureLawBooksSchema();
  const params = ['published'];
  const where = [`status = $1`];

  if (filters.kind && KINDS.has(String(filters.kind))) {
    params.push(String(filters.kind));
    where.push(`kind = $${params.length}`);
  }
  if (filters.subject && SUBJECTS.has(String(filters.subject))) {
    params.push(String(filters.subject));
    where.push(`subject = $${params.length}`);
  }
  if (filters.year && Number.isFinite(Number(filters.year))) {
    params.push(Number(filters.year));
    where.push(`year = $${params.length}`);
  }
  if (filters.language) {
    const lang = String(filters.language).toUpperCase().replace('-', '_');
    if (lang === 'EN_UR') {
      where.push(`languages ? 'EN' AND languages ? 'UR'`);
    } else if (LANGS.has(lang)) {
      params.push(lang);
      where.push(`languages ? $${params.length}`);
    }
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(
      title ILIKE $${i} OR COALESCE(description,'') ILIKE $${i}
      OR COALESCE(spine_code,'') ILIKE $${i} OR COALESCE(author,'') ILIKE $${i}
    )`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const result = await query(
    `SELECT * FROM knowledge_law_books ${whereSql}
     ORDER BY year DESC NULLS LAST, updated_at DESC, id DESC`,
    params
  );
  const items = result.rows.map((r) => mapLawBook(r, { publicBaseUrl }));

  const meta = await query(`
    SELECT
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT kind), NULL) AS kinds,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT subject), NULL) AS subjects,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT year), NULL) AS years
    FROM knowledge_law_books
    WHERE status = 'published'
  `);
  const years = (meta.rows[0]?.years || [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  return {
    success: true,
    data: {
      items,
      filters: {
        kinds: ['annotated', 'constitution', 'reporter', 'practice', 'commentary'],
        subjects: ['criminal', 'constitutional', 'procedure', 'family', 'tax', 'civil'],
        languages: ['EN', 'UR', 'EN_UR'],
        years,
      },
      counts: { published: items.length },
    },
  };
}
