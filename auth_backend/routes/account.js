import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';
import * as account from '../../db/accountService.js';

const router = Router();
const upload = multer({ dest: '/tmp' });

function userId(req) {
  return Number(req.user.userId || req.user.sub);
}

router.post('/password', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await account.changePassword(userId(req), req.user.email, req.body || {}));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

router.get('/sessions', authMiddleware, asyncHandler(async (req, res) => {
  const refresh = req.headers['x-refresh-token'] || req.query.refreshToken;
  res.json(await account.listSessions(userId(req), req.user.email, refresh));
}));

router.delete('/sessions/:sessionId', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await account.revokeSession(userId(req), req.user.email, req.params.sessionId));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

router.post('/sessions/revoke-others', authMiddleware, asyncHandler(async (req, res) => {
  const refresh = req.headers['x-refresh-token'] || req.body?.refreshToken;
  res.json(await account.revokeOtherSessions(userId(req), req.user.email, refresh));
}));

router.patch('/preferences', authMiddleware, asyncHandler(async (req, res) => {
  try {
    res.json(await account.updatePreferences(userId(req), req.user.email, req.body || {}));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

router.get('/vault', authMiddleware, asyncHandler(async (req, res) => {
  const { listVaultForUser } = await import('../../db/vaultHelper.js');
  res.json({ items: await listVaultForUser(userId(req)) });
}));

router.post('/client/photo', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  try {
    res.json(await account.updateClientPhoto(userId(req), req.file));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
}));

export default router;
