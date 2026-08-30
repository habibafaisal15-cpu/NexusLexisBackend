/**
 * Admin Library template drafts — NL-BE-LIB-DRAFT-001
 * Separate from published `services` rows. Never exposed to client/public catalogs.
 */
import { randomUUID } from 'crypto';
import { query } from './index.js';
import { ensureLibrarySchema } from './ensureLibrarySchema.js';
import { buildPaginationMeta, parsePagination } from '../shared/lib/pagination.js';

export class LibraryDraftError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function isNonEmpty(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Buffer.isBuffer(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

function normalizeAccessType(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).toLowerCase().trim();
  if (['public', 'knowledge_bank', 'knowledge-bank', 'free'].includes(raw)) return 'public';
  if (['paid', 'library', 'client'].includes(raw)) return 'paid';
  return null;
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapLibraryDraftRow(row) {
  if (!row) return null;
  const hasFile = Boolean(row.template_content_base64) || Boolean(row.has_file);
  return {
    id: String(row.draft_key || row.id),
    draftKey: String(row.draft_key || row.id),
    status: 'draft',
    name: row.name || null,
    code: row.code || null,
    accessType: row.access_type || null,
    categorySlug: row.category_slug || null,
    block: row.block || null,
    lang: row.language || null,
    language: row.language || null,
    price: row.price != null ? Number(row.price) : null,
    version: row.version || null,
    lawyer: row.author || null,
    author: row.author || null,
    lawyerProfileId: row.lawyer_profile_id != null ? String(row.lawyer_profile_id) : null,
    lawyerId: row.lawyer_profile_id != null ? String(row.lawyer_profile_id) : null,
    authorProfileId: row.lawyer_profile_id != null ? String(row.lawyer_profile_id) : null,
    description: row.description || null,
    hasTemplateFile: hasFile,
    templateFileName: row.template_file_name || null,
    isActive: false,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertHasAnyField(payload, file) {
  const keys = [
    payload.name, payload.code, payload.accessType, payload.categorySlug,
    payload.block, payload.language, payload.price, payload.version,
    payload.author, payload.lawyerProfileId, payload.description,
  ];
  const hasField = keys.some(isNonEmpty) || Boolean(file?.contentBase64);
  if (!hasField) {
    throw new LibraryDraftError('At least one field must be non-empty to save a draft', 400);
  }
}

function pickDraftFields(body = {}, file = null, { partial = false } = {}) {
  const accessType = body.accessType !== undefined || body.type !== undefined
    ? normalizeAccessType(body.accessType ?? body.type)
    : (partial ? undefined : null);

  const fields = {
    name: body.name !== undefined ? (String(body.name || '').trim() || null) : undefined,
    code: body.code !== undefined ? (String(body.code || '').trim() || null) : undefined,
    accessType,
    categorySlug: body.categorySlug !== undefined
      ? (String(body.categorySlug || '').trim() || null)
      : undefined,
    block: body.block !== undefined ? (String(body.block || '').trim() || null) : undefined,
    language: (body.language !== undefined || body.lang !== undefined)
      ? (String(body.language || body.lang || '').trim() || null)
      : undefined,
    price: body.price !== undefined ? parseOptionalNumber(body.price) : undefined,
    version: body.version !== undefined ? (String(body.version || '').trim() || null) : undefined,
    author: (body.author !== undefined || body.lawyer !== undefined)
      ? (String(body.author || body.lawyer || '').trim() || null)
      : undefined,
    lawyerProfileId: (body.lawyerProfileId !== undefined
      || body.lawyerId !== undefined
      || body.authorProfileId !== undefined)
      ? (body.lawyerProfileId || body.lawyerId || body.authorProfileId || null)
      : undefined,
    description: body.description !== undefined
      ? (String(body.description || '').trim() || null)
      : undefined,
  };

  if (!partial) {
    // Create: coerce undefined → null for INSERT defaults
    for (const key of Object.keys(fields)) {
      if (fields[key] === undefined) fields[key] = null;
    }
  }

  const clearFile = body.clearFile === true || body.clearFile === 'true';
  return { fields, file: file || null, clearFile };
}

export async function createLibraryDraft(body = {}, file = null, adminUserId = null) {
  await ensureLibrarySchema();
  const { fields, file: filePayload } = pickDraftFields(body, file, { partial: false });
  assertHasAnyField(fields, filePayload);

  const draftKey = `draft-${randomUUID()}`;
  const lawyerId = fields.lawyerProfileId != null && fields.lawyerProfileId !== ''
    ? Number(fields.lawyerProfileId)
    : null;

  const result = await query(
    `INSERT INTO library_template_drafts (
       draft_key, name, code, access_type, category_slug, block, language, price,
       version, author, lawyer_profile_id, description,
       template_file_name, template_mime_type, template_content_base64, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
     )
     RETURNING *,
       CASE WHEN template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file`,
    [
      draftKey,
      fields.name,
      fields.code,
      fields.accessType,
      fields.categorySlug,
      fields.block,
      fields.language,
      fields.price,
      fields.version,
      fields.author,
      Number.isFinite(lawyerId) ? lawyerId : null,
      fields.description,
      filePayload?.fileName || null,
      filePayload?.mimeType || null,
      filePayload?.contentBase64 || null,
      adminUserId || null,
    ]
  );

  return mapLibraryDraftRow(result.rows[0]);
}

export async function updateLibraryDraft(idOrKey, body = {}, file = null) {
  await ensureLibrarySchema();
  const existing = await query(
    `SELECT * FROM library_template_drafts
     WHERE draft_key = $1 OR id::text = $1`,
    [String(idOrKey)]
  );
  const row = existing.rows[0];
  if (!row) throw new LibraryDraftError('Draft not found', 404);

  const { fields, file: filePayload, clearFile } = pickDraftFields(body, file, { partial: true });

  const next = {
    name: fields.name !== undefined ? fields.name : row.name,
    code: fields.code !== undefined ? fields.code : row.code,
    access_type: fields.accessType !== undefined ? fields.accessType : row.access_type,
    category_slug: fields.categorySlug !== undefined ? fields.categorySlug : row.category_slug,
    block: fields.block !== undefined ? fields.block : row.block,
    language: fields.language !== undefined ? fields.language : row.language,
    price: fields.price !== undefined ? fields.price : row.price,
    version: fields.version !== undefined ? fields.version : row.version,
    author: fields.author !== undefined ? fields.author : row.author,
    lawyer_profile_id: fields.lawyerProfileId !== undefined
      ? (fields.lawyerProfileId != null && fields.lawyerProfileId !== ''
        ? Number(fields.lawyerProfileId)
        : null)
      : row.lawyer_profile_id,
    description: fields.description !== undefined ? fields.description : row.description,
    template_file_name: row.template_file_name,
    template_mime_type: row.template_mime_type,
    template_content_base64: row.template_content_base64,
  };

  if (clearFile) {
    next.template_file_name = null;
    next.template_mime_type = null;
    next.template_content_base64 = null;
  }
  if (filePayload?.contentBase64) {
    next.template_file_name = filePayload.fileName || null;
    next.template_mime_type = filePayload.mimeType || null;
    next.template_content_base64 = filePayload.contentBase64;
  }

  assertHasAnyField({
    name: next.name,
    code: next.code,
    accessType: next.access_type,
    categorySlug: next.category_slug,
    block: next.block,
    language: next.language,
    price: next.price,
    version: next.version,
    author: next.author,
    lawyerProfileId: next.lawyer_profile_id,
    description: next.description,
  }, next.template_content_base64 ? { contentBase64: next.template_content_base64 } : null);

  const updated = await query(
    `UPDATE library_template_drafts SET
       name = $2, code = $3, access_type = $4, category_slug = $5, block = $6,
       language = $7, price = $8, version = $9, author = $10, lawyer_profile_id = $11,
       description = $12, template_file_name = $13, template_mime_type = $14,
       template_content_base64 = $15, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *,
       CASE WHEN template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file`,
    [
      row.id,
      next.name,
      next.code,
      next.access_type,
      next.category_slug,
      next.block,
      next.language,
      next.price,
      next.version,
      next.author,
      Number.isFinite(Number(next.lawyer_profile_id)) ? Number(next.lawyer_profile_id) : null,
      next.description,
      next.template_file_name,
      next.template_mime_type,
      next.template_content_base64,
    ]
  );

  return mapLibraryDraftRow(updated.rows[0]);
}

export async function getLibraryDraft(idOrKey) {
  await ensureLibrarySchema();
  const result = await query(
    `SELECT *, CASE WHEN template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
     FROM library_template_drafts
     WHERE draft_key = $1 OR id::text = $1`,
    [String(idOrKey)]
  );
  if (!result.rows[0]) throw new LibraryDraftError('Draft not found', 404);
  return mapLibraryDraftRow(result.rows[0]);
}

export async function deleteLibraryDraft(idOrKey) {
  await ensureLibrarySchema();
  const result = await query(
    `DELETE FROM library_template_drafts
     WHERE draft_key = $1 OR id::text = $1
     RETURNING draft_key`,
    [String(idOrKey)]
  );
  if (!result.rows[0]) throw new LibraryDraftError('Draft not found', 404);
  return { ok: true, id: result.rows[0].draft_key };
}

export async function listLibraryDrafts({ search, page, limit } = {}) {
  await ensureLibrarySchema();
  const paginationInput = parsePagination({ page, limit });
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${String(search).trim()}%`);
    where = `WHERE (
      COALESCE(name,'') ILIKE $1
      OR COALESCE(code,'') ILIKE $1
      OR COALESCE(description,'') ILIKE $1
      OR COALESCE(author,'') ILIKE $1
      OR draft_key ILIKE $1
    )`;
  }

  const count = await query(
    `SELECT COUNT(*)::int AS total FROM library_template_drafts ${where}`,
    params
  );
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ ...paginationInput, totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT *, CASE WHEN template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
     FROM library_template_drafts
     ${where}
     ORDER BY updated_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    documents: rows.rows.map(mapLibraryDraftRow),
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

export async function countLibraryDrafts() {
  await ensureLibrarySchema();
  const result = await query(`SELECT COUNT(*)::int AS total FROM library_template_drafts`);
  return result.rows[0]?.total || 0;
}
