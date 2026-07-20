import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  listPendingApplications,
  getApplicationDetails,
  approveApplication,
  rejectApplication,
} from '../services/adminService.js';
import { asyncHandler } from '../../shared/lib/asyncHandler.js';

const router = Router();

router.get('/applications', authMiddleware, adminMiddleware, asyncHandler(async (_req, res) => {
  res.json(await listPendingApplications());
}));

router.get('/applications/:userId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (!type || !['lawyer', 'ca'].includes(String(type))) {
    return res.status(400).json({ error: 'Query param type=lawyer or type=ca is required' });
  }
  res.json(await getApplicationDetails(Number(req.params.userId), String(type)));
}));

router.post('/applications/:userId/approve', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'Application type is required (lawyer or ca)' });
  }
  res.json(await approveApplication(Number(req.params.userId), type));
}));

router.post('/applications/:userId/reject', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!type) {
    return res.status(400).json({ error: 'Application type is required (lawyer or ca)' });
  }
  res.json(await rejectApplication(Number(req.params.userId), type));
}));

router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Admin request failed' });
});

export default router;
