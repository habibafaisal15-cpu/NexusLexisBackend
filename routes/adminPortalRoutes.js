import { Router } from 'express';
import { authMiddleware, adminMiddleware, isFullAdmin, emptyAdminRoom } from '../middleware/auth.js';
import { asyncHandler } from '../shared/lib/asyncHandler.js';

export function createAdminPortalRouter() {
  const router = Router();
  router.use(authMiddleware, adminMiddleware);

  // ── Drafting Desk (The Registry) — accessible to Admin + RegistryStaff ──
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

  router.get('/drafting-desk/settlements', asyncHandler(async (req, res) => {
    const { listDraftingDeskSettlements } = await import('../db/draftingDeskService.js');
    res.json(await listDraftingDeskSettlements(req.query || {}));
  }));

  router.post('/drafting-desk/settlements/:orderNumber/remit', asyncHandler(async (req, res) => {
    const { settleDraftingDeskOrder } = await import('../db/draftingDeskService.js');
    try {
      res.json(await settleDraftingDeskOrder(req.params.orderNumber, req.body || {}, {
        name: req.user?.name || req.user?.email,
        email: req.user?.email,
      }));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  // ── Knowledge content (SEO pillars) — full Admin only; RegistryStaff → empty ──
  router.get('/knowledge/articles', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) {
      return emptyAdminRoom(res, 'knowledge', { articles: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false } });
    }
    const { listKnowledgeArticles } = await import('../db/knowledgeContentService.js');
    res.json(await listKnowledgeArticles(req.query || {}, { publicOnly: false }));
  }));

  router.get('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
    const { getKnowledgeArticleBySlug } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await getKnowledgeArticleBySlug(req.params.idOrSlug, { publicOnly: false }));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/knowledge/articles', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
    const { createKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.status(201).json(await createKnowledgeArticle(req.body || {}));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.patch('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
    const { updateKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await updateKnowledgeArticle(req.params.idOrSlug, req.body || {}));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.delete('/knowledge/articles/:idOrSlug', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
    const { deleteKnowledgeArticle } = await import('../db/knowledgeContentService.js');
    try {
      res.json(await deleteKnowledgeArticle(req.params.idOrSlug));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  // ── LEX Console — full Admin only; RegistryStaff → empty ─────────────────
  router.get('/lex/stats', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) {
      return emptyAdminRoom(res, 'lex', { stats: {} });
    }
    const { getLexConsoleStats } = await import('../db/lexConsoleService.js');
    res.json(await getLexConsoleStats());
  }));

  router.get('/lex/sessions', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) {
      return emptyAdminRoom(res, 'lex', { sessions: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false } });
    }
    const { listLexConsoleSessions } = await import('../db/lexConsoleService.js');
    res.json(await listLexConsoleSessions(req.query || {}));
  }));

  router.get('/lex/sessions/:sessionKey', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'lex', { session: null });
    const { getLexConsoleSession } = await import('../db/lexConsoleService.js');
    try {
      res.json(await getLexConsoleSession(req.params.sessionKey));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.delete('/lex/sessions/:sessionKey', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'lex', { ok: false });
    const { deleteLexConsoleSession } = await import('../db/lexConsoleService.js');
    try {
      res.json(await deleteLexConsoleSession(req.params.sessionKey));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/lex/turns/:turnId/flag', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'lex', { ok: false });
    const { flagLexTurn } = await import('../db/lexConsoleService.js');
    try {
      const flagged = req.body?.flagged !== false && req.body?.flagged !== 'false';
      res.json(await flagLexTurn(req.params.turnId, flagged));
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }));

  router.post('/lex/question-bank/reload', asyncHandler(async (req, res) => {
    if (!isFullAdmin(req)) return emptyAdminRoom(res, 'lex', { ok: false });
    const { reloadLexQuestionBank } = await import('../db/lexConsoleService.js');
    res.json(await reloadLexQuestionBank());
  }));

  return router;
}
