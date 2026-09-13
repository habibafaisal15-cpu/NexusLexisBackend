import { Router } from 'express';
import multer from 'multer';
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
  return res.status(status).json({ success: false, error: err.message });
}

function setPdfCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function sendPdf(res, file, { download = false } = {}) {
  setPdfCors(res);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${file.fileName.replace(/"/g, '')}"`
  );
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(file.buffer);
}

export function createPublicKnowledgeReadsRouter() {
  const router = Router();

  router.options('/articles/:slug/file', (_req, res) => {
    setPdfCors(res);
    return res.sendStatus(204);
  });
  router.options('/summaries/:slug/file', (_req, res) => {
    setPdfCors(res);
    return res.sendStatus(204);
  });
  router.options('/judgements/:slug/file', (_req, res) => {
    setPdfCors(res);
    return res.sendStatus(204);
  });

  router.get('/articles', asyncHandler(async (req, res) => {
    const { listPublicArticles } = await import('../db/knowledgeReadsService.js');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listPublicArticles({
      search: req.query.search,
      publicBaseUrl: publicBase(req),
    }));
  }));

  router.get('/summaries', asyncHandler(async (req, res) => {
    const { listPublicSummaries, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await listPublicSummaries({
        tag: req.query.tag,
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/judgements', asyncHandler(async (req, res) => {
    const { listPublicJudgements } = await import('../db/knowledgeReadsService.js');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listPublicJudgements({ publicBaseUrl: publicBase(req) }));
  }));

  router.get('/reads', asyncHandler(async (req, res) => {
    const pillar = String(req.query.pillar || '').toLowerCase();
    const base = publicBase(req);
    const {
      listPublicArticles,
      listPublicSummaries,
      listPublicJudgements,
      KnowledgeReadError,
    } = await import('../db/knowledgeReadsService.js');
    try {
      if (pillar === 'articles') return res.json(await listPublicArticles({ publicBaseUrl: base }));
      if (pillar === 'summaries') return res.json(await listPublicSummaries({ tag: req.query.tag, publicBaseUrl: base }));
      if (pillar === 'judgements') return res.json(await listPublicJudgements({ publicBaseUrl: base }));
      return res.status(422).json({
        success: false,
        error: 'Validation failed',
        message: 'pillar must be articles|summaries|judgements',
        fields: { pillar: 'required' },
      });
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  for (const pillar of ['articles', 'summaries', 'judgements']) {
    router.get(`/${pillar}/:slug`, asyncHandler(async (req, res) => {
      const { getPublishedBySlug, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
      try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await getPublishedBySlug(pillar, req.params.slug, { publicBaseUrl: publicBase(req) }));
      } catch (err) {
        if (err instanceof KnowledgeReadError) return sendError(res, err);
        throw err;
      }
    }));

    router.get(`/${pillar}/:slug/file`, asyncHandler(async (req, res) => {
      const { getPublishedFile, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
      try {
        const file = await getPublishedFile(pillar, req.params.slug);
        sendPdf(res, file, { download: req.query.download === '1' });
      } catch (err) {
        if (err instanceof KnowledgeReadError) return sendError(res, err);
        throw err;
      }
    }));

    router.head(`/${pillar}/:slug/file`, asyncHandler(async (req, res) => {
      const { getPublishedFile, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
      try {
        const file = await getPublishedFile(pillar, req.params.slug);
        setPdfCors(res);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', file.buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.status(200).end();
      } catch (err) {
        if (err instanceof KnowledgeReadError) return sendError(res, err);
        throw err;
      }
    }));
  }

  return router;
}

export function createAdminKnowledgeReadsRouter() {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  router.use(authMiddleware, adminMiddleware);

  router.get('/entries', asyncHandler(async (req, res) => {
    const { listAdminEntries } = await import('../db/knowledgeReadsService.js');
    res.json(await listAdminEntries(req.query || {}, { publicBaseUrl: publicBase(req) }));
  }));

  router.get('/entries/:id', asyncHandler(async (req, res) => {
    const { getKnowledgeReadById, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      res.json(await getKnowledgeReadById(req.params.id, { publicBaseUrl: publicBase(req) }));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/entries', upload.single('file'), asyncHandler(async (req, res) => {
    const { createKnowledgeRead, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      const result = await createKnowledgeRead(
        req.body || {},
        req.file || null,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.patch('/entries/:id', asyncHandler(async (req, res) => {
    const { updateKnowledgeRead, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      res.json(await updateKnowledgeRead(
        req.params.id,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.patch('/entries/:id/status', asyncHandler(async (req, res) => {
    const { patchKnowledgeReadStatus, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      const status = req.body?.status;
      res.json(await patchKnowledgeReadStatus(
        req.params.id,
        status,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/entries/:id/file', upload.single('file'), asyncHandler(async (req, res) => {
    const { uploadKnowledgeReadFile, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      res.json(await uploadKnowledgeReadFile(
        req.params.id,
        req.file,
        { fileName: req.body?.fileName },
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.delete('/entries/:id/file', asyncHandler(async (req, res) => {
    const { deleteKnowledgeReadFile, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      res.json(await deleteKnowledgeReadFile(
        req.params.id,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/entries/:id/file', asyncHandler(async (req, res) => {
    const { getAdminFile, KnowledgeReadError } = await import('../db/knowledgeReadsService.js');
    try {
      const file = await getAdminFile(req.params.id);
      sendPdf(res, file, { download: req.query.download === '1' });
    } catch (err) {
      if (err instanceof KnowledgeReadError) return sendError(res, err);
      throw err;
    }
  }));

  router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: err.code === 'LIMIT_FILE_SIZE' ? 'PDF too large — cap 15 MB' : err.message,
      });
    }
    return res.status(400).json({ success: false, error: err.message || 'Request failed' });
  });

  return router;
}
