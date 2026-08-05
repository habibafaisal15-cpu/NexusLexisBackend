/**
 * Production smoke test for NexusLexis APIs (Auth + Main + LEX).
 * Usage: node scripts/test-production-apis.mjs
 */

const AUTH = 'https://nexus-lexis-backend-45v4.vercel.app';
const MAIN = 'https://nexus-lexis-backend-ql8w.vercel.app';

const results = [];

function record(name, cond, ms, detail = '') {
  const pass = Boolean(cond);
  results.push({ name, ok: pass, ms, detail });
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`${icon} | ${String(ms).padStart(5)}ms | ${name}${detail ? ` — ${detail}` : ''}`);
}

async function req(method, url, { body, token, headers = {}, timeout = 45000, retries = 2 } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
      return {
        ok: res.ok,
        status: res.status,
        ms: Date.now() - started,
        data,
        error: res.ok ? null : (data?.error || data?.message || `HTTP ${res.status}`),
      };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return {
        ok: false,
        status: 0,
        ms: Date.now() - started,
        data: null,
        error: err.message || 'Network error',
      };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, ms: 0, data: null, error: lastErr?.message || 'Network error' };
}

const LAWYER_APPLY_BODY = {
  barCouncilName: 'Punjab Bar Council',
  barCouncilNumber: `PBC-${Date.now()}`,
  city: 'Lahore',
  shortBio: 'Corporate and commercial law.',
  fullBio: 'Experienced advocate specializing in corporate law and contracts.',
  officeAddress: '123 Mall Road, Lahore',
  onlineFee: 5000,
  inPersonFee: 8000,
  practiceAreas: ['Corporate Law'],
  languages: ['English', 'Urdu'],
};

const CA_APPLY_BODY = {
  cnic: `${Date.now()}`.slice(-13).padStart(13, '1'),
  qualification: 'FCA',
  city: 'Karachi',
  fees: 10000,
  shortBio: 'Tax and audit specialist.',
};

