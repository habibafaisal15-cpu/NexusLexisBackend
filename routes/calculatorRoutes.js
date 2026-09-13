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

function sendCalcError(res, err) {
  const status = err.status || 400;
  const body = err.extra && Object.keys(err.extra).length
    ? { success: false, ...err.extra, message: err.extra.message || err.message }
    : { success: false, error: err.message };
  if (!body.error && err.message) body.error = err.message;
  return res.status(status).json(body);
}

export function createPublicCalculatorRouter() {
  const router = Router();

  router.get('/calculators', asyncHandler(async (req, res) => {
    const { listCalculators } = await import('../db/calculatorService.js');
    const payload = await listCalculators({ publicOnly: true, publicBaseUrl: publicBase(req) });
    res.setHeader('Cache-Control', 'no-store');
    res.json(payload);
  }));

  router.get('/calculators/:id', asyncHandler(async (req, res) => {
    const { getCalculator, CalculatorError } = await import('../db/calculatorService.js');
    try {
      const payload = await getCalculator(req.params.id, {
        publicOnly: true,
        publicBaseUrl: publicBase(req),
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(payload);
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.get('/calculators/:id/resource.pdf', asyncHandler(async (req, res) => {
    const { getCalculatorResourceFile, CalculatorError } = await import('../db/calculatorService.js');
    try {
      const file = await getCalculatorResourceFile(req.params.id);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(file.buffer);
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  return router;
}

export function createAdminCalculatorRouter() {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  router.use(authMiddleware, adminMiddleware);

  router.get('/calculators', asyncHandler(async (req, res) => {
    const { listCalculators } = await import('../db/calculatorService.js');
    res.json(await listCalculators({ publicOnly: false, publicBaseUrl: publicBase(req) }));
  }));

  router.get('/calculators/:id', asyncHandler(async (req, res) => {
    const { getCalculator, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await getCalculator(req.params.id, {
        publicOnly: false,
        publicBaseUrl: publicBase(req),
      }));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.put('/calculators/:id', asyncHandler(async (req, res) => {
    const { replaceCalculator, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await replaceCalculator(
        req.params.id,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.put('/calculators/:id/groups/:groupId', asyncHandler(async (req, res) => {
    const { replaceCalculatorGroup, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await replaceCalculatorGroup(
        req.params.id,
        req.params.groupId,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.patch('/calculators/:id', asyncHandler(async (req, res) => {
    const { patchCalculator, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await patchCalculator(
        req.params.id,
        req.body || {},
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.post('/calculators/:id/resource', upload.single('file'), asyncHandler(async (req, res) => {
    const { uploadCalculatorResource, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await uploadCalculatorResource(
        req.params.id,
        {
          file: req.file,
          heading: req.body?.heading,
          fileName: req.body?.fileName,
        },
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.delete('/calculators/:id/resource', asyncHandler(async (req, res) => {
    const { deleteCalculatorResource, CalculatorError } = await import('../db/calculatorService.js');
    try {
      res.json(await deleteCalculatorResource(
        req.params.id,
        getUserId(req),
        { publicBaseUrl: publicBase(req) }
      ));
    } catch (err) {
      if (err instanceof CalculatorError) return sendCalcError(res, err);
      throw err;
    }
  }));

  router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: err.code === 'LIMIT_FILE_SIZE' ? 'PDF too large — cap 10 MB' : err.message,
      });
    }
    return res.status(400).json({ success: false, error: err.message || 'Request failed' });
  });

  return router;
}
