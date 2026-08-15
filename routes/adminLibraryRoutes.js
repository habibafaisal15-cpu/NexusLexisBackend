import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';
import * as repo from '../db/repository.js';
import { parsePagination } from '../shared/lib/pagination.js';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
]);

const MAX_BYTES = 5 * 1024 * 1024;

function createUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
    fileFilter(_req, file, cb) {
      const mime = file.mimetype || 'application/octet-stream';
      if (ALLOWED_MIME.has(mime) || mime === 'application/octet-stream') {
        return cb(null, true);
      }
      return cb(new Error('Unsupported template file type. Use PDF, DOC, DOCX, TXT, PNG, or JPG.'));
    },
  });
}

function parseJsonField(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error('intakeSchema must be valid JSON');
  }
}

function filePayload(file) {
  if (!file) return null;
  return {
    fileName: file.originalname || 'template.bin',
    mimeType: file.mimetype || 'application/octet-stream',
    contentBase64: file.buffer.toString('base64'),
  };
}

function parseAccessType(value, fallback = 'paid') {
  const raw = String(value || '').toLowerCase().trim();
  if (['public', 'knowledge_bank', 'knowledge-bank', 'free'].includes(raw)) return 'public';
  if (['paid', 'library', 'client'].includes(raw)) return 'paid';
  return fallback;
}

function parseBoolean(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'active'].includes(raw)) return true;
  if (['false', '0', 'no', 'inactive'].includes(raw)) return false;
  return fallback;
}

export function createAdminLibraryRouter() {
  const router = Router();
  const upload = createUpload();

  router.use(authMiddleware, adminMiddleware);

  router.get('/catalog', asyncHandler(async (req, res) => {
    const accessType = req.query.accessType
      ? parseAccessType(req.query.accessType, null)
      : null;
    const { page, limit } = parsePagination(req.query);
    res.json(await repo.getLibraryCatalog({
      includeInactive: true,
      accessType: accessType || undefined,
      category: req.query.category,
      search: req.query.search,
      block: req.query.block,
      language: req.query.language || req.query.lang,
      paginate: true,
      page,
      limit,
    }));
  }));

  router.post('/categories', asyncHandler(async (req, res) => {
    const category = await repo.createLibraryCategory({
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description,
      icon: req.body.icon,
      displayOrder: req.body.displayOrder,
    });
    res.status(201).json({ category });
  }));

  router.get('/categories', asyncHandler(async (_req, res) => {
    res.json({ categories: await repo.listLibraryCategories() });
  }));

  router.put('/categories/:idOrSlug', asyncHandler(async (req, res) => {
    const category = await repo.updateLibraryCategory(req.params.idOrSlug, {
      name: req.body.name,
      slug: req.body.slug,
      description: req.body.description,
      icon: req.body.icon,
      displayOrder: req.body.displayOrder,
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ category });
  }));

  router.delete('/categories/:idOrSlug', asyncHandler(async (req, res) => {
    try {
      const ok = await repo.deleteLibraryCategory(req.params.idOrSlug);
      if (!ok) return res.status(404).json({ error: 'Category not found' });
      res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }));

  router.post(
    '/templates',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const intakeSchema = parseJsonField(req.body.intakeSchema, undefined);
      const accessType = parseAccessType(req.body.accessType || req.body.type, 'paid');
      const template = await repo.createLibraryTemplate({
        name: req.body.name,
        slug: req.body.slug,
        categorySlug: req.body.categorySlug,
        categoryId: req.body.categoryId,
        price: req.body.price,
        deliveryDays: req.body.deliveryDays,
        description: req.body.description,
        intakeSchema,
        accessType,
        code: req.body.code,
        block: req.body.block,
        language: req.body.language || req.body.lang,
        author: req.body.author || req.body.lawyer,
        lawyerProfileId: req.body.lawyerProfileId
          || req.body.lawyerId
          || req.body.authorProfileId,
        version: req.body.version,
        isActive: parseBoolean(req.body.isActive ?? req.body.active, true),
        file: filePayload(req.file),
      });
      res.status(201).json({ template });
    })
  );

  router.put(
    '/templates/:idOrSlug',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const intakeSchema = parseJsonField(req.body.intakeSchema, undefined);
      const template = await repo.updateLibraryTemplate(req.params.idOrSlug, {
        name: req.body.name,
        slug: req.body.slug,
        categorySlug: req.body.categorySlug,
        categoryId: req.body.categoryId,
        price: req.body.price,
        deliveryDays: req.body.deliveryDays,
        description: req.body.description,
        intakeSchema,
        accessType: req.body.accessType !== undefined || req.body.type !== undefined
          ? parseAccessType(req.body.accessType || req.body.type, 'paid')
          : undefined,
        code: req.body.code,
        block: req.body.block,
        language: req.body.language || req.body.lang,
        author: req.body.author || req.body.lawyer,
        lawyerProfileId: req.body.lawyerProfileId
          ?? req.body.lawyerId
          ?? req.body.authorProfileId,
        version: req.body.version,
        isActive: parseBoolean(req.body.isActive ?? req.body.active),
        clearFile: req.body.clearFile === true || req.body.clearFile === 'true',
        file: filePayload(req.file),
      });
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      res.json({ template });
    })
  );

  router.patch(
    '/templates/:idOrSlug',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const template = await repo.updateLibraryTemplate(req.params.idOrSlug, {
        name: req.body.name,
        slug: req.body.slug,
        categorySlug: req.body.categorySlug,
        categoryId: req.body.categoryId,
        price: req.body.price,
        deliveryDays: req.body.deliveryDays,
        description: req.body.description,
        intakeSchema: parseJsonField(req.body.intakeSchema, undefined),
        accessType: req.body.accessType !== undefined || req.body.type !== undefined
          ? parseAccessType(req.body.accessType || req.body.type, 'paid')
          : undefined,
        code: req.body.code,
        block: req.body.block,
        language: req.body.language || req.body.lang,
        author: req.body.author || req.body.lawyer,
        lawyerProfileId: req.body.lawyerProfileId
          ?? req.body.lawyerId
          ?? req.body.authorProfileId,
        version: req.body.version,
        isActive: parseBoolean(req.body.isActive ?? req.body.active),
        clearFile: parseBoolean(req.body.clearFile, false),
        file: filePayload(req.file),
      });
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json({ template });
    })
  );

  router.delete('/templates/:idOrSlug', asyncHandler(async (req, res) => {
    const template = await repo.deactivateLibraryTemplate(req.params.idOrSlug);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ ok: true, template });
  }));

  router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Template file must be 5MB or smaller'
        : err.message;
      return res.status(400).json({ error: message });
    }
    const message = err.message || 'Admin library request failed';
    res.status(400).json({ error: message });
  });

  return router;
}
