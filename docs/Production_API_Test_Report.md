# Production API Test Report

**Last run:** see `production-api-test-report.json`  
**Run tests:** `node scripts/test-production-apis.mjs`

## Production URLs (frontend `.env`)

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
```

## Auth API — verified endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | OK |
| GET | `/api/auth/config` | `signupOtpRequired: false`, `passwordResetOtpRequired: false` |
| GET | `/api/auth/roles` | `client`, `lawyer`, `ca` |
| GET | `/api/auth/google/url` | Returns Google OAuth URL |
| POST | `/api/auth/register/validate` | Email availability |
| POST | `/api/auth/register` | Client → `Approved`; Lawyer/CA → `ApplicationRequired` |
| POST | `/api/auth/login` | Returns tokens + `verificationStatus`, `canAccessDashboard`, `nextStep` |
| POST | `/api/auth/refresh` | Rotates refresh token |
| POST | `/api/auth/forgot-password` | Returns `resetToken` directly (OTP skipped) |
| POST | `/api/auth/reset-password` | `{ email, resetToken, password }` |
| GET | `/api/auth/me` | Current user + profile |
| GET | `/api/auth/profile` | Profile bundle |
| POST | `/api/auth/profile/lawyer/apply` | Submit lawyer application |
| POST | `/api/auth/profile/ca/apply` | Submit CA application |
| GET | `/api/auth/admin/applications` | Admin only — pending verifications |

## Main API — verified endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | No | DB connected |
| GET | `/api/v2/lawyers/public` | No | Marketplace |
| GET | `/api/v2/cas/public` | No | CA marketplace |
| GET | `/api/v2/library/catalog` | No | `{ categories[], templateCount }` |
| GET | `/api/v2/library/templates/:slug` | No | Template detail |
| GET | `/api/v2/workspace` | Yes | Client dashboard bootstrap |
| GET | `/api/v2/notifications` | Yes | |
| GET | `/api/v2/orders` | Yes | |
| GET | `/api/v2/appointments` | Yes | |
| GET | `/api/v2/documents` | Yes | Client document orders |
| GET | `/api/v2/vlo/matters` | Yes | Virtual legal office |
| GET | `/api/v2/invoices` | Yes | |
| GET | `/api/v2/subscription` | Yes | |
| GET | `/api/v2/messages/threads` | Yes | **Not** `/messages` — use `/messages/threads` |
| GET | `/api/v2/messages/unread-count` | Yes | |
| GET | `/api/v2/lawyer/dashboard` | Yes | Header: `X-Client-Role: LegalAdvocate` |
| GET | `/api/v2/ca/dashboard` | Yes | CA role token |

## LEX AI — verified

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/lex/chat/` | `{ message }` → `{ response }` |
| GET | `/api/v1/lex/sessions/` | Returns `[]` (inline mode) |

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Client | `client@nexuslexis.law` | `password123` |
| Lawyer | `lawyer@nexuslexis.law` | `password123` |
| CA | `ca@nexuslexis.law` | `password123` |
| Admin | `admin@nexuslexis.law` | `admin123` |

## Frontend integration notes

1. **OTP skipped** — register directly; forgot-password returns `resetToken` in response (no email).
2. **Lawyer/CA signup** — after register, redirect to application form; call `POST /profile/lawyer/apply` or `/ca/apply`.
3. **Messages** — use `GET /api/v2/messages/threads`, not `GET /api/v2/messages`.
4. **Library catalog** — response shape is `{ categories: [{ templates: [...] }], templateCount }`.
5. **Admin panel** — base path is `/api/auth/admin/*` on Auth API, not `/api/admin/*`.

## Latest test result: **51/54 passed**

Three failures are fixed in this repo but require **redeploy** to production:

| Endpoint | Error | Fix |
|----------|-------|-----|
| `POST /api/auth/reset-password` | duplicate `users_username_key` | `auth_backend/db/userSync.js` — don't rename user on password reset |
| `POST /api/v2/auth/session` | Demo client not configured | `db/repository.js` — default demo email → `client@nexuslexis.law` |
| `GET /api/v2/documents` | `column so.created_at does not exist` | `db/repository.js` — removed missing column from query |

After redeploying **Auth API** (45v4) and **Main API** (ql8w), re-run tests — expect **54/54 pass**.

## Known issues (fixed in repo, deploy Main API to apply)

- `GET /api/v2/documents` — was 500 (`column so.created_at does not exist`) — fixed in `db/repository.js`
- `POST /api/v2/auth/session` — demo session used wrong default email — fixed (`client@nexuslexis.law`)
