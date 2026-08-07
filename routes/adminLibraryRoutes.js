import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';
import * as repo from '../db/repository.js';

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

export function createAdminLibraryRouter() {
  const router = Router();
  const upload = createUpload();

  router.use(authMiddleware, adminMiddleware);

  router.get('/catalog', asyncHandler(async (_req, res) => {
    res.json(await repo.getLibraryCatalog({ includeInactive: true }));
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

  router.post(
    '/templates',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const intakeSchema = parseJsonField(req.body.intakeSchema, undefined);
      const template = await repo.createLibraryTemplate({
        name: req.body.name,
        slug: req.body.slug,
        categorySlug: req.body.categorySlug,
        categoryId: req.body.categoryId,
        price: req.body.price,
        deliveryDays: req.body.deliveryDays,
        description: req.body.description,
        intakeSchema,
        isActive: req.body.isActive !== 'false' && req.body.isActive !== false,
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
        isActive: req.body.isActive,
        clearFile: req.body.clearFile === true || req.body.clearFile === 'true',
        file: filePayload(req.file),
      });
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
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
