import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { signToken, authMiddleware, optionalAuthMiddleware, adminMiddleware } from './middleware/auth.js';
import { createLawyerRouter } from './routes/lawyerRoutes.js';
import { createMessageRouter } from './routes/messageRoutes.js';
import { createCaRouter } from './routes/caRoutes.js';
import { createAdminLibraryRouter } from './routes/adminLibraryRoutes.js';
import { seedProfessionalDemoData } from './db/professionalSeed.js';
import { testConnection } from './db/index.js';
import { runSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import { ensureLibrarySchema } from './db/ensureLibrarySchema.js';
import { ensureAppointmentsSchema } from './db/ensureAppointmentsSchema.js';
import { ensureLexSchema } from './db/ensureLexSchema.js';
import { ensureAdminPortalSchema } from './db/ensureAdminPortalSchema.js';
import { createAdminPortalRouter } from './routes/adminPortalRoutes.js';
import * as repo from './db/repository.js';
import * as authRepo from './db/auth.js';
import { asyncHandler } from './shared/lib/asyncHandler.js';
import { parsePagination } from './shared/lib/pagination.js';
import { runLexChat } from './services/lex/lexPipeline.js';
import { warmQuestionBank } from './services/lex/questionBank.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const LEX_API_URL = process.env.LEX_API_URL || 'http://127.0.0.1:8001';
const AUTH_API_URL = process.env.AUTH_API_URL || 'http://127.0.0.1:3001';
const IS_VERCEL = Boolean(process.env.VERCEL);
/** inline = Gemini + sheet RAG on Main API (Vercel). proxy = separate Django LEX service. */
const LEX_MODE = process.env.LEX_MODE || (process.env.GEMINI_API_KEY ? 'inline' : 'proxy');
const UPLOADS_DIR = IS_VERCEL ? join('/tmp', 'uploads') : join(__dirname, 'uploads');

try {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[uploads] Could not create uploads dir:', err.message);
}

async function initDatabase() {
  await testConnection();
  await runSchema();
  await seedDatabase();
  if (process.env.SEED_DEMO === 'true') {
    await seedProfessionalDemoData();
  }
  console.log('PostgreSQL connected and ready.');
}

const app = express();

app.get('/', (_req, res) => {
  res.json({
    service: 'NexusLexis Main API',
    status: 'ok',
    health: '/api/health',
    library: {
      catalog: 'GET /api/v2/library/catalog',
      template: 'GET /api/v2/library/templates/:slug',
      sample: 'GET /api/v2/library/templates/:slug/sample',
      purchase: 'POST /api/v2/library/templates/:slug/purchase',
      completePurchase: 'POST /api/v2/library/purchases/:orderNumber/complete',
      validateCoupon: 'POST /api/v2/library/coupons/validate',
      knowledgeBank: 'GET /api/v2/knowledge-bank/catalog',
      knowledgeDownload: 'GET /api/v2/knowledge-bank/templates/:slug/download',
      documents: 'GET /api/v2/documents',
      adminCreateTemplate: 'POST /api/v2/admin/library/templates',
      adminAppointments: 'GET /api/v2/admin/appointments',
      adminAppointmentStats: 'GET /api/v2/admin/appointments/stats',
      adminAppointmentDetail: 'GET /api/v2/admin/appointments/:id',
      adminPatchAppointment: 'PATCH /api/v2/admin/appointments/:id',
      adminReassignAppointment: 'POST /api/v2/admin/appointments/:id/reassign',
      adminAssignableProfessionals: 'GET /api/v2/admin/assignable-professionals',
      draftingDesk: 'GET /api/v2/admin/drafting-desk/orders',
      knowledgeArticles: 'GET /api/v2/knowledge/articles',
      lexConsole: 'GET /api/v2/admin/lex/stats',
    },
  });
});

const corsOrigins = (process.env.FRONTEND_URLS || 'http://localhost:5175,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: process.env.CORS_ALLOW_ALL === 'true' ? true : corsOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Role', 'X-Workspace-Context', 'X-Lex-Owner', 'ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

/** On Vercel, run library schema/seed once per cold start (local uses initDatabase). */
app.use(asyncHandler(async (_req, _res, next) => {
  if (IS_VERCEL) {
    await ensureLibrarySchema();
    await ensureAppointmentsSchema();
    await ensureLexSchema();
    await ensureAdminPortalSchema();
  }
  next();
}));

const upload = multer({ dest: UPLOADS_DIR });

function getClientId(req, res) {
  const userId = Number(req.user?.userId || req.user?.sub);
  if (!userId || Number.isNaN(userId)) {
    res.status(401).json({ error: 'Invalid or missing user session' });
    return null;
  }
  return userId;
}

function optionalClientId(req) {
  const userId = Number(req.user?.userId || req.user?.sub);
  if (!userId || Number.isNaN(userId)) return null;
  return userId;
}

// ─── Auth API proxy (auth_backend) — enables single ngrok tunnel for frontend devs ─

async function proxyToAuthApi(req, res) {
  try {
    const url = `${AUTH_API_URL}/api/auth${req.url}`;
    const headers = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const options = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const text = await response.text();
    const contentType = response.headers.get('content-type');
    res.status(response.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(text);
  } catch (err) {
    console.error('Auth API proxy error:', err.message);
    res.status(502).json({ error: 'Auth API service unavailable' });
  }
}

app.use('/api/auth', asyncHandler(proxyToAuthApi));

// ─── Auth ───────────────────────────────────────────────────────────────────

app.post('/api/v2/auth/register', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'Organization name, email, and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = await authRepo.registerUser({ name, email, password, role: 'client' });
  const payload = authRepo.buildTokenPayload(user);
  const token = signToken(payload);

  res.status(201).json({ token, user: payload, message: 'Account created successfully' });
}));

app.post('/api/v2/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await authRepo.loginUser({ email, password });

  if (user.role !== 'client') {
    return res.status(403).json({ error: 'This portal is for corporate clients only' });
  }

  const payload = authRepo.buildTokenPayload(user);
  const token = signToken(payload);

  res.json({ token, user: payload });
}));

