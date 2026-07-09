import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { signToken, authMiddleware } from './middleware/auth.js';
import { loadStore, getStore, saveStore, getWorkspace, addActivity } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = join(__dirname, 'uploads');

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

loadStore();

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

const upload = multer({ dest: UPLOADS_DIR });

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate() {
  return new Date().toISOString().split('T')[0];
}

// ─── Auth ───────────────────────────────────────────────────────────────────

app.post('/api/v2/auth/session', (_req, res) => {
  const payload = {
    sub: 'org-cl-10928',
    name: 'Habib Corporate Solutions Ltd',
    roles: ['CorporateClient', 'RetainerPremium']
  };
  const token = signToken(payload);
  res.json({ token, user: payload });
});

// ─── Workspace bootstrap ────────────────────────────────────────────────────

app.get('/api/v2/workspace', authMiddleware, (_req, res) => {
  res.json(getWorkspace());
});

// ─── Notifications ──────────────────────────────────────────────────────────

app.get('/api/v2/notifications', authMiddleware, (_req, res) => {
  res.json(getStore().notifications);
});

app.delete('/api/v2/notifications/:id', authMiddleware, (req, res) => {
  const store = getStore();
  const id = Number(req.params.id);
  store.notifications = store.notifications.filter((n) => n.id !== id);
  saveStore();
  res.json({ success: true });
});

app.delete('/api/v2/notifications', authMiddleware, (_req, res) => {
  const store = getStore();
  store.notifications = [];
  saveStore();
  res.json({ success: true });
});

// ─── Orders ─────────────────────────────────────────────────────────────────

app.get('/api/v2/orders', authMiddleware, (_req, res) => {
  res.json(getStore().orders);
});

app.post('/api/v2/orders', authMiddleware, (req, res) => {
  const { templateId, templateName, formData } = req.body;
  if (!templateId || !templateName) {
    return res.status(400).json({ error: 'templateId and templateName are required' });
  }

  const store = getStore();
  const newOrder = {
    id: String(store.nextOrderId++),
    templateId,
    templateName,
    status: 'Pending Payment',
    date: formatDate(),
    formData: formData || {}
  };

  store.orders.unshift(newOrder);
  store.stats.activeOrders += 1;

  addActivity({
    id: `act-${Date.now()}`,
    type: 'order',
    langKey: 'DocStarted',
    params: { doc: templateName },
    timestamp: new Date().toISOString(),
    timeAgo: 'Just now'
  });

  saveStore();
  res.status(201).json(newOrder);
});

// ─── Matters (VLO) ──────────────────────────────────────────────────────────

app.get('/api/v2/vlo/matters', authMiddleware, (_req, res) => {
  res.json(getStore().matters);
});

app.post('/api/v2/vlo/matters', authMiddleware, upload.array('files', 10), (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const files = (req.files || []).map((f) => f.originalname || f.filename);

  const store = getStore();
  const newMatter = {
    id: `m-${Date.now()}`,
    title,
    status: 'Awaiting Counsel Vetting',
    date: formatDate(),
    description,
    files
  };

  store.matters.unshift(newMatter);

  addActivity({
    id: `act-${Date.now()}`,
    type: 'matter',
    langKey: 'UploadMatter',
    params: { title },
    timestamp: new Date().toISOString(),
    timeAgo: 'Just now'
  });

  saveStore();
  res.status(201).json(newMatter);
});

app.get('/api/vlo/matters/download/:id', authMiddleware, (req, res) => {
  const store = getStore();
  const matter = store.matters.find((m) => m.id === req.params.id);
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
});

// ─── Messages ───────────────────────────────────────────────────────────────

app.get('/api/v2/messages/threads', authMiddleware, (_req, res) => {
  res.json(getStore().threads);
});

app.post('/api/v2/messages/threads/:id/messages', authMiddleware, (req, res) => {
  const { text, attachments = [] } = req.body;
  if (!text && attachments.length === 0) {
    return res.status(400).json({ error: 'Message text or attachments required' });
  }

  const store = getStore();
  const thread = store.threads.find((t) => t.id === req.params.id);
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const newMsg = {
    id: Date.now(),
    sender: 'user',
    text: text || '',
    attachments,
    timestamp: formatTime()
  };

  thread.messages.push(newMsg);
  thread.lastMessage = text || 'File Attachment';
  thread.lastUpdated = 'Just now';

  addActivity({
    id: `act-${Date.now()}`,
    type: 'message',
    langKey: 'Message',
    params: { id: req.params.id.replace('t-', '') },
    timestamp: new Date().toISOString(),
    timeAgo: 'Just now'
  });

  saveStore();
  res.status(201).json(newMsg);
});

// ─── Appointments ───────────────────────────────────────────────────────────

app.post('/api/v2/appointments', authMiddleware, (req, res) => {
  const { lawyerName, slot, mode } = req.body;
  if (!lawyerName) {
    return res.status(400).json({ error: 'lawyerName is required' });
  }

  const store = getStore();
  store.stats.appointments += 1;

  addActivity({
    id: `act-${Date.now()}`,
    type: 'booking',
    langKey: 'Booked',
    params: { name: lawyerName },
    timestamp: new Date().toISOString(),
    timeAgo: 'Just now'
  });

  saveStore();
  res.status(201).json({ success: true, lawyerName, slot, mode });
});

