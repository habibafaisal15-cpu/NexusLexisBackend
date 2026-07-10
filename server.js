import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import { signToken, authMiddleware } from './middleware/auth.js';
import { testConnection } from './db/index.js';
import { runSchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';
import * as repo from './db/repository.js';
import * as authRepo from './db/auth.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const LEX_API_URL = process.env.LEX_API_URL || 'http://127.0.0.1:8001';
const UPLOADS_DIR = join(__dirname, 'uploads');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function initDatabase() {
  await testConnection();
  await runSchema();
  await seedDatabase();
  console.log('PostgreSQL connected and ready.');
}

await initDatabase();

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

const upload = multer({ dest: UPLOADS_DIR });

function getClientId(req, res) {
  const userId = Number(req.user?.userId || req.user?.sub);
  if (!userId || Number.isNaN(userId)) {
    res.status(401).json({ error: 'Invalid or missing user session' });
    return null;
  }
  return userId;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

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

  const order = await repo.createOrder(clientId, { templateId, templateName, formData });
  res.status(201).json(order);
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

// ─── Messages ───────────────────────────────────────────────────────────────

app.get('/api/v2/messages/threads', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;
  res.json(await repo.getThreads(clientId));
}));

app.post('/api/v2/messages/threads/:id/messages', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const { text, attachments = [] } = req.body;
  if (!text && attachments.length === 0) {
    return res.status(400).json({ error: 'Message text or attachments required' });
  }

  const msg = await repo.sendMessage(clientId, req.params.id, { text, attachments });
  res.status(201).json(msg);
}));

// ─── Appointments ───────────────────────────────────────────────────────────

app.post('/api/v2/appointments', authMiddleware, asyncHandler(async (req, res) => {
  const clientId = await getClientId(req, res);
  if (!clientId) return;

  const { lawyerName, slot, mode } = req.body;
  if (!lawyerName) {
    return res.status(400).json({ error: 'lawyerName is required' });
  }

  const result = await repo.bookAppointment(clientId, { lawyerName, slot, mode });
  res.status(201).json(result);
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

app.get('/api/v2/lawyers', authMiddleware, asyncHandler(async (req, res) => {
  const { city, practice, lang } = req.query;
  res.json(await repo.getLawyers({ city, practice, lang }));
}));

// ─── LEX AI proxy (Django) ─────────────────────────────────────────────────

async function proxyToLexAi(req, res, djangoPath) {
  try {
    const url = `${LEX_API_URL}${djangoPath}`;
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
  await proxyToLexAi(req, res, '/api/v1/lex/chat/');
}));

app.get('/api/v1/lex/sessions/', asyncHandler(async (req, res) => {
  await proxyToLexAi(req, res, '/api/v1/lex/sessions/');
}));

app.get('/api/v1/lex/sessions/:sessionKey/', asyncHandler(async (req, res) => {
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

// ─── LEX WebSocket (proxies to Django REST) ─────────────────────────────────

const wss = new WebSocketServer({ server, path: '/api/lex/ws' });

function mapLexWsResponse(data) {
  const isUrdu = data.language === 'UR' || /[\u0600-\u06FF]/.test(data.response || '');
  const shortcuts = data.show_lawyer
    ? [{ label: isUrdu ? 'وکیل تلاش کریں ←' : 'Find a Lawyer →', route: '/find-a-lawyer', icon: 'lawyer' }]
    : [];
  return { text: data.response, shortcuts };
}

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
  console.log(`NexusLexis LEX API v2.0 running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/api/lex/ws`);
});
