---
Document Title:    Nexus Lexis — Complete API Reference
Document ID:        NL-DOC-API-001
Version:            1.1
Last Updated:       2026-07-29
Classification:     Internal — Technical Reference
Owner:              Nexus Lexis Engineering
Applies To:         Main API · Auth API · LEX AI · External consumers (mainsite)
---

# Nexus Lexis Platform
## Complete API Reference

---

## 1. Purpose & Scope

This document catalogs **every HTTP and WebSocket API** exposed by the Nexus Lexis backend, including:

- Full URL (default localhost ports)
- HTTP method
- Authentication requirements
- Purpose / behaviour
- Source file where the route is defined
- Proxy relationships between services
- Intended consumer (external **mainsite** frontend — not in this repo)

**Production base URLs (Vercel):**

| Service | Base URL |
|---------|----------|
| Main API | `https://nexus-lexis-backend-ql8w.vercel.app` |
| Auth API | `https://nexus-lexis-backend-45v4.vercel.app` |
| Auth (via proxy) | `https://nexus-lexis-backend-ql8w.vercel.app/api/auth` |
| LEX AI (proxied) | `https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex` |

**Default base URLs (development):**

| Service | Base URL | Source entry |
|---------|----------|--------------|
| Main API | `http://localhost:3000` | `server.js` |
| Auth API | `http://localhost:3001` | `auth_backend/server.js` |
| LEX AI (Django) | `http://localhost:8001` | `lex_backend/manage.py runserver 8001` |

> **Note:** All Auth API routes are also reachable via Main API proxy at `http://localhost:3000/api/auth/*`.

---

## 2. Architecture

```
External Frontend (mainsite, port 5173)
        │
        ▼
Main API :3000 ──proxy──► Auth API :3001  (/api/auth/*)
        │
        ├──proxy──► LEX AI :8001  (/api/v1/lex/*)
        │
        └── WebSocket ws://localhost:3000/api/lex/ws
```

---

## 3. Authentication & Headers

### 3.1 JWT Bearer token

Most protected routes require:

```
Authorization: Bearer <JWT>
Content-Type: application/json
```

JWT is issued by Auth API (`/api/auth/login`, `/api/auth/register`) or Main API legacy routes (`/api/v2/auth/*`).

**Signing secret:** `JWT_SECRET` in `.env` / `auth_backend/.env`

### 3.2 Main API dev mock auth

`middleware/auth.js` accepts mock tokens (`mock-jwt-token-*`) when paired with:

| Header | Example | Purpose |
|--------|---------|---------|
| `X-Client-Role` | `CorporateClient` | Maps to demo user by role |
| `X-Workspace-Context` | `HabibCorp` | Workspace label (optional) |

Role map: `CorporateClient` → client@, `LegalAdvocate` → lawyer@, `CharteredAccountant` → ca@, `Admin` → admin@

### 3.3 Admin routes

Auth admin routes require JWT with **`role: admin`** (`adminMiddleware` in `auth_backend/middleware/auth.js`).

### 3.4 Role-gated dashboard routes

| Prefix | Required role |
|--------|---------------|
| `/api/v2/lawyer/*` | Lawyer (`role === 'lawyer'` or `LegalAdvocate`) |
| `/api/v2/ca/*` | CA (`role === 'ca'` or `CharteredAccountant`) |
| `/api/v2/*` (client) | Client JWT / valid user session |

### 3.5 CORS

Allowed origins from `FRONTEND_URLS` (default `http://localhost:5173`). Set `CORS_ALLOW_ALL=true` for open CORS in dev.

---

## 4. Main API — All Routes (`http://localhost:3000`)

**Source:** `server.js`, `routes/lawyerRoutes.js`, `routes/caRoutes.js`, `routes/messageRoutes.js`

### 4.1 Health & Static

| Method | URL | Auth | Purpose | Source |
|--------|-----|------|---------|--------|
| GET | `/api/health` | Public | Health check + DB status | `server.js` |
| GET | `/uploads/*` | Public | Static uploaded files | `server.js` |