app.get('/api/v2/auth/me', authMiddleware, asyncHandler(async (req, res) => {
  const userId = Number(req.user.userId || req.user.sub);
  const user = await authRepo.findUserById(userId);

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  res.json({ user: authRepo.buildTokenPayload(user) });
}));

app.post('/api/v2/auth/session', asyncHandler(async (_req, res) => {
  const client = await repo.getDemoClient();
  if (!client) {
    return res.status(500).json({ error: 'Demo client not configured' });
  }
  const payload = authRepo.buildTokenPayload(client);
  const token = signToken(payload);
  res.json({ token, user: payload });
}));

// ─── Lawyer & CA dashboards (mainsite frontend) ─────────────────────────────

app.use('/api/v2/lawyer', createLawyerRouter(LEX_API_URL, UPLOADS_DIR));
app.use('/api/v2/messages', createMessageRouter());
app.use('/api/v2/lawyer/messages', createMessageRouter());
app.use('/api/v2/ca/messages', createMessageRouter());
app.use('/api/v2/ca', createCaRouter(UPLOADS_DIR));

// ─── Workspace bootstrap ────────────────────────────────────────────────────

app.get('/api/v2/workspace', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getWorkspace(clientId));
}));

// ─── Notifications ──────────────────────────────────────────────────────────

app.get('/api/v2/notifications', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getNotifications(clientId));
}));

app.delete('/api/v2/notifications/:id', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  await repo.dismissNotification(clientId, Number(req.params.id));
  res.json({ success: true });
}));

app.delete('/api/v2/notifications', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  await repo.clearNotifications(clientId);
  res.json({ success: true });
}));

// ─── Document Library (catalog) ───────────────────────────────────────────────

// ─── Document Library (paid) + Knowledge Bank (public) ───────────────────────

app.get('/api/v2/library/catalog', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const { category, search, block, language, lang } = req.query;
  const { page, limit } = parsePagination(req.query);
  res.json(await repo.getLibraryCatalog({
    category,
    search,
    block,
    language: language || lang,
    accessType: 'paid',
    clientId: optionalClientId(req),
    paginate: true,
    page,
    limit,
  }));
}));

