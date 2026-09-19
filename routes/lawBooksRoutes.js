import { Router } from 'express';
import { authMiddleware, adminMiddleware, getUserId } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

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

  return router;
}

export function createAdminLawBooksRouter() {
  const router = Router();
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

  router.post('/books', asyncHandler(async (req, res) => {
    const { createLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      const result = await createLawBook(req.body || {}, getUserId(req), { publicBaseUrl: publicBase(req) });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.put('/books/:idOrSlug', asyncHandler(async (req, res) => {
    const { updateLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await updateLawBook(
        req.params.idOrSlug,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof LawBookError) return sendError(res, err);
      throw err;
    }
  }));

  router.patch('/books/:idOrSlug', asyncHandler(async (req, res) => {
    const { updateLawBook, LawBookError } = await import('../db/lawBooksService.js');
    try {
      res.json(await updateLawBook(
        req.params.idOrSlug,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
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

  return router;
}