### 4.2 Auth Proxy (forwards ALL methods to Auth API)

| Method | URL (Main API) | Proxied to | Auth | Purpose | Source |
|--------|----------------|------------|------|---------|--------|
| ALL | `/api/auth/*` | `http://localhost:3001/api/auth/*` | Varies | Transparent auth/profile/admin proxy | `server.js` |

Forwards `Authorization` header. Enables single ngrok tunnel for frontend dev.

### 4.3 Legacy Client Portal Auth (Main API local)

| Method | URL | Auth | Request body | Response | Purpose | Source |
|--------|-----|------|--------------|----------|---------|--------|
| POST | `/api/v2/auth/register` | Public | `{ name, email, password }` | `{ token, user }` | Register corporate client | `server.js` |
| POST | `/api/v2/auth/login` | Public | `{ email, password }` | `{ token, user }` | Client-only login (403 if non-client) | `server.js` |
| GET | `/api/v2/auth/me` | JWT | — | `{ user }` | Current client profile | `server.js` |
| POST | `/api/v2/auth/session` | Public | — | `{ token, user }` | Demo client session token | `server.js` |

**Used by:** Legacy client dashboard integrations. Mainsite should prefer Auth API `/api/auth/*` via proxy.

### 4.4 Client Workspace

| Method | URL | Auth | Query / Body | Purpose | Source |
|--------|-----|------|--------------|---------|--------|
| GET | `/api/v2/workspace` | JWT | — | Bootstrap all dashboard data | `server.js` |
| GET | `/api/v2/notifications` | JWT | — | List notifications | `server.js` |
| DELETE | `/api/v2/notifications/:id` | JWT | — | Dismiss one notification | `server.js` |
| DELETE | `/api/v2/notifications` | JWT | — | Clear all notifications | `server.js` |

### 4.5 Document Library (public catalog)

| Method | URL | Auth | Query params | Purpose | Source |
|--------|-----|------|--------------|---------|--------|
| GET | `/api/v2/library/catalog` | Public | `?category`, `?search` | Template catalog | `server.js` |
| GET | `/api/v2/library/templates/:slug` | Public | — | Single template by slug | `server.js` |

### 4.6 Client Documents & Orders

| Method | URL | Auth | Notes | Purpose | Source |
|--------|-----|------|-------|---------|--------|
| GET | `/api/v2/documents` | JWT | `?status` | List client documents | `server.js` |
| GET | `/api/v2/documents/:orderNumber` | JWT | — | Single document order | `server.js` |
| GET | `/api/v2/documents/:orderNumber/download` | JWT | — | Download completed document | `server.js` |
| GET | `/api/v2/orders` | JWT | — | List orders | `server.js` |
| POST | `/api/v2/orders` | JWT | `{ templateSlug, ... }` | Create order from template | `server.js` |

### 4.7 Virtual Legal Office (VLO) Matters

| Method | URL | Auth | Notes | Purpose | Source |
|--------|-----|------|-------|---------|--------|
| GET | `/api/v2/vlo/matters` | JWT | — | List client matters | `server.js` |
| POST | `/api/v2/vlo/matters` | JWT | multipart, max 10 files | Submit new matter | `server.js` |
| GET | `/api/vlo/matters/download/:id` | JWT | Legacy non-v2 path | Download advisory opinion | `server.js` |

### 4.8 Appointments, Subscription, Billing

| Method | URL | Auth | Body (POST) | Purpose | Source |
|--------|-----|------|-------------|---------|--------|
| POST | `/api/v2/appointments` | JWT | `{ lawyerId \| caId, datetime, ... }` | Book appointment | `server.js` |
| GET | `/api/v2/appointments` | JWT | — | List client appointments | `server.js` |
| GET | `/api/v2/subscription` | JWT | — | Subscription details | `server.js` |
| POST | `/api/v2/subscription/cancel` | JWT | — | Cancel subscription | `server.js` |
| GET | `/api/v2/invoices` | JWT | — | List invoices | `server.js` |
| POST | `/api/v2/evaluations` | JWT | `{ rating, comment, ... }` | Submit service evaluation | `server.js` |

