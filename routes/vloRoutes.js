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
  return res.status(status).json({ success: false, error: err.message, message: err.message });
}

function filePayload(file) {
  if (!file) return null;
  return {
    fileName: file.originalname || 'upload.bin',
    mimeType: file.mimetype || 'application/octet-stream',
    buffer: file.buffer,
    contentBase64: file.buffer.toString('base64'),
  };
}

/** Client + public VLO routes mounted at /api/v2/vlo */
export function createVloRouter() {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Public catalogue
  router.get('/plans', asyncHandler(async (_req, res) => {
    const { listVloPlans } = await import('../db/vloService.js');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await listVloPlans());
  }));

  // Client subscription
  router.get('/subscription', authMiddleware, asyncHandler(async (req, res) => {
    const { getClientSubscription, VloError } = await import('../db/vloService.js');
    try {
      res.json(await getClientSubscription(getUserId(req)));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/subscribe', authMiddleware, asyncHandler(async (req, res) => {
    const { subscribeToVlo, VloError } = await import('../db/vloService.js');
    try {
      const result = await subscribeToVlo(getUserId(req), req.body || {});
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/subscription/cancel', authMiddleware, asyncHandler(async (req, res) => {
    const { cancelClientSubscription, VloError } = await import('../db/vloService.js');
    try {
      res.json(await cancelClientSubscription(getUserId(req)));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  // Client matters
  router.get('/matters', authMiddleware, asyncHandler(async (req, res) => {
    const { listClientMatters, VloError } = await import('../db/vloService.js');
    try {
      res.json(await listClientMatters(getUserId(req), { publicBaseUrl: publicBase(req) }));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/matters/:id', authMiddleware, asyncHandler(async (req, res) => {
    const { getClientMatter, VloError } = await import('../db/vloService.js');
    try {
      res.json(await getClientMatter(getUserId(req), req.params.id, { publicBaseUrl: publicBase(req) }));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/matters', authMiddleware, upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 10 },
  ]), asyncHandler(async (req, res) => {
    const { createClientMatter, VloError } = await import('../db/vloService.js');
    try {
      const fromFile = req.files?.file?.[0];
      const fromFiles = req.files?.files?.[0];
      const file = filePayload(fromFile || fromFiles || null);
      const result = await createClientMatter(
        getUserId(req),
        {
          title: req.body?.title,
          description: req.body?.description,
          file,
        },
        { publicBaseUrl: publicBase(req) }
      );
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/matters/:id/file', authMiddleware, asyncHandler(async (req, res) => {
    const { getMatterFile, VloError } = await import('../db/vloService.js');
    try {
      const kind = req.query.kind === 'completed' ? 'completed' : 'intake';
      const file = await getMatterFile(req.params.id, {
        kind,
        clientId: getUserId(req),
      });
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
      res.send(file.buffer);
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/matters/:id/download', authMiddleware, asyncHandler(async (req, res) => {
    const { getClientMatter, getMatterFile, VloError } = await import('../db/vloService.js');
    try {
      // Prefer completed binary; else generate text opinion fallback
      try {
        const file = await getMatterFile(req.params.id, {
          kind: 'completed',
          clientId: getUserId(req),
        });
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
        return res.send(file.buffer);
      } catch {
        const matter = (await getClientMatter(getUserId(req), req.params.id)).data;
        const filename = `${String(matter.title || 'matter').replace(/[^a-z0-9]+/gi, '_')}_opinion.txt`;
        const content = [
          'NEXUSLEXIS CONFIDENTIAL ADVISORY OPINION',
          '========================================',
          '',
          `Matter: ${matter.title}`,
          `Date: ${matter.date}`,
          `Status: ${matter.statusLabel || matter.status}`,
          '',
          'DESCRIPTION',
          matter.description,
          '',
          matter.opinion ? `OPINION\n${matter.opinion}` : 'Opinion pending counsel review.',
          '',
          '--- End of Document ---',
        ].join('\n');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(content);
      }
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  return router;
}

/** Admin VLO routes mounted at /api/v2/admin/vlo */
export function createAdminVloRouter() {
  const router = Router();
  router.use(authMiddleware, adminMiddleware);

  router.get('/stats', asyncHandler(async (_req, res) => {
    const { getAdminVloStats } = await import('../db/vloService.js');
    res.json(await getAdminVloStats());
  }));

  router.get('/subscriptions', asyncHandler(async (req, res) => {
    const { listAdminSubscriptions } = await import('../db/vloService.js');
    res.json(await listAdminSubscriptions(req.query || {}, { publicBaseUrl: publicBase(req) }));
  }));

  router.get('/subscriptions/:id', asyncHandler(async (req, res) => {
    const { getAdminSubscription, VloError } = await import('../db/vloService.js');
    try {
      res.json(await getAdminSubscription(req.params.id));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/subscriptions/:id/assign-lawyer', asyncHandler(async (req, res) => {
    const { assignLawyerToSubscription, VloError } = await import('../db/vloService.js');
    try {
      res.json(await assignLawyerToSubscription(req.params.id, req.body || {}, getUserId(req)));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  return router;
}

/** Lawyer VLO helpers — used from lawyerRoutes */
export function attachLawyerVloRoutes(router, { requireLawyer }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  router.get('/vlo/subscribers', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { listLawyerSubscribers } = await import('../db/vloService.js');
    res.json(await listLawyerSubscribers(userId));
  }));

  router.get('/vlo/subscribers/:subscriberId/matters', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { listLawyerMattersForSubscriber } = await import('../db/vloService.js');
    res.json(await listLawyerMattersForSubscriber(userId, req.params.subscriberId, {
      publicBaseUrl: publicBase(req),
    }));
  }));

  router.patch('/vlo/matters/:matterId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { updateLawyerMatter, VloError } = await import('../db/vloService.js');
    try {
      res.json(await updateLawyerMatter(userId, req.params.matterId, req.body || {}, {
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/vlo/matters/:matterId/notes', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { updateLawyerMatter, VloError } = await import('../db/vloService.js');
    try {
      res.json(await updateLawyerMatter(userId, req.params.matterId, {
        lawyerNotes: req.body?.note ?? req.body?.lawyerNotes ?? req.body?.opinion,
        status: req.body?.status,
      }, { publicBaseUrl: publicBase(req) }));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.post('/vlo/matters/:matterId/upload', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { uploadMatterCompletedFile, VloError } = await import('../db/vloService.js');
    try {
      res.json(await uploadMatterCompletedFile(userId, req.params.matterId, filePayload(req.file), {
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));

  router.get('/vlo/matters/:matterId/file', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { getMatterFile, VloError } = await import('../db/vloService.js');
    try {
      const kind = req.query.kind === 'completed' ? 'completed' : 'intake';
      const file = await getMatterFile(req.params.matterId, { kind, lawyerUserId: userId });
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
      res.send(file.buffer);
    } catch (err) {
      if (err instanceof VloError) return sendError(res, err);
      throw err;
    }
  }));
}
