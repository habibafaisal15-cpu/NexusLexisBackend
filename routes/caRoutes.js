import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, getUserId } from '../middleware/auth.js';
import * as pro from '../db/professionalRepository.js';
import { dismissNotification, clearNotifications } from '../db/repository.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

function requireCA(req, res) {

  const userId = getUserId(req);

  if (!userId) {

    res.status(401).json({ error: 'Unauthorized' });

    return null;

  }

  if (req.user.role !== 'ca' && !req.user.roles?.includes('CharteredAccountant')) {

    res.status(403).json({ error: 'CA access required' });

    return null;

  }

  return userId;

}



export function createCaRouter(uploadsDir = 'uploads/') {
  const upload = multer({ dest: uploadsDir });
  const router = Router();



  router.get('/dashboard', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaDashboard(userId));

  }));



  router.get('/subscription', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaSubscription(userId));

  }));



  router.get('/notifications', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaNotifications(userId));

  }));



  router.delete('/notifications/:id', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    await dismissNotification(userId, Number(req.params.id), 'ca');

    res.json({ success: true });

  }));



  router.delete('/notifications', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    await clearNotifications(userId, 'ca');

    res.json({ success: true });

  }));



  router.get('/compliance/deadlines', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaComplianceDeadlines(userId));

  }));



  router.get('/taxation/profiles', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaTaxProfiles(userId));

  }));



  router.post('/taxation/profiles/:profileId/challans', authMiddleware, upload.single('challan'), asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    if (!req.file) {

      res.status(400).json({ error: 'Challan file required' });

      return;

    }

    res.json(await pro.uploadCaTaxChallan(userId, req.params.profileId, req.file));

  }));



  router.get('/orders', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaOrders(userId));

  }));



  router.patch('/orders/:orderId/milestone', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.updateCaOrderMilestone(userId, req.params.orderId, req.body.milestone));

  }));



  router.get('/documents', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaDocuments(userId));

  }));



  router.post('/documents/:documentId/esign', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.triggerCaDocumentESign(userId, req.params.documentId));

  }));



  router.get('/retainers', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaRetainers(userId));

  }));



  router.get('/retainers/:retainerId/tasks', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaRetainerTasks(userId, req.params.retainerId));

  }));



  router.patch('/retainers/tasks/:taskId', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.updateCaRetainerTask(userId, req.params.taskId, req.body));

  }));



  router.get('/appointments', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaAppointments(userId));

  }));



  router.patch('/appointments/:appointmentId', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.updateCaAppointment(userId, req.params.appointmentId, req.body));

  }));



  router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaProfile(userId));

  }));



  router.patch('/profile', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.updateCaProfile(userId, req.body));

  }));



  router.post('/profile/photo', authMiddleware, upload.single('photo'), asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    if (!req.file) {

      res.status(400).json({ error: 'Photo file required' });

      return;

    }

    res.json(await pro.updateCaProfilePhoto(userId, req.file));

  }));



  router.get('/team', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.getCaTeam(userId));

  }));



  router.post('/team', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.status(201).json(await pro.addCaTeamMember(userId, req.body));

  }));



  router.delete('/team/:memberId', authMiddleware, asyncHandler(async (req, res) => {

    const userId = requireCA(req, res);

    if (!userId) return;

    res.json(await pro.removeCaTeamMember(userId, req.params.memberId));

  }));



  return router;

}