### 4.9 Lawyer & CA Directory

| Method | URL | Auth | Query | Purpose | Source |
|--------|-----|------|-------|---------|--------|
| GET | `/api/v2/lawyers/public` | Public | `?city`, `?practice`, `?lang` | Public verified lawyer directory | `server.js` |
| GET | `/api/v2/cas/public` | Public | `?city`, etc. | Public verified CA directory | `server.js` |
| GET | `/api/v2/lawyers` | JWT | filters | Full lawyer list (incl. unverified) | `server.js` |

---

## 5. Lawyer Dashboard API (`http://localhost:3000/api/v2/lawyer`)

**Source:** `routes/lawyerRoutes.js`  
**Auth:** JWT + Lawyer role  
**Used by:** Mainsite Lawyer dashboard shell

| Method | URL | Body / Params | Purpose |
|--------|-----|---------------|---------|
| GET | `/dashboard` | — | Dashboard summary |
| GET | `/subscription` | — | Subscription info |
| GET | `/notifications` | — | List notifications |
| DELETE | `/notifications/:id` | — | Dismiss notification |
| DELETE | `/notifications` | — | Clear all notifications |
| GET | `/appointments` | — | Lawyer appointments |
| PATCH | `/appointments/:appointmentId` | `{ status }` | Update appointment |
| GET | `/orders` | — | Document orders assigned to lawyer |
| POST | `/orders/:orderId/deliver` | multipart `document` | Deliver completed document |
| POST | `/orders/:orderId/esign` | — | Start e-sign session |
| GET | `/vlo/subscribers` | — | VLO subscriber list |
| GET | `/vlo/subscribers/:subscriberId/matters` | — | Matters for subscriber |
| PATCH | `/vlo/matters/:matterId` | `{ status, ... }` | Update matter |
| POST | `/vlo/matters/:matterId/notes` | `{ note }` | Add matter note |
| GET | `/clients` | — | Client list |
| GET | `/clients/:clientId/history` | — | Client history (stub) |
| GET | `/earnings` | — | Earnings summary |
| GET | `/cases` | — | Case list |
| POST | `/cases` | case fields | Create case |
| PATCH | `/cases/:caseId` | case fields | Update case |
| DELETE | `/cases/:caseId` | — | Delete case |
| GET | `/profile` | — | Lawyer profile |
| PATCH | `/profile` | profile fields | Update profile |
| POST | `/profile/photo` | multipart `photo` | Upload profile photo |
| GET | `/team` | — | Team members |
| POST | `/team` | `{ name, email, role }` | Add team member |
| DELETE | `/team/:memberId` | — | Remove team member |
| POST | `/lexisnexis/connect` | credentials | LexisNexis integration placeholder |

---

## 6. CA Dashboard API (`http://localhost:3000/api/v2/ca`)

**Source:** `routes/caRoutes.js`  
**Auth:** JWT + CA role  
**Used by:** Mainsite CA dashboard shell

| Method | URL | Body / Params | Purpose |
|--------|-----|---------------|---------|
| GET | `/dashboard` | — | CA dashboard summary |
| GET | `/subscription` | — | Subscription info |
| GET | `/notifications` | — | Notifications |
| DELETE | `/notifications/:id` | — | Dismiss notification |
| DELETE | `/notifications` | — | Clear notifications |
| GET | `/compliance/deadlines` | — | Compliance deadlines |
| GET | `/taxation/profiles` | — | Client tax profiles |
| POST | `/taxation/profiles/:profileId/challans` | multipart `challan` | Upload tax challan |
| GET | `/orders` | — | CA service orders |
| PATCH | `/orders/:orderId/milestone` | `{ milestone }` | Update order milestone |
| GET | `/documents` | — | CA documents |
| POST | `/documents/:documentId/esign` | — | Trigger e-sign |
| GET | `/retainers` | — | Retainer list |
| GET | `/retainers/:retainerId/tasks` | — | Retainer tasks |
| PATCH | `/retainers/tasks/:taskId` | `{ status }` | Update task |
| GET | `/appointments` | — | CA appointments |
| PATCH | `/appointments/:appointmentId` | `{ status }` | Update appointment |
| GET | `/profile` | — | CA profile |
| PATCH | `/profile` | profile fields | Update profile |
| POST | `/profile/photo` | multipart `photo` | Upload profile photo |
| GET | `/team` | — | Team members |
| POST | `/team` | member fields | Add team member |
| DELETE | `/team/:memberId` | — | Remove team member |

