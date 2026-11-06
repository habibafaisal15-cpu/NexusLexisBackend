import { Router } from 'express';
import { authMiddleware, adminMiddleware, getUserId } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';
import * as adminUsers from '../db/adminUsersService.js';

function actor(req) {
  return getUserId(req);
}

function wrap(res, err) {
  return res.status(err.status || 400).json({ error: err.message || 'Request failed' });
}

export function createAdminUsersRouter() {
  const router = Router();
  router.use(authMiddleware, adminMiddleware);

  router.get('/stats', asyncHandler(async (_req, res) => {
    res.json(await adminUsers.getUserStats());
  }));

  router.get('/', asyncHandler(async (req, res) => {
    res.json(await adminUsers.listUsers(req.query || {}));
  }));

  router.post('/bulk', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.bulkUsers(req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/', asyncHandler(async (req, res) => {
    try {
      res.status(201).json(await adminUsers.createUser(req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.getUserDetail(req.params.id));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.updateUser(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.put('/:id/roles', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.setUserRoles(req.params.id, req.body?.roles, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/approve', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.approveUser(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/vault/:docId/reject', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.rejectVaultDoc(req.params.id, req.params.docId, req.body?.reason, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/suspend', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.suspendUser(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/reinstate', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.reinstateUser(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/reset-password', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.resetUserPassword(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/email', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.emailUser(req.params.id, req.body || {}, actor(req)));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.get('/:id/sessions', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.listUserSessions(req.params.id));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.delete('/:id/sessions/:sessionId', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.revokeUserSession(req.params.id, req.params.sessionId));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.post('/:id/sessions/revoke-others', asyncHandler(async (req, res) => {
    try {
      res.json(await adminUsers.revokeAllUserSessions(req.params.id));
    } catch (err) {
      return wrap(res, err);
    }
  }));

  router.get('/:id/matters', asyncHandler(async (req, res) => {
    res.json(await adminUsers.listUserMatters(req.params.id, req.query.page, req.query.pageSize));
  }));

  router.get('/:id/documents', asyncHandler(async (req, res) => {
    res.json(await adminUsers.listUserDocuments(req.params.id, req.query.page, req.query.pageSize));
  }));

  router.get('/:id/payments', asyncHandler(async (req, res) => {
    res.json(await adminUsers.listUserPayments(req.params.id, req.query.page, req.query.pageSize));
  }));

  router.get('/:id/audit', asyncHandler(async (req, res) => {
    res.json(await adminUsers.listUserAudit(req.params.id, req.query.page, req.query.pageSize));
  }));

  return router;
}