async function run() {
  console.log('\n=== NEXUSLEXIS PRODUCTION API TEST ===\n');
  const rand = Date.now();
  let clientToken = null;
  let clientRefresh = null;
  let lawyerToken = null;
  let caToken = null;
  let demoLawyerToken = null;
  let demoCaToken = null;
  let demoAdminToken = null;
  let resetToken = null;
  let librarySlug = null;

  // ── Auth: health & config ──
  let r = await req('GET', `${AUTH}/api/health`);
  record('Auth GET /api/health', r.ok && r.data?.status === 'ok', r.ms);

  r = await req('GET', `${AUTH}/api/auth/config`);
  record('Auth GET /api/auth/config', r.ok && r.data?.signupOtpRequired === false, r.ms,
    `otpSkipped=${!r.data?.signupOtpRequired}`);

  r = await req('GET', `${AUTH}/api/auth/roles`);
  record('Auth GET /api/auth/roles', r.ok && Array.isArray(r.data?.registerRoles), r.ms);

  r = await req('GET', `${AUTH}/api/auth/google/url`);
  record('Auth GET /api/auth/google/url', r.ok && r.data?.url?.includes('google'), r.ms);

  // ── Auth: validate email ──
  r = await req('POST', `${AUTH}/api/auth/register/validate`, {
    body: { email: `prodtest.${rand}@gmail.com` },
  });
  record('Auth POST /register/validate', r.ok && r.data?.available === true, r.ms);

  // ── Auth: register client ──
  const clientEmail = `client.prod.${rand}@gmail.com`;
  r = await req('POST', `${AUTH}/api/auth/register`, {
    body: {
      fullName: 'Prod Test Client',
      email: clientEmail,
      password: 'Asdf1234',
      role: 'client',
      phone: '03001234567',
    },
  });
  const clientOk = r.ok && r.data?.accessToken && r.data?.user?.verificationStatus === 'Approved';
  record('Auth POST /register (client)', clientOk, r.ms,
    clientOk ? 'tokens+Approved' : JSON.stringify(r.data).slice(0, 80));
  clientToken = r.data?.accessToken;
  clientRefresh = r.data?.refreshToken;

  // ── Auth: register lawyer ──
  r = await req('POST', `${AUTH}/api/auth/register`, {
    body: {
      fullName: 'Prod Test Lawyer',
      email: `lawyer.prod.${rand}@gmail.com`,
      password: 'Asdf1234',
      role: 'lawyer',
    },
  });
  const lawyerOk = r.ok && r.data?.accessToken && r.data?.user?.verificationStatus === 'ApplicationRequired';
  record('Auth POST /register (lawyer)', lawyerOk, r.ms,
    lawyerOk ? `nextStep=${r.data?.user?.nextStep}` : JSON.stringify(r.data).slice(0, 80));
  lawyerToken = r.data?.accessToken;

  // ── Auth: register ca ──
  r = await req('POST', `${AUTH}/api/auth/register`, {
    body: {
      fullName: 'Prod Test CA',
      email: `ca.prod.${rand}@gmail.com`,
      password: 'Asdf1234',
      role: 'ca',
    },
  });
  const caOk = r.ok && r.data?.accessToken && r.data?.user?.verificationStatus === 'ApplicationRequired';
  record('Auth POST /register (ca)', caOk, r.ms,
    caOk ? `nextStep=${r.data?.user?.nextStep}` : JSON.stringify(r.data).slice(0, 80));
  caToken = r.data?.accessToken;

  // ── Auth: demo logins ──
  for (const [label, email, password] of [
    ['client', 'client@nexuslexis.law', 'password123'],
    ['lawyer', 'lawyer@nexuslexis.law', 'password123'],
    ['ca', 'ca@nexuslexis.law', 'password123'],
    ['admin', 'admin@nexuslexis.law', 'admin123'],
  ]) {
    r = await req('POST', `${AUTH}/api/auth/login`, { body: { email, password } });
    const ok = r.ok && r.data?.accessToken;
    record(`Auth POST /login (demo ${label})`, ok, r.ms,
      ok ? r.data?.user?.verificationStatus || r.data?.user?.role : JSON.stringify(r.data).slice(0, 60));
    if (ok) {
      if (label === 'client' && !clientToken) {
        clientToken = r.data.accessToken;
        clientRefresh = r.data.refreshToken;
      }
      if (label === 'lawyer') demoLawyerToken = r.data.accessToken;
      if (label === 'ca') demoCaToken = r.data.accessToken;
      if (label === 'admin') demoAdminToken = r.data.accessToken;
    }
  }

  // ── Auth: me & profile ──
  if (clientToken) {
    r = await req('GET', `${AUTH}/api/auth/me`, { token: clientToken });
    record('Auth GET /me', r.ok && r.data?.user?.email, r.ms);

    r = await req('GET', `${AUTH}/api/auth/profile`, { token: clientToken });
    record('Auth GET /profile', r.ok && r.data?.profile !== undefined, r.ms);
  } else {
    record('Auth GET /me', false, 0, 'skipped — no token');
    record('Auth GET /profile', false, 0, 'skipped — no token');
  }

  // ── Auth: refresh (use demo client for stable token) ──
  r = await req('POST', `${AUTH}/api/auth/login`, {
    body: { email: 'client@nexuslexis.law', password: 'password123' },
  });
  const demoRefresh = r.data?.refreshToken;
  if (demoRefresh) {
    r = await req('POST', `${AUTH}/api/auth/refresh`, {
      body: { refreshToken: demoRefresh },
    });
    record('Auth POST /refresh', r.ok === true && Boolean(r.data?.accessToken), r.ms,
      r.error || '');
    if (r.ok && r.data?.accessToken) clientToken = r.data.accessToken;
  } else {
    record('Auth POST /refresh', false, 0, 'skipped — no refresh token');
  }

  // ── Auth: forgot-password + reset-password (OTP skipped) ──
  r = await req('POST', `${AUTH}/api/auth/forgot-password`, {
    body: { email: clientEmail },
  });
  const forgotOk = r.ok === true && Boolean(r.data?.resetToken);
  record('Auth POST /forgot-password', forgotOk, r.ms,
    forgotOk ? 'resetToken returned' : (r.error || JSON.stringify(r.data).slice(0, 80)));
  resetToken = r.data?.resetToken;

  if (resetToken) {
    r = await req('POST', `${AUTH}/api/auth/reset-password`, {
      body: { email: clientEmail, resetToken, password: 'NewPass1234' },
    });
    record('Auth POST /reset-password', r.ok === true, r.ms, r.error || '');

    r = await req('POST', `${AUTH}/api/auth/login`, {
      body: { email: clientEmail, password: 'NewPass1234' },
    });
    if (r.ok && r.data?.accessToken) {
      clientToken = r.data.accessToken;
      clientRefresh = r.data.refreshToken;
    }
  } else {
    record('Auth POST /reset-password', false, 0, 'skipped — no resetToken');
  }

  // ── Auth: lawyer pending me ──
  if (lawyerToken) {
    r = await req('GET', `${AUTH}/api/auth/me`, { token: lawyerToken });
    record('Auth GET /me (lawyer pending)', r.ok && r.data?.user?.role === 'lawyer', r.ms,
      r.data?.user?.verificationStatus || '');

    r = await req('POST', `${AUTH}/api/auth/profile/lawyer/apply`, {
      token: lawyerToken,
      body: LAWYER_APPLY_BODY,
    });
    record('Auth POST /profile/lawyer/apply', r.ok && r.data?.profile, r.ms,
      r.data?.profile?.verificationStatus || JSON.stringify(r.data).slice(0, 60));
  }

  // ── Auth: ca apply ──
  if (caToken) {
    r = await req('POST', `${AUTH}/api/auth/profile/ca/apply`, {
      token: caToken,
      body: CA_APPLY_BODY,
    });
    record('Auth POST /profile/ca/apply', r.ok && r.data?.profile, r.ms,
      r.data?.profile?.verificationStatus || JSON.stringify(r.data).slice(0, 60));
  }

  // ── Auth: admin applications ──
  if (demoAdminToken) {
    r = await req('GET', `${AUTH}/api/auth/admin/applications`, { token: demoAdminToken });
    record('Auth GET /admin/applications', r.ok === true && Array.isArray(r.data?.applications), r.ms,
      r.error || `${r.data?.applications?.length ?? 0} pending`);
  } else {
    record('Auth GET /admin/applications', false, 0, 'skipped — no admin token');
  }

  // ── Main: health ──
  r = await req('GET', `${MAIN}/api/health`);
  record('Main GET /api/health', r.ok && r.data?.status === 'ok', r.ms);

  r = await req('GET', `${MAIN}/`);
  record('Main GET /', r.ok && r.data?.status === 'ok', r.ms);

  r = await req('POST', `${MAIN}/api/v2/auth/session`);
  record('Main POST /auth/session (demo)', r.ok && (r.data?.token || r.data?.accessToken), r.ms, r.error || '');

  // ── Main: public routes ──
  r = await req('GET', `${MAIN}/api/v2/lawyers/public`);
  record('Main GET /lawyers/public', r.ok, r.ms,
    Array.isArray(r.data?.lawyers ?? r.data) ? `${(r.data?.lawyers ?? r.data).length} lawyers` : '');

  r = await req('GET', `${MAIN}/api/v2/cas/public`);
  record('Main GET /cas/public', r.ok, r.ms);

  r = await req('GET', `${MAIN}/api/v2/library/catalog`);
  const catalogOk = r.ok === true;
  const categories = r.data?.categories || [];
  for (const cat of categories) {
    if (cat.templates?.[0]?.slug) {
      librarySlug = cat.templates[0].slug;
      break;
    }
  }
  record('Main GET /library/catalog', catalogOk, r.ms,
    catalogOk ? `${r.data?.templateCount ?? 0} templates` : r.error);

  if (librarySlug) {
    r = await req('GET', `${MAIN}/api/v2/library/templates/${librarySlug}`);
    record('Main GET /library/templates/:slug', r.ok && r.data?.slug, r.ms, r.error || librarySlug);
  } else {
    record('Main GET /library/templates/:slug', false, 0, 'skipped — no slug');
  }

  // ── Main: client authed routes ──
  if (clientToken) {
    const clientRoutes = [
      ['GET', '/workspace', (d) => d !== undefined],
      ['GET', '/notifications', (d) => d !== undefined],
      ['GET', '/orders', (d) => d !== undefined],
      ['GET', '/appointments', (d) => d !== undefined],
      ['GET', '/subscription', (d) => d !== undefined],
      ['GET', '/documents', (d) => d !== undefined],
      ['GET', '/vlo/matters', (d) => d !== undefined],
      ['GET', '/invoices', (d) => d !== undefined],
      ['GET', '/lawyers', (d) => d !== undefined],
    ];
    for (const [method, path, check] of clientRoutes) {
      r = await req(method, `${MAIN}/api/v2${path}`, { token: clientToken });
      record(`Main ${method} ${path}`, r.ok === true && check(r.data), r.ms, r.error || '');
    }

    r = await req('GET', `${MAIN}/api/v2/messages/threads`, { token: clientToken });
    record('Main GET /messages/threads', r.ok && Array.isArray(r.data?.threads), r.ms,
      `unread=${r.data?.unreadCount ?? 0}`);

    r = await req('GET', `${MAIN}/api/v2/messages/unread-count`, { token: clientToken });
    record('Main GET /messages/unread-count', r.ok && typeof r.data?.unreadCount === 'number', r.ms);
  } else {
    ['workspace', 'notifications', 'orders', 'appointments', 'subscription', 'documents', 'vlo/matters', 'invoices', 'lawyers', 'messages/threads', 'messages/unread-count'].forEach((p) => {
      record(`Main GET /${p}`, false, 0, 'skipped — no token');
    });
  }

  // ── Main: lawyer dashboard routes ──
  if (demoLawyerToken) {
    const lawyerHeaders = { 'X-Client-Role': 'LegalAdvocate' };
    for (const path of ['/dashboard', '/appointments', '/orders', '/notifications', '/subscription']) {
      r = await req('GET', `${MAIN}/api/v2/lawyer${path}`, { token: demoLawyerToken, headers: lawyerHeaders });
      record(`Main GET /lawyer${path}`, r.ok, r.ms);
    }
    r = await req('GET', `${MAIN}/api/v2/lawyer/messages/threads`, { token: demoLawyerToken, headers: lawyerHeaders });
    record('Main GET /lawyer/messages/threads', r.ok && Array.isArray(r.data?.threads), r.ms);
  } else {
    record('Main GET /lawyer/dashboard', false, 0, 'skipped — no lawyer token');
  }

  // ── Main: CA dashboard routes ──
  if (demoCaToken) {
    for (const path of ['/dashboard', '/appointments', '/notifications', '/subscription']) {
      r = await req('GET', `${MAIN}/api/v2/ca${path}`, { token: demoCaToken });
      record(`Main GET /ca${path}`, r.ok, r.ms);
    }
    r = await req('GET', `${MAIN}/api/v2/ca/messages/threads`, { token: demoCaToken });
    record('Main GET /ca/messages/threads', r.ok && Array.isArray(r.data?.threads), r.ms);
  } else {
    record('Main GET /ca/dashboard', false, 0, 'skipped — no ca token');
  }

  // ── LEX ──
  r = await req('POST', `${MAIN}/api/v1/lex/chat/`, {
    body: { message: 'Hello' },
    timeout: 60000,
  });
  record('LEX POST /chat (Hello)', r.ok && r.data?.response, r.ms, r.error || '');

  r = await req('POST', `${MAIN}/api/v1/lex/chat/`, {
    body: { message: 'what is the weather?' },
    timeout: 60000,
  });
  record('LEX POST /chat (off-topic)', r.ok && r.data?.response, r.ms, r.error || '');

  r = await req('POST', `${MAIN}/api/v1/lex/chat/`, {
    body: { message: 'How do I register a company in Pakistan?' },
    timeout: 90000,
  });
  record('LEX POST /chat (law question)', r.ok && r.data?.response?.length > 50, r.ms,
    r.data?.response ? `${r.data.response.length} chars` : '');

  r = await req('GET', `${MAIN}/api/v1/lex/sessions/`);
  record('LEX GET /sessions', r.ok && Array.isArray(r.data), r.ms);

  // ── Summary ──
  const passed = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok);
  console.log(`\n=== SUMMARY: ${passed}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail || `HTTP error`}`));
    process.exitCode = 1;
  } else {
    console.log('\nAll production APIs OK for frontend integration.\n');
  }

  // Write JSON report for frontend team
  const report = {
    testedAt: new Date().toISOString(),
    authBase: `${AUTH}/api/auth`,
    mainBase: `${MAIN}/api/v2`,
    lexBase: `${MAIN}/api/v1/lex`,
    passed,
    total: results.length,
    results,
  };
  const { writeFileSync } = await import('fs');
  writeFileSync('docs/production-api-test-report.json', JSON.stringify(report, null, 2));
  console.log('Report saved: docs/production-api-test-report.json');
}

run().catch((err) => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