---

## 7. Messaging API (3 mount points)

**Source:** `routes/messageRoutes.js`  
**Auth:** JWT; write endpoints enforce role (client starts threads; all roles can reply)

| Method | Client URL | Lawyer URL | CA URL | Purpose |
|--------|------------|------------|--------|---------|
| GET | `/api/v2/messages/threads` | `/api/v2/lawyer/messages/threads` | `/api/v2/ca/messages/threads` | List threads |
| GET | `.../threads/:id` | `.../threads/:id` | `.../threads/:id` | Thread + messages |
| POST | `.../threads` | `.../threads` | `.../threads` | Start thread (client only) |
| POST | `.../threads/:id/messages` | same | same | Send message |
| PATCH | `.../threads/:id/read` | same | same | Mark thread read |
| GET | `.../unread-count` | same | same | Unread count |

---

## 8. LEX AI Proxy Routes (Main API → Django)

**Source:** `server.js`  
Proxies to `http://localhost:8001`

| Method | Main API URL | Django target | Auth | Purpose |
|--------|--------------|---------------|------|---------|
| POST | `/api/v1/lex/chat/` | `/api/v1/lex/chat/` | Public | LEX RAG chat |
| GET | `/api/v1/lex/sessions/` | `/api/v1/lex/sessions/` | Public | List chat sessions |
| GET | `/api/v1/lex/sessions/:sessionKey/` | `/api/v1/lex/sessions/:sessionKey/` | Public | Session message history |

---

## 9. WebSocket

| Protocol | URL | Auth | Message format | Purpose | Source |
|----------|-----|------|----------------|---------|--------|
| WebSocket | `ws://localhost:3000/api/lex/ws` | Public | Send `{ query, session_key }` | Real-time LEX chat; server POSTs to Django `:8001/api/v1/lex/chat/` | `server.js` |

**Response:** `{ text, shortcuts }`

---

## 10. Auth API — All Routes (`http://localhost:3001`)

**Also available at:** `http://localhost:3000/api/auth/*` (proxy)

### 10.1 Utility

| Method | URL | Auth | Purpose | Source |
|--------|-----|------|---------|--------|
| GET | `/` | Public | Service info + endpoint index | `auth_backend/server.js` |
| GET | `/api/health` | Public | Health check | `auth_backend/server.js` |

### 10.2 Authentication (`/api/auth/*`)

**Source:** `auth_backend/routes/auth.js`