app.get('/api/v2/library/templates/:slug', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const template = await repo.getLibraryTemplate(req.params.slug, {
    accessType: 'paid',
    clientId: optionalClientId(req),
  });
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
}));

app.get('/api/v2/library/templates/:slug/sample', asyncHandler(async (req, res) => {
  const sample = await repo.getLibraryTemplateSample(req.params.slug, { accessType: 'paid' });
  if (!sample || !sample.isActive) {
    return res.status(404).json({ error: 'Template sample not found' });
  }
  const buffer = Buffer.from(sample.contentBase64, 'base64');
  res.setHeader('Content-Type', sample.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${sample.fileName}"`);
  res.send(buffer);
}));

/** Start buy — creates pending purchase. Does NOT unlock file. */
app.post('/api/v2/library/templates/:slug/purchase', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  try {
    const result = await repo.purchaseLibraryTemplate(clientId, req.params.slug, {
      couponCode: req.body?.couponCode,
    });
    res.status(result.alreadyOwned ? 200 : 201).json({
      ok: true,
      alreadyOwned: result.alreadyOwned,
      paymentRequired: result.paymentRequired,
      purchase: result.purchase,
      document: result.document,
      price: result.price,
      totalPaid: result.totalPaid,
      coupon: result.coupon || null,
      completeUrl: result.completeUrl || null,
      downloadUrl: result.downloadUrl,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not start purchase' });
  }
}));

/** Complete payment → unlock in My Documents */
app.post('/api/v2/library/purchases/:orderNumber/complete', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  try {
    const result = await repo.completeLibraryPurchase(clientId, req.params.orderNumber, {
      paymentReference: req.body?.paymentReference,
      paymentMethod: req.body?.paymentMethod || 'demo',
      couponCode: req.body?.couponCode,
    });
    res.json({
      ok: true,
      alreadyCompleted: result.alreadyCompleted,
      document: result.document,
      downloadUrl: result.downloadUrl,
      message: 'Purchase completed. Document unlocked in My Documents.',
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not complete purchase' });
  }
}));

app.post('/api/v2/library/coupons/validate', asyncHandler(async (req, res) => {
  const { code, templateSlug, price } = req.body || {};
  let listPrice = Number(price) || 0;
  if (templateSlug) {
    const template = await repo.getLibraryTemplate(String(templateSlug), { accessType: 'paid' });
    if (template) listPrice = Number(template.price) || 0;
  }
  res.json(repo.validateLibraryCoupon(code, { price: listPrice }));
}));

/** Removed: free grab of paid templates. Use purchase + My Documents download. */
app.post('/api/v2/library/templates/:slug/download', authMiddleware, asyncHandler(async (_req, res) => {
  res.status(410).json({
    error: 'This endpoint was removed. Use POST /library/templates/:slug/purchase then POST /library/purchases/:orderNumber/complete, then download from My Documents.',
    purchaseUrlTemplate: '/api/v2/library/templates/:slug/purchase',
    completeUrlTemplate: '/api/v2/library/purchases/:orderNumber/complete',
    documentsUrl: '/api/v2/documents',
  });
}));

app.get('/api/v2/knowledge-bank/catalog', asyncHandler(async (req, res) => {
  const { category, search, block, language, lang } = req.query;
  res.json(await repo.getLibraryCatalog({
    category,
    search,
    block,
    language: language || lang,
    accessType: 'public',
  }));
}));

app.get('/api/v2/knowledge-bank/templates/:slug', asyncHandler(async (req, res) => {
  const template = await repo.getLibraryTemplate(req.params.slug, { accessType: 'public' });
  if (!template) {
    return res.status(404).json({ error: 'Knowledge bank template not found' });
  }
  res.json(template);
}));

app.get('/api/v2/knowledge-bank/templates/:slug/download', asyncHandler(async (req, res) => {
  const sample = await repo.getLibraryTemplateSample(req.params.slug, { accessType: 'public' });
  if (!sample || !sample.isActive) {
    return res.status(404).json({ error: 'Knowledge bank file not found' });
  }
  const buffer = Buffer.from(sample.contentBase64, 'base64');
  res.setHeader('Content-Type', sample.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${sample.fileName}"`);
  res.send(buffer);
}));

app.use('/api/v2/admin/library', createAdminLibraryRouter());
app.use('/api/v2/admin', createAdminPortalRouter());

// Public Knowledge content (SEO articles) — distinct from free template downloads
app.get('/api/v2/knowledge/articles', asyncHandler(async (req, res) => {
  const { listKnowledgeArticles } = await import('./db/knowledgeContentService.js');
  res.json(await listKnowledgeArticles(req.query || {}, { publicOnly: true }));
}));

app.get('/api/v2/knowledge/articles/:slug', asyncHandler(async (req, res) => {
  const { getKnowledgeArticleBySlug } = await import('./db/knowledgeContentService.js');
  try {
    res.json(await getKnowledgeArticleBySlug(req.params.slug, { publicOnly: true }));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));

// ── PDF contract aliases (nexus_lexis_admin_flows.pdf) ──────────────────────
// Drafting Desk FE/admin queue alias
app.get('/api/v2/admin-panel/orders', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { listDraftingDeskOrders } = await import('./db/draftingDeskService.js');
  res.json(await listDraftingDeskOrders(req.query || {}));
}));
app.get('/admin-panel/orders', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { listDraftingDeskOrders } = await import('./db/draftingDeskService.js');
  res.json(await listDraftingDeskOrders(req.query || {}));
}));

