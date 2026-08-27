/**
 * Knowledge Bank content pillars (SEO articles) — NL-BE-KB-CONTENT-001
 * Distinct from free document templates at /knowledge-bank/*.
 */
import { query } from './index.js';
import { ensureAdminPortalSchema } from './ensureAdminPortalSchema.js';
import { buildPaginationMeta } from '../shared/lib/pagination.js';

const PILLARS = new Set(['legal_articles', 'law_summaries', 'free_templates', 'legal_calculators']);
const STATUSES = new Set(['draft', 'published', 'retired']);

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || `article-${Date.now()}`;
}

function mapArticle(row, { includeBody = true } = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    slug: row.slug,
    title: row.title,
    pillar: row.pillar,
    summary: row.summary || '',
    body: includeBody ? (row.body || '') : undefined,
    status: row.status,
    seoTitle: row.seo_title || row.title,
    seoDescription: row.seo_description || row.summary || '',
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    relatedServiceSlugs: Array.isArray(row.related_service_slugs) ? row.related_service_slugs : [],
    coverImage: row.cover_image || null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listKnowledgeArticles(filters = {}, { publicOnly = false } = {}) {
  await ensureAdminPortalSchema();
  let page = Number.parseInt(filters.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(filters.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 50);

  const params = [];
  const where = [];
  if (publicOnly) {
    where.push(`status = 'published'`);
  } else if (filters.status && STATUSES.has(String(filters.status))) {
    params.push(String(filters.status));
    where.push(`status = $${params.length}`);
  }
  if (filters.pillar && PILLARS.has(String(filters.pillar))) {
    params.push(String(filters.pillar));
    where.push(`pillar = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(title ILIKE $${i} OR COALESCE(summary,'') ILIKE $${i} OR slug ILIKE $${i})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM knowledge_articles ${whereSql}`, params);
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ page, limit, totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT * FROM knowledge_articles ${whereSql}
     ORDER BY COALESCE(published_at, updated_at) DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    success: true,
    articles: rows.rows.map((r) => mapArticle(r, { includeBody: !publicOnly })),
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

export async function getKnowledgeArticleBySlug(slugOrId, { publicOnly = false } = {}) {
  await ensureAdminPortalSchema();
  const result = await query(
    `SELECT * FROM knowledge_articles WHERE slug = $1 OR id::text = $1`,
    [String(slugOrId)]
  );
  const row = result.rows[0];
  if (!row) {
    const err = new Error('Article not found');
    err.status = 404;
    throw err;
  }
  if (publicOnly && row.status !== 'published') {
    const err = new Error('Article not found');
    err.status = 404;
    throw err;
  }
  return { success: true, article: mapArticle(row, { includeBody: true }) };
}

export async function createKnowledgeArticle(body = {}) {
  await ensureAdminPortalSchema();
  const title = String(body.title || '').trim();
  if (!title) {
    const err = new Error('title is required');
    err.status = 400;
    throw err;
  }
  const pillar = String(body.pillar || 'legal_articles');
  if (!PILLARS.has(pillar)) {
    const err = new Error(`pillar must be one of: ${[...PILLARS].join(', ')}`);
    err.status = 400;
    throw err;
  }
  let slug = slugify(body.slug || title);
  const existing = await query(`SELECT id FROM knowledge_articles WHERE slug = $1`, [slug]);
  if (existing.rows[0]) slug = `${slug}-${Date.now().toString(36)}`;

  const status = STATUSES.has(body.status) ? body.status : 'draft';
  const publishedAt = status === 'published' ? new Date() : null;

  const result = await query(
    `INSERT INTO knowledge_articles (
       slug, title, pillar, summary, body, status, seo_title, seo_description,
       keywords, related_service_slugs, cover_image, published_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)
     RETURNING *`,
    [
      slug,
      title,
      pillar,
      body.summary || '',
      body.body || '',
      status,
      body.seoTitle || title,
      body.seoDescription || body.summary || '',
      JSON.stringify(Array.isArray(body.keywords) ? body.keywords : []),
      JSON.stringify(Array.isArray(body.relatedServiceSlugs) ? body.relatedServiceSlugs : []),
      body.coverImage || null,
      publishedAt,
    ]
  );
  return { success: true, article: mapArticle(result.rows[0]) };
}

export async function updateKnowledgeArticle(idOrSlug, body = {}) {
  await ensureAdminPortalSchema();
  const existing = await query(
    `SELECT * FROM knowledge_articles WHERE id::text = $1 OR slug = $1`,
    [String(idOrSlug)]
  );
  const row = existing.rows[0];
  if (!row) {
    const err = new Error('Article not found');
    err.status = 404;
    throw err;
  }

  const next = {
    title: body.title != null ? String(body.title).trim() : row.title,
    pillar: body.pillar != null ? String(body.pillar) : row.pillar,
    summary: body.summary != null ? body.summary : row.summary,
    body: body.body != null ? body.body : row.body,
    status: body.status != null ? String(body.status) : row.status,
    seo_title: body.seoTitle != null ? body.seoTitle : row.seo_title,
    seo_description: body.seoDescription != null ? body.seoDescription : row.seo_description,
    keywords: body.keywords != null ? body.keywords : row.keywords,
    related_service_slugs: body.relatedServiceSlugs != null ? body.relatedServiceSlugs : row.related_service_slugs,
    cover_image: body.coverImage !== undefined ? body.coverImage : row.cover_image,
  };

  if (!PILLARS.has(next.pillar)) {
    const err = new Error(`pillar must be one of: ${[...PILLARS].join(', ')}`);
    err.status = 400;
    throw err;
  }
  if (!STATUSES.has(next.status)) {
    const err = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
    err.status = 400;
    throw err;
  }

  let publishedAt = row.published_at;
  if (next.status === 'published' && row.status !== 'published') {
    publishedAt = new Date();
  }
  if (next.status !== 'published') {
    publishedAt = next.status === 'retired' ? row.published_at : null;
  }

  const updated = await query(
    `UPDATE knowledge_articles SET
       title = $2, pillar = $3, summary = $4, body = $5, status = $6,
       seo_title = $7, seo_description = $8,
       keywords = $9::jsonb, related_service_slugs = $10::jsonb,
       cover_image = $11, published_at = $12, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      row.id,
      next.title,
      next.pillar,
      next.summary,
      next.body,
      next.status,
      next.seo_title,
      next.seo_description,
      JSON.stringify(Array.isArray(next.keywords) ? next.keywords : []),
      JSON.stringify(Array.isArray(next.related_service_slugs) ? next.related_service_slugs : []),
      next.cover_image,
      publishedAt,
    ]
  );
  return { success: true, article: mapArticle(updated.rows[0]) };
}

export async function deleteKnowledgeArticle(idOrSlug) {
  await ensureAdminPortalSchema();
  const updated = await query(
    `UPDATE knowledge_articles SET status = 'retired', updated_at = CURRENT_TIMESTAMP
     WHERE id::text = $1 OR slug = $1
     RETURNING *`,
    [String(idOrSlug)]
  );
  if (!updated.rows[0]) {
    const err = new Error('Article not found');
    err.status = 404;
    throw err;
  }
  return { success: true, article: mapArticle(updated.rows[0]) };
}