| Method | URL | Auth | Request body | Response | Purpose |
|--------|-----|------|--------------|----------|---------|
| POST | `/api/auth/register` | Public | `{ fullName, email, password, phone, role, verificationToken }` | `{ accessToken, refreshToken, token, user }` | Register user (client/lawyer/ca) |
| POST | `/api/auth/register/send-otp` | Public | `{ email }` | `{ ok, message, expiresInMinutes }` | Send signup OTP email |
| POST | `/api/auth/register/verify-otp` | Public | `{ email, code }` | `{ ok, verificationToken }` | Verify OTP code |
| POST | `/api/auth/register/validate` | Public | `{ email }` | `{ valid, available }` | Check email availability |
| POST | `/api/auth/login` | Public | `{ email, password }` | `{ accessToken, refreshToken, token, user }` | Email/password login |
| POST | `/api/auth/refresh` | Public | `{ refreshToken }` | `{ accessToken, refreshToken, token, user }` | Rotate refresh token → new access token |
| POST | `/api/auth/logout` | Public | `{ refreshToken }` | `{ ok, message }` | Revoke refresh token |
| POST | `/api/auth/forgot-password` | Public | `{ email }` | `{ ok, message }` | Send password reset OTP email |
| POST | `/api/auth/forgot-password/verify-otp` | Public | `{ email, code }` | `{ ok, resetToken }` | Verify reset OTP |
| POST | `/api/auth/reset-password` | Public | `{ email, resetToken, password }` | `{ ok, message }` | Set new password |
| GET | `/api/auth/me` | JWT | — | `{ user }` | Current user + profile |
| GET | `/api/auth/roles` | Public | — | `{ registerRoles, allRoles }` | Available roles |
| GET | `/api/auth/google/url` | Public | `?state=login` | `{ url }` | Google OAuth URL |
| GET | `/api/auth/google/callback` | Public | `?code&state` | Redirect to frontend with token | OAuth callback |
| POST | `/api/auth/google/token` | Public | `{ idToken \| credential, role }` | `{ accessToken, refreshToken, token, user }` | Google ID token login |

**Used by:** Mainsite Login, SignUp, AuthContext (`authService.js` in external frontend)

### 10.3 Profile (`/api/auth/profile/*`)

**Source:** `auth_backend/routes/profile.js`

| Method | URL | Auth | Body | Purpose |
|--------|-----|------|------|---------|
| GET | `/api/auth/profile` | JWT | — | Get full profile bundle |
| PUT | `/api/auth/profile/client` | JWT | `{ cnic, address, city, profilePhoto, phone }` | Save client profile; returns new token |
| POST | `/api/auth/profile/client/signup` | JWT | client profile fields | Complete client signup flow |
| POST | `/api/auth/profile/lawyer/apply` | JWT | lawyer application fields | Submit lawyer verification application |
| POST | `/api/auth/profile/ca/apply` | JWT | CA application fields | Submit CA verification application |
| POST | `/api/auth/profile/switch-role` | JWT | `{ role: 'client' \| 'lawyer' \| 'ca' }` | Switch active dashboard role |

**Used by:** Mainsite registration forms, RoleSwitcher, SignInAsRole

### 10.4 Admin (`/api/auth/admin/*`)

**Source:** `auth_backend/routes/admin.js`  
**Auth:** JWT + Admin role

| Method | URL | Query / Body | Purpose |
|--------|-----|--------------|---------|
| GET | `/api/auth/admin/applications` | — | List pending lawyer/CA applications |
| GET | `/api/auth/admin/applications/:userId` | `?type=lawyer\|ca` | Application details + documents |
| POST | `/api/auth/admin/applications/:userId/approve` | `{ type }` | Approve application |
| POST | `/api/auth/admin/applications/:userId/reject` | `{ type }` | Reject application |

**Used by:** Mainsite AdminVerifications panel

---

## 11. LEX AI — Django API (`http://localhost:8001`)

**Source:** `lex_backend/config/urls.py`, `lex_backend/lex_ai/urls.py`, `lex_backend/lex_ai/views.py`  
**Auth:** None on API views (CSRF exempt). Uses `ANTHROPIC_API_KEY` server-side.

| Method | URL | Auth | Request | Response | Purpose |
|--------|-----|------|---------|----------|---------|
| GET/POST | `/admin/` | Django admin session | — | HTML | Django admin UI |
| POST | `/api/v1/lex/chat/` | Public | `{ message, session_key }` | `{ text, shortcuts, ... }` | RAG chat via Claude |
| GET | `/api/v1/lex/sessions/` | Public | — | `[{ session_key, title, ... }]` | List all sessions |
| GET | `/api/v1/lex/sessions/:sessionKey/` | Public | — | `{ session_key, messages[] }` | Session history |

**Used by:** Client / public LEX widget on Main API (`/api/v1/lex/*`)
**AI provider:** Gemini inline on Main API (production). Django LEX path is legacy/local only.

---