// Knowledge manage + public articles (short /api/knowledge/* paths from PDF)
app.get('/api/knowledge/articles', asyncHandler(async (req, res) => {
  const { listKnowledgeArticles } = await import('./db/knowledgeContentService.js');
  res.json(await listKnowledgeArticles(req.query || {}, { publicOnly: true }));
}));
app.get('/api/knowledge/articles/:slug', asyncHandler(async (req, res) => {
  const { getKnowledgeArticleBySlug } = await import('./db/knowledgeContentService.js');
  try {
    res.json(await getKnowledgeArticleBySlug(req.params.slug, { publicOnly: true }));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));
app.get('/api/knowledge/manage', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { isFullAdmin, emptyAdminRoom } = await import('./middleware/auth.js');
  if (!isFullAdmin(req)) {
    return emptyAdminRoom(res, 'knowledge', { articles: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0, hasNext: false, hasPrev: false } });
  }
  const { listKnowledgeArticles } = await import('./db/knowledgeContentService.js');
  res.json(await listKnowledgeArticles(req.query || {}, { publicOnly: false }));
}));
app.post('/api/knowledge/manage', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { isFullAdmin, emptyAdminRoom } = await import('./middleware/auth.js');
  if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
  const { createKnowledgeArticle } = await import('./db/knowledgeContentService.js');
  try {
    res.status(201).json(await createKnowledgeArticle(req.body || {}));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));
app.patch('/api/knowledge/manage/:idOrSlug', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { isFullAdmin, emptyAdminRoom } = await import('./middleware/auth.js');
  if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
  const { updateKnowledgeArticle } = await import('./db/knowledgeContentService.js');
  try {
    res.json(await updateKnowledgeArticle(req.params.idOrSlug, req.body || {}));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));
app.delete('/api/knowledge/manage/:idOrSlug', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { isFullAdmin, emptyAdminRoom } = await import('./middleware/auth.js');
  if (!isFullAdmin(req)) return emptyAdminRoom(res, 'knowledge', { article: null });
  const { deleteKnowledgeArticle } = await import('./db/knowledgeContentService.js');
  try {
    res.json(await deleteKnowledgeArticle(req.params.idOrSlug));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));

// PDF: POST /api/lawyers/assigned-orders/{id}/upload/
const assignedOrderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});
app.post(
  '/api/lawyers/assigned-orders/:orderId/upload',
  authMiddleware,
  assignedOrderUpload.single('document'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.user?.userId || req.user?.sub);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { deliverLawyerOrder } = await import('./db/appointmentService.js');
    try {
      const result = await deliverLawyerOrder(userId, req.params.orderId, req.file);
      if (!result) return res.status(404).json({ error: 'Order not found' });
      res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  })
);
app.post(
  '/api/lawyers/assigned-orders/:orderId/upload/',
  authMiddleware,
  assignedOrderUpload.single('document'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.user?.userId || req.user?.sub);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { deliverLawyerOrder } = await import('./db/appointmentService.js');
    try {
      const result = await deliverLawyerOrder(userId, req.params.orderId, req.file);
      if (!result) return res.status(404).json({ error: 'Order not found' });
      res.json(result);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  })
);

