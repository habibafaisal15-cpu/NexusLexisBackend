import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { testConnection } from './db/index.js';
import { runSchema, seedDemoUsers } from './db/seed.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import { isEmailDeliveryConfigured, verifyEmailDelivery } from './services/emailService.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const app = express();

const allowAllOrigins = process.env.CORS_ALLOW_ALL === 'true';
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5175,http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowAllOrigins ? true : allowedOrigins,
  credentials: true
}));
app.use(express.json());

async function initDatabase() {
  await testConnection();
  await runSchema();
  await seedDemoUsers();
}

const IS_VERCEL = process.env.VERCEL === '1';

if (!IS_VERCEL || process.env.RUN_STARTUP_DB === 'true') {
  await initDatabase();
} else {
  console.log('[startup] Skipping DB init on Vercel (run db:migrate separately)');
}

app.get('/', (_req, res) => {
  res.json({
    service: 'NexusLexis Auth API',
    status: 'ok',
    endpoints: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      me: 'GET /api/auth/me',
      profile: 'GET /api/auth/profile',
      profileClient: 'PUT /api/auth/profile/client',
      profileLawyer: 'POST /api/auth/profile/lawyer/apply',
      profileCA: 'POST /api/auth/profile/ca/apply',
      googleUrl: 'GET /api/auth/google/url',
      googleToken: 'POST /api/auth/google/token'
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NexusLexis Auth API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/profile', profileRoutes);
app.use('/api/auth/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function startLocalServer() {
  app.listen(PORT, async () => {
    console.log(`NexusLexis Auth API running on http://localhost:${PORT}`);
    const isProduction = process.env.NODE_ENV === 'production';

    if (isEmailDeliveryConfigured()) {
      const delivery = await verifyEmailDelivery();
      if (delivery.ok) {
        console.log(`[signup-otp] Email delivery verified (${delivery.provider}) — OTP codes will be emailed`);
        if (delivery.sender) console.log(`[signup-otp] Sender: ${delivery.sender}`);
      } else {
        console.warn('[signup-otp] Email delivery configured but verification failed:');
        console.warn(delivery.error);
        if (delivery.raw && delivery.raw !== delivery.error) {
          console.warn(`[signup-otp] Detail: ${delivery.raw}`);
        }
        if (isProduction || process.env.REQUIRE_EMAIL_DELIVERY === 'true') {
          console.error('[signup-otp] Refusing to start without working email in production.');
          process.exit(1);
        }
      }
    } else if (isProduction || process.env.REQUIRE_EMAIL_DELIVERY === 'true') {
      console.error('[signup-otp] No email provider configured. Set MS365_* (Microsoft Graph) in .env');
      process.exit(1);
    } else {
      console.warn('[signup-otp] No email provider configured — set MS365_* in .env for real OTP delivery');
    }
  });
}

if (!IS_VERCEL) {
  startLocalServer();
}

export default app;