## 12. Outbound External APIs (backend calls third parties)

These are **not exposed by Nexus Lexis** but are called internally:

| Provider | URL | Method | Auth header | Env vars | Used for |
|----------|-----|--------|-------------|----------|----------|
| Microsoft Graph | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | POST | — (client credentials body) | `MS365_*` | OTP email token |
| Microsoft Graph | `https://graph.microsoft.com/v1.0/users/{sender}/sendMail` | POST | `Bearer <token>` | `MS365_*` | Send OTP email |
| Resend | `https://api.resend.com/emails` | POST | `Bearer RESEND_API_KEY` | `RESEND_*` | Alternative OTP email |
| Resend | `https://api.resend.com/domains` | GET | `Bearer RESEND_API_KEY` | `RESEND_*` | Email config verify |
| Gmail SMTP | `smtp.gmail.com:587` | SMTP | USER/PASS | `GMAIL_*` | Dev OTP email |
| Generic SMTP | configurable | SMTP | USER/PASS | `SMTP_*` | Dev OTP email |
| Google OAuth | `https://oauth2.googleapis.com/token` | POST | client id/secret | `GOOGLE_*` | Google Sign-In |
| Google OAuth | Google token verify API | — | ID token | `GOOGLE_CLIENT_ID` | Verify Google login |
| Anthropic | Claude API (SDK) | POST | API key header | `ANTHROPIC_API_KEY` | LEX AI responses |
| PostgreSQL | `localhost:5432` | SQL | `DB_USER`/`DB_PASSWORD` | `DB_*` | All persistent data |

---

## 13. Proxy Route Map (quick reference)

```
Main API :3000                          →  Target
──────────────────────────────────────────────────────────────
/api/auth/*                             →  Auth API :3001/api/auth/*
/api/v1/lex/chat/                       →  inline LEX (Node + Gemini) on Main API
/api/v1/lex/sessions/                   →  Main API (Postgres history)
/api/v1/lex/sessions/:key/              →  Main API (Postgres history)
ws://.../api/lex/ws                     →  local only — do not use in production
# Do NOT integrate: /api/v2/lawyer/lex/*  (counsel LEX out of scope)
```

---

## 14. Endpoint Count Summary

| Service | Route count |
|---------|-------------|
| Main API — direct handlers | ~95 paths |
| Main API — auth proxy | Mirrors all 20 Auth `/api/auth/*` routes |
| Auth API | 22 routes |
| LEX AI Django | 3 API + admin |
| WebSocket | 1 |
| **Total distinct endpoints** | **~120+** |

---

## 15. Frontend Consumer Notes

This repository is **backend-only**. The external **mainsite** frontend (React, port 5173) is the intended API consumer:

| Frontend area | Typical API base |
|---------------|------------------|
| Login / SignUp | `http://localhost:3000/api/auth` (proxied) |
| Client dashboard | `http://localhost:3000/api/v2/*` |
| Lawyer dashboard | `http://localhost:3000/api/v2/lawyer/*` |
| CA dashboard | `http://localhost:3000/api/v2/ca/*` |
| LEX chat widget | `ws://localhost:3000/api/lex/ws` or `/api/v1/lex/chat/` |
| Admin panel | `http://localhost:3000/api/auth/admin/*` |

Configure via frontend env: `VITE_AUTH_API_URL`, `VITE_API_BASE_URL`, `VITE_LEX_API_BASE_URL`, `VITE_LEX_WS_URL`

---

## Document Footer

```
────────────────────────────────────────────────────────────────────────
Nexus Lexis Platform · Complete API Reference · NL-DOC-API-001
Classification: INTERNAL — TECHNICAL REFERENCE
© Nexus Lexis · nexuslexis.law · contact@nexuslexis.law

This document reflects the codebase as of 2026-07-28.
Regenerate after route changes: python scripts/generate-docx-from-md.py

Prepared by: Nexus Lexis Engineering
Version: 1.0 · Last updated: 2026-07-28
────────────────────────────────────────────────────────────────────────
```