// NL-BE-ADMIN-OVERSIGHT-001 — Appointment Oversight (same appointments rows)
app.get('/api/v2/admin/appointments/stats', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { getAdminAppointmentStats } = await import('./db/adminAppointmentOversight.js');
  res.json(await getAdminAppointmentStats());
}));

app.get('/api/v2/admin/assignable-professionals', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { listAssignableProfessionals } = await import('./db/adminAppointmentOversight.js');
  res.json(await listAssignableProfessionals({
    professionalType: req.query.professionalType,
    practiceArea: req.query.practiceArea,
    city: req.query.city,
    excludeProfileId: req.query.excludeProfileId,
    search: req.query.search,
  }));
}));

app.get('/api/v2/admin/appointments/:appointmentId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { getAdminAppointmentById } = await import('./db/adminAppointmentOversight.js');
  const { AppointmentError } = await import('./db/appointmentService.js');
  try {
    res.json(await getAdminAppointmentById(req.params.appointmentId));
  } catch (err) {
    const status = err instanceof AppointmentError ? err.status : (err.status || 400);
    return res.status(status).json({ error: err.message, ...(err.extra || {}) });
  }
}));

app.post('/api/v2/admin/appointments/:appointmentId/reassign', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { reassignAdminAppointment } = await import('./db/adminAppointmentOversight.js');
  const { AppointmentError } = await import('./db/appointmentService.js');
  try {
    res.json(await reassignAdminAppointment(req.params.appointmentId, req.body || {}, {
      name: req.user?.name || req.user?.email,
      email: req.user?.email,
    }));
  } catch (err) {
    const status = err instanceof AppointmentError ? err.status : (err.status || 400);
    return res.status(status).json({ error: err.message, ...(err.extra || {}) });
  }
}));

app.get('/api/v2/admin/appointments', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { listAdminAppointments } = await import('./db/appointmentService.js');
  res.json(await listAdminAppointments({
    status: req.query.status,
    source: req.query.source,
    lawyerProfileId: req.query.lawyerProfileId,
    page: req.query.page,
    limit: req.query.limit,
    search: req.query.search,
    paymentStatus: req.query.paymentStatus,
    professionalType: req.query.professionalType,
    mode: req.query.mode,
    serviceArea: req.query.serviceArea,
    assignmentStatus: req.query.assignmentStatus,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
    attentionOnly: req.query.attentionOnly,
  }));
}));

app.patch('/api/v2/admin/appointments/:appointmentId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { patchAdminAppointment, AppointmentError } = await import('./db/appointmentService.js');
  try {
    res.json(await patchAdminAppointment(req.params.appointmentId, req.body || {}, {
      name: req.user?.name || req.user?.email,
      email: req.user?.email,
    }));
  } catch (err) {
    const status = err instanceof AppointmentError ? err.status : (err.status || 400);
    return res.status(status).json({ error: err.message, ...(err.extra || {}) });
  }
}));

// TEMPORARY testing APIs — remove after QA. Admin can add/delete documents freely.
app.get('/api/v2/admin/documents', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  res.json({
    temporaryTestingApi: true,
    documents: await repo.adminListDocuments({ limit: req.query.limit }),
  });
}));

app.delete('/api/v2/admin/documents/:orderNumber', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const deleted = await repo.adminDeleteDocument(req.params.orderNumber);
  if (!deleted) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({
    ok: true,
    temporaryTestingApi: true,
    deleted: {
      orderNumber: deleted.order_number,
      clientId: deleted.client_id,
      status: deleted.status,
    },
  });
}));

// ─── Client Documents ───────────────────────────────────────────────────────

app.get('/api/v2/documents', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  const { status } = req.query;
  const { page, limit } = parsePagination(req.query);
  res.json(await repo.getClientDocuments(clientId, { status, page, limit, paginate: true }));
}));

