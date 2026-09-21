import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, adminMiddleware, getUserId } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

const MAX_BOOK_FILE_BYTES = 25 * 1024 * 1024;

function publicBase(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return null;
  return `${proto}://${host}`;
}

function sendError(res, err) {
  const status = err.status || 400;
  if (err.extra && Object.keys(err.extra).length) {
    return res.status(status).json({ success: false, ...err.extra, message: err.extra.message || err.message });
  }
  return res.status(status).json({ success: false, error: err.message, message: err.message });
}

function sendVolumeFile(res, file, { download = false } = {}) {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${String(file.fileName || 'volume').replace(/"/g, '')}"`
  );
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(file.buffer);
}

function createUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BOOK_FILE_BYTES },
  });
}

export function createPublicLawBooksRouter() {
  const router = Router();

  router.get('/books', asyncHandler(async (req, res) => {
    const { listPublicLawBooks } = await import('../db/lawBooksService.js');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listPublicLawBooks(req.query || {}, { publicBaseUrl: publicBase(req) }));
  }));

  router.get('/books/:idOrSlug', asyncHandler(async (req, res) => {
    const { getLawBookByIdOrSlug, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await getLawBookByIdOrSlug(req.params.idOrSlug, {
        publicOnly: true,
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/books/:idOrSlug/file', asyncHandler(async (req, res) => {
    const { getLawBookFile, LawBookError } = await import('../db/lawBooksService.js');
    try {
      const file = await getLawBookFile(req.params.idOrSlug, { publicOnly: true });
      sendVolumeFile(res, file, { download: req.query.download === '1' });
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  return router;
}

export function createAdminLawBooksRouter() {
  const router = Router();
  const upload = createUpload();
  router.use(authMiddleware, adminMiddleware);

  router.get('/books', asyncHandler(async (req, res) => {
    const { listAdminLawBooks } = await import('../db/lawBooksService.js');
    res.json(await listAdminLawBooks(req.query || {}, { publicBaseUrl: publicBase(req) }));
  }));

  router.get('/books/:idOrSlug', asyncHandler(async (req, res) => {
    const { getLawBookByIdOrSlug, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await getLawBookByIdOrSlug(req.params.idOrSlug, {
        publicOnly: false,
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/books', upload.single('file'), asyncHandler(async (req, res) => {
    const { createLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      const result = await createLawBook(
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req), file: req.file || null }
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.put('/books/:idOrSlug', upload.single('file'), asyncHandler(async (req, res) => {
    const { updateLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await updateLawBook(
        req.params.idOrSlug,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req), file: req.file || null }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.patch('/books/:idOrSlug', upload.single('file'), asyncHandler(async (req, res) => {
    const { updateLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await updateLawBook(
        req.params.idOrSlug,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req), file: req.file || null }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.patch('/books/:idOrSlug/status', asyncHandler(async (req, res) => {
    const { patchLawBookStatus, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await patchLawBookStatus(
        req.params.idOrSlug,
        req.body?.status,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/books/:idOrSlug/file', upload.single('file'), asyncHandler(async (req, res) => {
    const { uploadLawBookFile, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await uploadLawBookFile(
        req.params.idOrSlug,
        req.file,
        { fileName: req.body?.fileName },
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.delete('/books/:idOrSlug/file', asyncHandler(async (req, res) => {
    const { deleteLawBookFile, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await deleteLawBookFile(
        req.params.idOrSlug,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/books/:idOrSlug/file', asyncHandler(async (req, res) => {
    const { getLawBookFile, LawBookError } = await import('../db/lawBooksService.js');
    try {
      const file = await getLawBookFile(req.params.idOrSlug, { publicOnly: false });
      sendVolumeFile(res, file, { download: req.query.download === '1' });
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.delete('/books/:idOrSlug', asyncHandler(async (req, res) => {
    const { deleteLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      const hard = req.query.hard === 'true' || req.query.hard === '1';
      res.json(await deleteLawBook(req.params.idOrSlug, { hard }));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
      return res.status(status).json({
        success: false,
        error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large — cap 25 MB' : err.message,
        message: err.code === 'LIMIT_FILE_SIZE' ? 'File too large — cap 25 MB' : err.message,
      });
    }
    return res.status(400).json({ success: false, error: err.message || 'Request failed' });
  });

  return router;
}
