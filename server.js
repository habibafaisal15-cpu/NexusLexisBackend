import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { signToken, authMiddleware } from './middleware/auth.js';
import { createLawyerRouter } from './routes/lawyerRoutes.js';
import { createMessageRouter } from './routes/messageRoutes.js';
import { createCaRouter } from './routes/caRoutes.js';
import { createAdminLibraryRouter } from './routes/adminLibraryRoutes.js';
import { seedProfessionalDemoData } from './db/professionalSeed.js';
import { testConnection } from './db/index.js';
import { runSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import * as repo from './db/repository.js';
import * as authRepo from './db/auth.js';
import { asyncHandler } from './shared/lib/asyncHandler.js';
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
      createOrder: 'POST /api/v2/orders',
      libraryDownload: 'POST /api/v2/library/templates/:slug/download',
      knowledgeBank: 'GET /api/v2/knowledge-bank/catalog',
      knowledgeDownload: 'GET /api/v2/knowledge-bank/templates/:slug/download',
      adminCreateTemplate: 'POST /api/v2/admin/library/templates',
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Role', 'X-Workspace-Context', 'ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const upload = multer({ dest: UPLOADS_DIR });

function getClientId(req, res) {
  const userId = Number(req.user?.userId || req.user?.sub);
  if (!userId || Number.isNaN(userId)) {
    res.status(401).json({ error: 'Invalid or missing user session' });
    return null;
  }
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

app.get('/api/v2/library/catalog', asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  res.json(await repo.getLibraryCatalog({ category, search, accessType: 'paid' }));
}));

app.get('/api/v2/library/templates/:slug', asyncHandler(async (req, res) => {
  const template = await repo.getLibraryTemplate(req.params.slug, { accessType: 'paid' });
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

/** Download paid library template → adds entry to My Documents */
app.post('/api/v2/library/templates/:slug/download', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  try {
    const result = await repo.downloadLibraryTemplateToDocuments(clientId, req.params.slug);
    res.status(201).json({
      ok: true,
      message: result.hasFile
        ? 'Template downloaded and saved to My Documents'
        : 'Template added to My Documents',
      document: result.document,
      downloadUrl: result.downloadUrl,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not download template' });
  }
}));

app.get('/api/v2/knowledge-bank/catalog', asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  res.json(await repo.getLibraryCatalog({ category, search, accessType: 'public' }));
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

// ─── Client Documents ───────────────────────────────────────────────────────

app.get('/api/v2/documents', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  const { status } = req.query;
  res.json(await repo.getClientDocuments(clientId, { status }));
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

app.post('/api/v2/appointments', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

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
  } = req.body;

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

  const result = await repo.bookAppointment(clientId, {
    lawyerName,
    lawyerProfileId,
    slot,
    mode,
    intake: clientCity?.trim()
      ? `City: ${clientCity.trim()}${intake?.trim() ? `\n\n${intake.trim()}` : ''}`
      : intake,
  });
  res.status(201).json(result);
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

app.post('/api/v1/lex/chat/', asyncHandler(async (req, res) => {
  if (LEX_MODE === 'inline') {
    const result = await runLexChat(req.body || {});
    return res.json(result);
  }
  await proxyToLexAi(req, res, '/api/v1/lex/chat/');
}));

app.get('/api/v1/lex/sessions/', asyncHandler(async (req, res) => {
  if (LEX_MODE === 'inline') {
    return res.json([]);
  }
  await proxyToLexAi(req, res, '/api/v1/lex/sessions/');
}));

app.get('/api/v1/lex/sessions/:sessionKey/', asyncHandler(async (req, res) => {
  if (LEX_MODE === 'inline') {
    return res.json({ session_key: req.params.sessionKey, title: 'Chat', messages: [] });
  }
  await proxyToLexAi(req, res, `/api/v1/lex/sessions/${req.params.sessionKey}/`);
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