app.get('/api/v2/documents/:orderNumber', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const document = await repo.getClientDocumentOrder(clientId, req.params.orderNumber);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json(document);
}));

app.get('/api/v2/documents/:orderNumber/download', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const payload = await repo.getClientDocumentDownloadPayload(clientId, req.params.orderNumber);
  if (!payload) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (payload.kind === 'forbidden') {
    return res.status(402).json({
      error: payload.error,
      document: payload.document,
      completeUrl: `/api/v2/library/purchases/${req.params.orderNumber}/complete`,
    });
  }

  if (payload.kind === 'buffer') {
    res.setHeader('Content-Type', payload.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
    return res.send(payload.buffer);
  }

  const document = payload.document;

  if (document.completedFile && !String(document.completedFile).startsWith('library:')) {
    const filePath = join(UPLOADS_DIR, document.completedFile);
    if (existsSync(filePath)) {
      return res.download(filePath, document.completedFile);
    }
  }

  if (document.statusKey !== 'completed' && document.status !== 'Completed') {
    return res.status(409).json({ error: 'Document is not ready for download yet' });
  }

  const filename = `${document.templateName.replace(/[^a-z0-9]/gi, '_')}_${document.orderNumber}.txt`;
  const content = [
    'NEXUSLEXIS DOCUMENT DELIVERY',
    '============================',
    '',
    `Order: ${document.orderNumber}`,
    `Template: ${document.templateName}`,
    `Status: ${document.status}`,
    `Expected delivery: ${document.date}`,
    '',
    'INTAKE SUMMARY',
    JSON.stringify(document.formData || {}, null, 2),
    '',
    '--- End of Document ---',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}));

// ─── Orders ─────────────────────────────────────────────────────────────────

app.get('/api/v2/orders', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getOrders(clientId));
}));

app.post('/api/v2/orders', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const { templateId, templateName, formData } = req.body;
  if (!templateId || !templateName) {
    return res.status(400).json({ error: 'templateId and templateName are required' });
  }

  try {
    const order = await repo.createOrder(clientId, { templateId, templateName, formData });
    res.status(201).json(order);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not create order' });
  }
}));

// ─── Matters (VLO) ──────────────────────────────────────────────────────────

app.get('/api/v2/vlo/matters', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getMatters(clientId));
}));

app.post('/api/v2/vlo/matters', authMiddleware, upload.array('files', 10), asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const { title, description } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const files = (req.files || []).map((f) => f.originalname || f.filename);
  const matter = await repo.createMatter(clientId, { title, description, files });
  res.status(201).json(matter);
}));

app.get('/api/vlo/matters/download/:id', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const matter = await repo.getMatterById(clientId, req.params.id);
  if (!matter) {
    return res.status(404).json({ error: 'Matter not found' });
  }

  const filename = matter.attachment || `${matter.title.replace(/[^a-z0-9]/gi, '_')}_opinion.pdf`;
  const content = [
    'NEXUSLEXIS CONFIDENTIAL ADVISORY OPINION',
    '========================================',
    '',
    `Matter: ${matter.title}`,
    `Date: ${matter.date}`,
    `Status: ${matter.status}`,
    '',
    'DESCRIPTION',
    matter.description,
    '',
    matter.opinion ? `OPINION\n${matter.opinion}` : 'Opinion pending counsel review.',
    '',
    '--- End of Document ---'
  ].join('\n');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}));

// ─── Appointments ───────────────────────────────────────────────────────────

const appointmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.post('/api/v2/appointments', authMiddleware, appointmentUpload.array('attachments', 8), asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const body = req.body || {};
  const {
    lawyerName,
    lawyerProfileId,
    caName,
    caProfileId,
    professionalRole,
    slot,
    mode,
    intake,
    clientCity,
  } = body;

  const isCaBooking =
    professionalRole === 'CA'
    || caProfileId
    || caName;

  if (isCaBooking) {
    if (!caProfileId && !caName) {
      return res.status(400).json({ error: 'caProfileId or caName is required for CA bookings' });
    }
    const result = await repo.bookCaAppointment(clientId, {
      caProfileId,
      caName,
      slot,
      mode,
      intake,
      clientCity,
    });
    return res.status(201).json(result);
  }

  if (!lawyerName && !lawyerProfileId) {
    return res.status(400).json({ error: 'lawyerName or lawyerProfileId is required' });
  }

  try {
    const result = await repo.bookAppointment(clientId, body, req.files || []);
    res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, ...(err.extra || {}) });
  }
}));