// ─── Subscription ───────────────────────────────────────────────────────────

app.get('/api/v2/subscription', authMiddleware, (_req, res) => {
  res.json(getStore().subscription);
});

app.post('/api/v2/subscription/cancel', authMiddleware, (_req, res) => {
  const store = getStore();
  store.stats.retainerTier = 'None';

  addActivity({
    id: `act-${Date.now()}`,
    type: 'billing',
    langKey: 'Cancelled',
    params: {},
    timestamp: new Date().toISOString(),
    timeAgo: 'Just now'
  });

  saveStore();
  res.json({ success: true });
});

// ─── Invoices ───────────────────────────────────────────────────────────────

app.get('/api/v2/invoices', authMiddleware, (_req, res) => {
  res.json(getStore().invoices);
});

// ─── Evaluations ────────────────────────────────────────────────────────────

app.post('/api/v2/evaluations', authMiddleware, (req, res) => {
  const { rating, comment, threadId } = req.body;
  if (!rating) {
    return res.status(400).json({ error: 'rating is required' });
  }
  res.status(201).json({ success: true, rating, comment, threadId });
});

// ─── Lawyers ────────────────────────────────────────────────────────────────

app.get('/api/v2/lawyers', authMiddleware, (req, res) => {
  const store = getStore();
  let lawyers = store.lawyers;

  const { city, practice, lang } = req.query;
  if (city) lawyers = lawyers.filter((l) => l.city.toLowerCase() === city.toLowerCase());
  if (practice) lawyers = lawyers.filter((l) => l.practiceArea.toLowerCase().includes(practice.toLowerCase()));
  if (lang) lawyers = lawyers.filter((l) => l.language.toLowerCase() === lang.toLowerCase());

  res.json(lawyers);
});

// ─── Health check ───────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NexusLexis LEX API v2.0' });
});

// ─── LEX WebSocket ──────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/api/lex/ws' });

function generateLexResponse(query, lang) {
  const q = query.toLowerCase();
  const isUrdu = lang === 'ur' || /[\u0600-\u06FF]/.test(query);

  let text = isUrdu
    ? 'میں پاکستان کے قوانین کے بارے میں آپ کی مدد کے لیے یہاں ہوں۔'
    : 'I am scanning the statutes of Pakistan. For comprehensive guidelines, consider consulting with high court advocates.';
  let shortcuts = [];

  if (q.includes('lawyer') || q.includes('وکیل') || q.includes('advocate')) {
    text = isUrdu
      ? 'ہمارے پاس مختلف شہروں کے تصدیق شدہ وکلاء موجود ہیں۔ نیچے دیے گئے بٹن سے وکیل تلاش کریں۔'
      : 'You can query our professional directories to find advocates. Use the link shortcut below.';
    shortcuts = [{ label: 'Find a Lawyer', route: '/find-a-lawyer', icon: 'lawyer' }];
  } else if (q.includes('document') || q.includes('دستاویز') || q.includes('agreement') || q.includes('secp')) {
    text = isUrdu
      ? 'معاہدہ یا کمپنی رجسٹریشن ڈرافٹ کے لیے ہمارے پاس فارم ٹیمپلیٹس موجود ہیں۔'
      : 'Choose from our dynamic intake templates to compile statutory document packages.';
    shortcuts = [{ label: 'Knowledge Bank', route: '/account/knowledge', icon: 'document' }];
  } else if (q.includes('calculator') || q.includes('فیس') || q.includes('fee')) {
    text = isUrdu
      ? 'نیکسس فیس کیلکولیٹر سے آپ مختلف قوانین اور ڈرافٹ فیسیں چیک کر سکتے ہیں۔'
      : 'Open the knowledge fee calculator app to check SECP or IPO registration pricing.';
    shortcuts = [{ label: 'Fee Calculators', route: '/knowledge/calculators', icon: 'calculator' }];
  } else if (q.includes('retainer') || q.includes('vlo') || q.includes('corporate')) {
    text = isUrdu
      ? 'آپ اپنے کارپوریٹ ریٹینر ورک اسپیس میں معاملات جمع کرا سکتے ہیں۔'
      : 'Access your Corporate Retainer workspace to submit matters for counsel review.';
    shortcuts = [{ label: 'Corporate Retainer', route: '/account/vlo', icon: 'document' }];
  } else if (q.includes('message') || q.includes('پیغام')) {
    text = isUrdu
      ? 'آپ اپنے وکیل کے ساتھ محفوظ پیغامات کے ذریعے رابطہ کر سکتے ہیں۔'
      : 'Communicate securely with your assigned advocates via the messaging hub.';
    shortcuts = [{ label: 'Messages', route: '/account/messages', icon: 'lawyer' }];
  }

  return { text, shortcuts };
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const { query, lang } = JSON.parse(raw.toString());
      const response = generateLexResponse(query || '', lang || 'en');
      setTimeout(() => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(response));
        }
      }, 600);
    } catch {
      ws.send(JSON.stringify({ text: 'Sorry, I could not process that request.', shortcuts: [] }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`NexusLexis LEX API v2.0 running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/api/lex/ws`);
});
