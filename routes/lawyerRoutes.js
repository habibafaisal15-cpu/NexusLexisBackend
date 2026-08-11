import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, getUserId } from '../middleware/auth.js';
import * as pro from '../db/professionalRepository.js';
import { dismissNotification, clearNotifications } from '../db/repository.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

function requireLawyer(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const roleHeader = req.headers['x-client-role'];
  const isLawyerContext =
    req.user.role === 'lawyer' ||
    req.user.activeRole === 'lawyer' ||
    req.user.roles?.includes('LegalAdvocate') ||
    roleHeader === 'LegalAdvocate';
  if (!isLawyerContext) {
    res.status(403).json({ error: 'Lawyer access required' });
    return null;
  }
  return userId;
}

export function createLawyerRouter(lexApiUrl, uploadsDir = 'uploads/') {
  const upload = multer({ dest: uploadsDir });
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  });
  const router = Router();

  router.get('/dashboard', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerDashboard(userId));
  }));

  router.get('/subscription', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerSubscription(userId));
  }));

  router.get('/notifications', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerNotifications(userId));
  }));

  router.delete('/notifications/:id', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    await dismissNotification(userId, Number(req.params.id), 'lawyer');
    res.json({ success: true });
  }));

  router.delete('/notifications', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    await clearNotifications(userId, 'lawyer');
    res.json({ success: true });
  }));

  router.get('/appointments', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerAppointments(userId));
  }));

  router.patch('/appointments/:appointmentId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    try {
      res.json(await pro.updateLawyerAppointment(userId, req.params.appointmentId, req.body));
    } catch (err) {
      const status = err.status || 400;
      return res.status(status).json({ error: err.message, ...(err.extra || {}) });
    }
  }));

  router.post('/appointments/:appointmentId/deliver', authMiddleware, memoryUpload.single('file'), asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const profile = await pro.ensureLawyerProfile(userId);
    const { deliverCustomDraft } = await import('../db/appointmentService.js');
    try {
      const result = await deliverCustomDraft(userId, profile.id, req.params.appointmentId, {
        file: req.file,
        title: req.body?.title,
        notes: req.body?.notes,
      });
      res.status(201).json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, ...(err.extra || {}) });
    }
  }));

  router.get('/availability', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const profile = await pro.ensureLawyerProfile(userId);
    const { getLawyerAvailabilitySettings } = await import('../db/appointmentService.js');
    res.json(await getLawyerAvailabilitySettings(profile.id));
  }));

  router.put('/availability', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const profile = await pro.ensureLawyerProfile(userId);
    const { setLawyerAvailabilitySettings } = await import('../db/appointmentService.js');
    res.json(await setLawyerAvailabilitySettings(profile.id, req.body || {}));
  }));

  router.get('/orders', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerOrders(userId));
  }));

  router.post('/orders/:orderId/deliver', authMiddleware, memoryUpload.single('document'), asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    const { deliverLawyerOrder } = await import('../db/appointmentService.js');
    try {
      const result = await deliverLawyerOrder(userId, req.params.orderId, req.file);
      if (!result) return res.status(404).json({ error: 'Order not found' });
      res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/orders/:orderId/esign', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ success: true, sessionId: `esign-${req.params.orderId}-${Date.now()}` });
  }));

  router.get('/vlo/subscribers', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getVloSubscribers(userId));
  }));

  router.get('/vlo/subscribers/:subscriberId/matters', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getVloMattersForSubscriber(userId, req.params.subscriberId));
  }));

  router.patch('/vlo/matters/:matterId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ success: true, matterId: req.params.matterId, ...req.body });
  }));

  router.post('/vlo/matters/:matterId/notes', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ success: true, note: req.body.note });
  }));

  router.get('/clients', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerClients(userId));
  }));

  router.get('/clients/:clientId/history', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ history: [{ type: 'appointment', date: '2026-07-01', summary: 'Initial consultation' }] });
  }));

  router.get('/earnings', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerEarnings(userId));
  }));

  router.get('/cases', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerCases(userId));
  }));

  router.post('/cases', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.status(201).json(await pro.saveLawyerCase(userId, req.body));
  }));

  router.patch('/cases/:caseId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.saveLawyerCase(userId, req.body, req.params.caseId));
  }));

  router.delete('/cases/:caseId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.deleteLawyerCase(userId, req.params.caseId));
  }));

  router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerProfile(userId));
  }));

  router.patch('/profile', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.updateLawyerProfile(userId, req.body));
  }));

  router.post('/profile/photo', authMiddleware, upload.single('photo'), asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ success: true, photoUrl: req.file?.filename || 'avatar.jpg' });
  }));

  router.get('/team', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerTeam(userId));
  }));

  router.post('/team', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.status(201).json(await pro.addLawyerTeamMember(userId, req.body));
  }));

  router.delete('/team/:memberId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.removeLawyerTeamMember(userId, req.params.memberId));
  }));

  router.get('/lex/usage', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json(await pro.getLawyerLexUsage(userId));
  }));

  router.post('/lex/query', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;

    const queryText = req.body.query || req.body.message || '';
    const { runLexChat } = await import('../services/lex/lexPipeline.js');
    const data = await runLexChat({
      message: queryText,
      session_key: req.body.session_key || req.body.sessionKey,
      persist: false,
    });
    await pro.incrementLawyerLexUsage(userId);

    res.json({
      answer: data.response,
      content: data.response,
      text: data.response,
      sources: data.sources || [],
      language: data.language,
      showLawyer: data.show_lawyer,
    });
  }));

  router.post('/lexisnexis/connect', authMiddleware, asyncHandler(async (req, res) => {
    const userId = requireLawyer(req, res);
    if (!userId) return;
    res.json({ success: true, connected: true, message: 'LexisNexis integration placeholder active' });
  }));

  return router;
}