app.post('/api/v2/documents/custom-requests', authMiddleware, appointmentUpload.array('attachments', 8), asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  try {
    const result = await repo.bookAppointment(clientId, {
      ...(req.body || {}),
      source: 'custom_docs',
      mode: req.body?.mode || 'document',
    }, req.files || []);
    res.status(201).json(result);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, ...(err.extra || {}) });
  }
}));

app.get('/api/v2/appointments', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getClientAppointments(clientId));
}));

// ─── Subscription ───────────────────────────────────────────────────────────

app.get('/api/v2/subscription', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getSubscription(clientId));
}));

app.post('/api/v2/subscription/cancel', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  await repo.cancelSubscription(clientId);
  res.json({ success: true });
}));

// ─── Invoices ───────────────────────────────────────────────────────────────

app.get('/api/v2/invoices', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getInvoices(clientId));
}));

// ─── Evaluations ────────────────────────────────────────────────────────────

app.post('/api/v2/evaluations', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const { rating, comment, threadId } = req.body;
  if (!rating) {
    return res.status(400).json({ error: 'rating is required' });
  }

  const result = await repo.submitEvaluation(clientId, { rating, comment, threadId });
  res.status(201).json(result);
}));

// ─── Lawyers ────────────────────────────────────────────────────────────────

app.get('/api/v2/lawyers/public', asyncHandler(async (req, res) => {
  const { city, practice, lang } = req.query;
  res.json(await repo.getLawyers({ city, practice, lang, verifiedOnly: true }));
}));

app.get('/api/v2/lawyers/:lawyerProfileId/availability', asyncHandler(async (req, res) => {
  try {
    const { getLawyerAvailability } = await import('./db/appointmentService.js');
    res.json(await getLawyerAvailability(req.params.lawyerProfileId, req.query.date));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
}));

app.get('/api/v2/cas/public', asyncHandler(async (req, res) => {
  const { city, practice, lang } = req.query;
  res.json(await repo.getCas({ city, practice, lang, verifiedOnly: true }));
}));

app.get('/api/v2/lawyers', authMiddleware, asyncHandler(async (req, res) => {
  const { city, practice, lang } = req.query;
  res.json(await repo.getLawyers({ city, practice, lang }));
}));

// ─── LEX AI proxy (Django) ─────────────────────────────────────────────────

async function proxyToLexAi(req, res, djangoPath) {
  try {
    const query = new URLSearchParams(req.query).toString();
    const url = `${LEX_API_URL}${djangoPath}${query ? `?${query}` : ''}`;
    const options = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (req.method !== 'GET' && req.body) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ error: 'Invalid LEX AI response' }));
    res.status(response.status).json(data);
  } catch (err) {
    console.error('LEX AI proxy error:', err.message);
    res.status(502).json({ error: 'LEX AI service unavailable' });
  }
}

function lexOwnerFromReq(req) {
  const userId = req.user?.userId || req.user?.sub;
  if (userId) return `user:${userId}`;
  const raw = String(
    req.headers['x-lex-owner'] || req.body?.owner_key || req.query?.owner_key || ''
  ).trim();
  if (raw) return raw.slice(0, 200);
  const ip = String(
    req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim();
  return `guest_ip:${ip.slice(0, 120)}`;
}

app.post('/api/v1/lex/sessions/', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const { createLexSession } = await import('./db/lexChatService.js');
  const session = await createLexSession(lexOwnerFromReq(req), { title: req.body?.title });
  res.status(201).json(session);
}));

app.get('/api/v1/lex/sessions/', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const { listLexSessions } = await import('./db/lexChatService.js');
  res.json(await listLexSessions(lexOwnerFromReq(req)));
}));

