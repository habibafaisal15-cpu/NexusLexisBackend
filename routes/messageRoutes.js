import { Router } from 'express';
import { authMiddleware, getUserId } from '../middleware/auth.js';
import * as repo from '../db/repository.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

function getAuthUserId(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

function isClient(req) {
  return req.user?.role === 'client' || req.user?.roles?.includes('CorporateClient');
}

function isCa(req) {
  return req.user?.role === 'ca' || req.user?.roles?.includes('CharteredAccountant');
}

function isLawyer(req) {
  return req.user?.role === 'lawyer' || req.user?.roles?.includes('LegalAdvocate');
}

function handleMessageError(err, res) {
  const message = err.message || 'Message request failed';
  if (message === 'Thread not found' || message === 'Lawyer not found') {
    return res.status(404).json({ error: message });
  }
  if (message.includes('required')) {
    return res.status(400).json({ error: message });
  }
  return res.status(500).json({ error: message });
}

export function createMessageRouter() {
  const router = Router();

  router.get('/threads', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const threads = await repo.getThreads(userId);
    const unreadCount = await repo.getUnreadMessageCount(userId);
    res.json({ threads, unreadCount });
  }));

  router.get('/threads/:id', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    try {
      const thread = await repo.getThread(userId, req.params.id);
      res.json(thread);
    } catch (err) {
      handleMessageError(err, res);
    }
  }));

  router.post('/threads', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    if (!isClient(req)) {
      return res.status(403).json({ error: 'Only clients can start a new conversation with a lawyer' });
    }

    const { lawyerProfileId, lawyerUserId, text, attachments = [] } = req.body;
    if (!lawyerProfileId && !lawyerUserId) {
      return res.status(400).json({ error: 'lawyerProfileId or lawyerUserId is required' });
    }

    try {
      const msg = await repo.startMessageThread(userId, {
        lawyerProfileId,
        lawyerUserId,
        text,
        attachments,
      });
      res.status(201).json(msg);
    } catch (err) {
      handleMessageError(err, res);
    }
  }));

  router.post('/threads/:id/messages', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    if (!isClient(req) && !isLawyer(req) && !isCa(req)) {
      return res.status(403).json({ error: 'Messaging is available for clients and professionals only' });
    }

    const { text, attachments = [] } = req.body;
    if (!text?.trim() && attachments.length === 0) {
      return res.status(400).json({ error: 'Message text or attachments required' });
    }

    try {
      const msg = await repo.sendMessage(userId, req.params.id, { text, attachments });
      res.status(201).json(msg);
    } catch (err) {
      handleMessageError(err, res);
    }
  }));

  router.patch('/threads/:id/read', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    try {
      const result = await repo.markThreadAsRead(userId, req.params.id);
      res.json(result);
    } catch (err) {
      handleMessageError(err, res);
    }
  }));

  router.get('/unread-count', authMiddleware, asyncHandler(async (req, res) => {
    const userId = getAuthUserId(req, res);
    if (!userId) return;

    const unreadCount = await repo.getUnreadMessageCount(userId);
    res.json({ unreadCount });
  }));

  return router;
}
