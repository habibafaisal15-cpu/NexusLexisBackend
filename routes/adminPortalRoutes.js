import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

export function createAdminPortalRouter() {
  const router = Router();
  router.use(authMiddleware, adminMiddleware);

  // ── Drafting Desk (The Registry) ─────────────────────────────────────────
  router.get('/drafting-desk/stats', asyncHandler(async (_req, res) => {
    const { getDraftingDeskStats } = await import('../db/draftingDeskService.js');
    res.json(await getDraftingDeskStats());
  }));

  router.get('/drafting-desk/orders', asyncHandler(async (req, res) => {
    const { listDraftingDeskOrders } = await import('../db/draftingDeskService.js');
    res.json(await listDraftingDeskOrders(req.query || {}));
  }));

  router.post('/drafting-desk/orders/assign', asyncHandler(async (req, res) => {
    const { assignDraftingDeskOrder } = await import('../db/draftingDeskService.js');
    try {
      res.json(await assignDraftingDeskOrder(req.body || {}, {
        name: req.user?.name || req.user?.email,
        email: req.user?.email,
      }));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, ...(err.extra || {}) });
    }
  }));

  // ── Knowledge content (SEO pillars) ──────────────────────────────────────
  router.get('/knowledge/articles', asyncHandler(async (req, res) => {
    const { listKnowledgeArticles } = await import('../db/knowledgeContentService.js');
    res.json(await listKnowledgeArticles(req.query || {}, { publicOnly: false }));
  }));

  router.get('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    const { getKnowledgeArticleBySlug } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await getKnowledgeArticleBySlug(req.params.idOrSlug, { publicOnly: false }));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/knowledge/articles', asyncHandler(async (req, res) => {
    const { createKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.status(201).json(await createKnowledgeArticle(req.body || {}));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.patch('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    const { updateKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await updateKnowledgeArticle(req.params.idOrSlug, req.body || {}));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.delete('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    const { deleteKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await deleteKnowledgeArticle(req.params.idOrSlug));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  // ── LEX Console ──────────────────────────────────────────────────────────
  router.get('/lex/stats', asyncHandler(async (_req, res) => {
    const { getLexConsoleStats } = await import('../db/lexConsoleService.js');
    res.json(await getLexConsoleStats());
  }));

  router.get('/lex/sessions', asyncHandler(async (req, res) => {
    const { listLexConsoleSessions } = await import('../db/lexConsoleService.js');
    res.json(await listLexConsoleSessions(req.query || {}));
  }));

  router.get('/lex/sessions/:sessionKey', asyncHandler(async (req, res) => {
    const { getLexConsoleSession } = await import('../db/lexConsoleService.js');
    try {
      res.json(await getLexConsoleSession(req.params.sessionKey));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.delete('/lex/sessions/:sessionKey', asyncHandler(async (req, res) => {
    const { deleteLexConsoleSession } = await import('../db/lexConsoleService.js');
    try {
      res.json(await deleteLexConsoleSession(req.params.sessionKey));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/lex/turns/:turnId/flag', asyncHandler(async (req, res) => {
    const { flagLexTurn } = await import('../db/lexConsoleService.js');
    try {
      const flagged = req.body?.flagged !== false && req.body?.flagged !== 'false';
      res.json(await flagLexTurn(req.params.turnId, flagged));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/lex/question-bank/reload', asyncHandler(async (_req, res) => {
    const { reloadLexQuestionBank } = await import('../db/lexConsoleService.js');
    res.json(await reloadLexQuestionBank());
  }));

  return router;
}