app.get('/api/v1/lex/sessions/:sessionKey/', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const { getLexSession, LexChatError } = await import('./db/lexChatService.js');
  try {
    res.json(await getLexSession(req.params.sessionKey, lexOwnerFromReq(req)));
  } catch (err) {
    return res.status(err instanceof LexChatError ? err.status : 400).json({ error: err.message });
  }
}));

app.delete('/api/v1/lex/sessions/:sessionKey/', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const { deleteLexSession, LexChatError } = await import('./db/lexChatService.js');
  try {
    res.json(await deleteLexSession(req.params.sessionKey, lexOwnerFromReq(req)));
  } catch (err) {
    return res.status(err instanceof LexChatError ? err.status : 400).json({ error: err.message });
  }
}));

app.post('/api/v1/lex/chat/', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.sub || null;
    const ownerKey = lexOwnerFromReq(req);
    const { assertGuestLexPromptAllowed, guestQuotaAfterSend } = await import('./db/lexChatService.js');

    const quotaBefore = await assertGuestLexPromptAllowed({ userId, ownerKey });
    const result = await runLexChat({
      ...(req.body || {}),
      owner_key: ownerKey,
      userId,
    });
    res.json({
      ...result,
      ...guestQuotaAfterSend(quotaBefore),
    });
  } catch (err) {
    if (err.code === 'LEX_LOGIN_REQUIRED' || err.loginRequired) {
      return res.status(401).json({
        error: err.message,
        code: 'LEX_LOGIN_REQUIRED',
        loginRequired: true,
        guestPromptLimit: err.guestPromptLimit,
        guestPromptsUsed: err.guestPromptsUsed,
        guestPromptsRemaining: 0,
      });
    }
    return res.status(err.status || 400).json({ error: err.message, ...(err.extra || {}) });
  }
}));

// ─── Health check ───────────────────────────────────────────────────────────

app.get('/api/health', asyncHandler(async (_req, res) => {
  const db = await testConnection();
  res.json({ status: 'ok', service: 'NexusLexis LEX API v2.0', database: 'connected', time: db.now });
}));

// ─── Error handler ──────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── LEX WebSocket (local dev only — Vercel serverless has no WebSocket) ───

if (!IS_VERCEL) {
  initDatabase()
    .then(async () => {
      const { createServer } = await import('http');
      const { WebSocketServer } = await import('ws');
      const server = createServer(app);

      function mapLexWsResponse(data) {
        const isUrdu = data.language === 'UR' || /[\u0600-\u06FF]/.test(data.response || '');
        const shortcuts = data.show_lawyer
          ? [{ label: isUrdu ? 'وکیل تلاش کریں ←' : 'Find a Lawyer →', route: '/find-a-lawyer', icon: 'lawyer' }]
          : [];
        return { text: data.response, shortcuts };
      }

      const wss = new WebSocketServer({ server, path: '/api/lex/ws' });

      wss.on('connection', (ws) => {
        ws.on('message', async (raw) => {
          try {
            const { query: userQuery, session_key: sessionKey } = JSON.parse(raw.toString());
            const response = await fetch(`${LEX_API_URL}/api/v1/lex/chat/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: userQuery || '',
                session_key: sessionKey || `ws_${Date.now()}`
              })
            });

            if (!response.ok) {
              throw new Error('LEX AI request failed');
            }

            const data = await response.json();
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify(mapLexWsResponse(data)));
            }
          } catch {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({
                text: 'LEX AI is currently unavailable. Please try again shortly.',
                shortcuts: []
              }));
            }
          }
        });
      });

      server.listen(PORT, () => {
        console.log(`NexusLexis Main API running on http://localhost:${PORT}`);
        console.log(`WebSocket available at ws://localhost:${PORT}/api/lex/ws`);
        if (LEX_MODE === 'inline' && process.env.GEMINI_API_KEY) {
          warmQuestionBank(process.env.GEMINI_API_KEY);
        }
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}

export default app;

// Pre-load question bank on Vercel cold start (non-blocking)
if (IS_VERCEL && LEX_MODE === 'inline' && process.env.GEMINI_API_KEY) {
  warmQuestionBank(process.env.GEMINI_API_KEY);
}
