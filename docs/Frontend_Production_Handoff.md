---
Document Title: Nexus Lexis — Frontend Production Integration Handoff
Document ID: NL-FE-PROD-001
Version: 1.0
Last Updated: 29 July 2026
Classification: Internal — Frontend Team
Owner: Nexus Lexis Backend / Platform
Applies To: Frontend developers integrating with production APIs
---

# 1. Purpose

This document provides everything the frontend team needs to connect the Nexus Lexis web application to **production backend APIs** deployed on Vercel.

Backend repository: **https://github.com/habibafaisal15-cpu/NexusLexisBackend**

---

# 2. Production environment file

Create **`.env.production`** in the frontend project with:

```
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
```

| Variable | Production value | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `https://nexus-lexis-backend-ql8w.vercel.app/api/v2` | Main dashboard API (client, lawyer, CA, orders, messages) |
| `VITE_AUTH_API_URL` | `https://nexus-lexis-backend-45v4.vercel.app/api/auth` | Authentication, signup OTP, profiles, Google OAuth |
| `VITE_LEX_API_BASE_URL` | `https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex` | LEX AI chat (REST — proxied through Main API) |

> **Do not** set `VITE_LEX_WS_URL` for production. WebSockets are **not supported** on Vercel. Use REST chat only.

---

# 3. Service base URLs

| Service | Base URL | Health check |
| --- | --- | --- |
| Main API | `https://nexus-lexis-backend-ql8w.vercel.app` | `GET /api/health` |
| Auth API | `https://nexus-lexis-backend-45v4.vercel.app` | `GET /api/health` |

**Quick verification (browser or Postman):**

```
GET https://nexus-lexis-backend-ql8w.vercel.app/
GET https://nexus-lexis-backend-ql8w.vercel.app/api/health
GET https://nexus-lexis-backend-45v4.vercel.app/
GET https://nexus-lexis-backend-45v4.vercel.app/api/health
```

Expected: HTTP **200** with JSON `"status":"ok"`.

---

# 4. Authentication

## 4.1 Login (email + password)

```
POST {VITE_AUTH_API_URL}/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

**Response:** `{ "token": "<JWT>", "user": { ... } }`

Store the JWT and send on all protected requests:

```
Authorization: Bearer <token>
```

## 4.2 Signup with OTP

```
POST {VITE_AUTH_API_URL}/register/send-otp     → { "email" }
POST {VITE_AUTH_API_URL}/register/verify-otp   → { "email", "code" }
POST {VITE_AUTH_API_URL}/register              → { "fullName", "email", "password", "role", "verificationToken" }
```

Roles for registration: `client`, `lawyer`, `ca`.

## 4.3 Google Sign-In

**Option A — One Tap / popup (recommended):**

```
POST {VITE_AUTH_API_URL}/google/token
Content-Type: application/json

{
  "idToken": "<Google credential from GIS>",
  "role": "client"
}
```

**Option B — Redirect flow:**

```
GET {VITE_AUTH_API_URL}/google/url
→ returns { "url": "https://accounts.google.com/..." }
→ redirect user to url
→ Google redirects to Auth callback
→ user lands on FRONTEND_URL/login?token=...
```

## 4.4 Current user

```
GET {VITE_AUTH_API_URL}/me
Authorization: Bearer <token>
```

---

# 5. Main API usage

All dashboard routes use **`VITE_API_BASE_URL`** with the JWT header.

Examples:

| Action | Method | Path |
| --- | --- | --- |
| Client dashboard bootstrap | GET | `/workspace/bootstrap` |
| Lawyer dashboard | GET | `/lawyer/dashboard` |
| CA dashboard | GET | `/ca/dashboard` |
| Book appointment | POST | `/appointments` |
| Messages | GET | `/messages` |
| Document library | GET | `/library/categories` |

Lawyer routes are under `/lawyer/*`. CA routes are under `/ca/*`.

Some requests may require header:

```
X-Client-Role: CorporateClient | LegalAdvocate | CharteredAccountant
```

---

# 6. LEX AI chat (production)

Use **REST only** — no WebSocket in production.

```
POST {VITE_LEX_API_BASE_URL}/chat/
Content-Type: application/json

{
  "message": "What is FIR?",
  "session_key": "unique-session-id-per-user-or-tab"
}
```

**Response:**

```json
{
  "response": "...",
  "language": "EN",
  "show_lawyer": false,
  "sources": []
}
```

> **Note:** Full AI fallback (custom questions via Qwen/Ollama) requires LEX AI service on Render. Greetings, intro Q&A, and Excel question bank work without it. Until LEX is deployed, some queries may return a temporary unavailability message.

---

# 7. Demo accounts (testing only)

| Role | Email | Password |
| --- | --- | --- |
| Client | `client@nexuslexis.law` | `password123` |
| Lawyer | `lawyer@nexuslexis.law` | `password123` |
| CA | `ca@nexuslexis.law` | `password123` |
| Admin | `admin@nexuslexis.law` | `admin123` |

Use these for QA until real signup flows are verified end-to-end.

---

# 8. CORS and frontend deployment

Production APIs currently allow all origins (`CORS_ALLOW_ALL=true`) for initial integration.

**When the frontend is deployed**, send the production frontend URL (e.g. `https://your-app.vercel.app`) to the backend team so we can:

1. Add it to `FRONTEND_URLS` on both Vercel projects
2. Add it to Google OAuth **Authorized JavaScript origins**
3. Disable open CORS (`CORS_ALLOW_ALL=false`)

---

# 9. Architecture overview

```
Frontend (Vite/React)
    │
    ├── VITE_AUTH_API_URL ──────► Auth API (Vercel :45v4)
    │                              login, signup, OTP, Google, profiles
    │
    ├── VITE_API_BASE_URL ──────► Main API (Vercel :ql8w)
    │                              dashboard, lawyer, CA, orders, messages
    │
    └── VITE_LEX_API_BASE_URL ──► Main API /api/v1/lex (proxy)
                                   └──► LEX AI on Render (when deployed)
```

Auth API and Main API share the same **JWT secret** — tokens issued by Auth work on Main API routes.

---

# 10. Common errors

| Error | Likely cause | Fix |
| --- | --- | --- |
| `401 Unauthorized` | Missing or expired JWT | Re-login; send `Authorization: Bearer <token>` |
| `502 Auth API service unavailable` | Main API cannot reach Auth | Confirm `AUTH_API_URL` on Main API project |
| `redirect_uri_mismatch` (Google) | Wrong OAuth redirect | Use Auth callback URL exactly as registered |
| CORS blocked | Frontend origin not allowed | Share frontend URL with backend team |
| LEX timeout / unavailable | LEX not on Render yet | Expected until LEX deploy; use intro/greeting queries |

---

# 11. Contact and next steps

| Step | Owner | Action |
| --- | --- | --- |
| 1 | Frontend | Add `.env.production` values from Section 2 |
| 2 | Frontend | Wire auth, dashboard, and LEX chat to production URLs |
| 3 | Frontend | Share deployed frontend URL for CORS + Google origins |
| 4 | Backend | Deploy LEX AI on Render; update `LEX_API_URL` on Main API |
| 5 | Backend | Lock down CORS after frontend URL is confirmed |

For API reference details, see **`docs/NexusLexis_API_Documentation.docx`** in the backend repository.

---

**Document end**
