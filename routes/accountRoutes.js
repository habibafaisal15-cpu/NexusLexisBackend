import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, getUserId } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';
import * as account from '../db/accountService.js';

export function createAccountRouter(uploadsDir = 'uploads/') {
  const upload = multer({ dest: uploadsDir });
  const router = Router();

  function handle(res, err) {
    return res.status(err.status || 400).json({ error: err.message || 'Request failed' });
  }

  router.get('/client/profile', authMiddleware, asyncHandler(async (req, res) => {
    try {
      res.json(await account.getClientProfilePayload(getUserId(req)));
    } catch (err) {
      return handle(res, err);
    }
  }));

  router.post('/client/profile/photo', authMiddleware, upload.single('file'), asyncHandler(async (req, res) => {
    const file = req.file || null;
    if (!file) return res.status(400).json({ error: 'file is required' });
    try {
      res.json(await account.updateClientPhoto(getUserId(req), file));
    } catch (err) {
      return handle(res, err);
    }
  }));

  router.post('/account/password', authMiddleware, asyncHandler(async (req, res) => {
    try {
      res.json(await account.changePassword(getUserId(req), req.user.email, req.body || {}));
    } catch (err) {
      return handle(res, err);
    }
  }));

  router.get('/account/sessions', authMiddleware, asyncHandler(async (req, res) => {
    const refresh = req.headers['x-refresh-token'] || req.body?.refreshToken || req.query.refreshToken;
    res.json(await account.listSessions(getUserId(req), req.user.email, refresh));
  }));

  router.delete('/account/sessions/:sessionId', authMiddleware, asyncHandler(async (req, res) => {
    try {
      res.json(await account.revokeSession(getUserId(req), req.user.email, req.params.sessionId));
    } catch (err) {
      return handle(res, err);
    }
  }));

  router.post('/account/sessions/revoke-others', authMiddleware, asyncHandler(async (req, res) => {
    try {
      const refresh = req.headers['x-refresh-token'] || req.body?.refreshToken;
      res.json(await account.revokeOtherSessions(getUserId(req), req.user.email, refresh));
    } catch (err) {
      return handle(res, err);
    }
  }));

  router.patch('/account/preferences', authMiddleware, asyncHandler(async (req, res) => {
    try {
      res.json(await account.updatePreferences(getUserId(req), req.user.email, req.body || {}));
    } catch (err) {
      return handle(res, err);
    }
  }));

  return router;
}
