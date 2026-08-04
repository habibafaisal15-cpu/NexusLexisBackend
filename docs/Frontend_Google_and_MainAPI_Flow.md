---
Document Title: Nexus Lexis — Google Sign-In and Main API Flow
Document ID: NL-FE-GGL-001
Version: 1.0
Last Updated: 4 August 2026
Classification: Internal — Frontend Team
Owner: Nexus Lexis Backend
Applies To: Frontend developers integrating auth and dashboard APIs
---

# 1. Purpose

This guide explains **Continue with Google** and the **main API flow** after login. Signup OTP and forgot-password email OTP are **temporarily skipped** — see Section 6.

**Production URLs:**

| Service | Base URL |
| --- | --- |
| Auth API | `https://nexus-lexis-backend-45v4.vercel.app/api/auth` |
| Main API | `https://nexus-lexis-backend-ql8w.vercel.app/api/v2` |
| LEX AI | `https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex` |

**Frontend `.env.production`:**

```
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
```

---

# 2. Check server mode on app load

```
GET {VITE_AUTH_API_URL}/config
```

**Expected (OTP skipped):**

```json
{
  "signupOtpRequired": false,
  "passwordResetOtpRequired": false,
  "registerRoles": ["client", "lawyer", "ca"],
  "authMethods": ["email", "google"]
}
```

Use these flags to show/hide OTP screens in the UI.

---

# 3. Continue with Google — how it works

Google Sign-In **does not use email OTP**. It is the recommended signup/login method while Microsoft email delivery is pending.

## 3.1 Architecture

```
User clicks "Continue with Google"
        |
        v
Google Identity Services (GIS) popup / One Tap
        |
        v
Google returns idToken (JWT credential)
        |
        v
POST /api/auth/google/token  { idToken, role }
        |
        v
Backend verifies token with Google
        |
        v
Create or link account in database
        |
        v
Return accessToken + refreshToken + user
        |
        v
Frontend stores tokens -> redirect to dashboard
```

## 3.2 Frontend setup (Google Cloud Console)

1. Create OAuth 2.0 **Web client** in [Google Cloud Console](https://console.cloud.google.com/)
2. **Authorized JavaScript origins:** your frontend URL (e.g. `https://nexuslexis.law`, `http://localhost:5173`)
3. **Authorized redirect URIs:** Auth callback (only if using redirect flow):
   `https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback`
4. Copy **Client ID** into frontend Google GIS config

## 3.3 Option A — Google Identity Services (recommended)

Install/use `@react-oauth/google` or Google GIS script.

**On success callback**, send credential to backend:

```
POST {VITE_AUTH_API_URL}/google/token
Content-Type: application/json

{
  "idToken": "<credential from Google>",
  "role": "client"
}
```

> Some GIS libraries return the field as `credential` instead of `idToken`. Backend accepts both.

**Success response (200):**

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<opaque-token>",
  "token": "<JWT>",
  "expiresIn": "24h",
  "refreshExpiresAt": "...",
  "user": {
    "id": 1,
    "email": "user@gmail.com",
    "fullName": "User Name",
    "role": "client",
    "roles": ["client"],
    "dashboardUserId": 1
  }
}
```

**Store** `accessToken` and `refreshToken` in memory/localStorage (your choice).

**First-time Google user:** account is created automatically — no OTP, no extra signup step.

**Returning Google user:** logs in directly.

## 3.4 Option B — Redirect flow

```
GET {VITE_AUTH_API_URL}/google/url?state=login
```

**Response:** `{ "url": "https://accounts.google.com/o/oauth2/..." }`

Redirect browser to `url`. After consent, Google redirects to Auth API callback, then user lands on:

```
{FRONTEND_URL}/login?token=<accessToken>&refreshToken=<refreshToken>&state=login
```

Parse query params and store tokens.

## 3.5 Google errors

| Error | Meaning | UI action |
| --- | --- | --- |
| `Google sign-in is not configured` | Server missing GOOGLE_CLIENT_ID | Contact backend |
| `redirect_uri_mismatch` | Wrong redirect in Google Console | Fix OAuth settings |
| Account uses password | Email registered with password | Show email login |

---

# 4. Email signup flow (OTP skipped)

```
POST {VITE_AUTH_API_URL}/register
{
  "fullName": "John Doe",
  "email": "user@gmail.com",
  "password": "Asdf1234",
  "phone": "03123456789",
  "role": "client"
}
```

**No** `verificationToken`. **No** send-otp step.

**Response:** same token shape as Google login (201).

> If you get **504 timeout**, backend team must set `SKIP_SIGNUP_OTP=true` and redeploy Auth API. Account may exist without tokens — use login instead.

---

# 5. Main API flow after login

All Main API calls use:

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Base URL: **`VITE_API_BASE_URL`**

## 5.1 End-to-end user journey

```
1. Login (Google OR email register/login)
2. GET /api/auth/me  -> user + profile status
3. GET /api/auth/profile  -> full profile bundle
4. Complete profile if needed (client / lawyer / ca)
5. POST /api/auth/profile/switch-role  -> if multi-role
6. GET /api/v2/workspace  -> client dashboard data
   OR GET /api/v2/lawyer/dashboard
   OR GET /api/v2/ca/dashboard
7. Use feature APIs (messages, orders, LEX, etc.)
```

## 5.2 Auth APIs (token: Auth base URL)

| Action | Method | Path |
| --- | --- | --- |
| Current user | GET | `/me` |
| Full profile | GET | `/profile` |
| Save client profile | PUT | `/profile/client` |
| Lawyer application | POST | `/profile/lawyer/apply` |
| CA application | POST | `/profile/ca/apply` |
| Switch role | POST | `/profile/switch-role` |
| Refresh token | POST | `/refresh` |
| Logout | POST | `/logout` |

## 5.3 Client Main API

| Action | Method | Path |
| --- | --- | --- |
| Workspace bootstrap | GET | `/workspace` |
| Notifications | GET | `/notifications` |
| Document orders | GET | `/documents` |
| Create order | POST | `/orders` |
| Appointments | GET/POST | `/appointments` |
| Document library | GET | `/library/catalog` |
| Public lawyers | GET | `/lawyers/public` |
| Messages | GET/POST | `/messages` |
| Subscription | GET | `/subscription` |

## 5.4 Lawyer Main API (prefix `/lawyer`)

| Action | Method | Path |
| --- | --- | --- |
| Dashboard | GET | `/lawyer/dashboard` |
| Profile | GET/PATCH | `/lawyer/profile` |
| Clients | GET | `/lawyer/clients` |
| Appointments | GET | `/lawyer/appointments` |
| Messages | GET/POST | `/lawyer/messages` |

## 5.5 CA Main API (prefix `/ca`)

| Action | Method | Path |
| --- | --- | --- |
| Dashboard | GET | `/ca/dashboard` |
| Profile | GET/PATCH | `/ca/profile` |
| Tax profiles | GET | `/ca/taxation/profiles` |
| Messages | GET/POST | `/ca/messages` |

## 5.6 LEX AI chat

```
POST {VITE_LEX_API_BASE_URL}/chat/
{ "message": "How do I register a company in Pakistan?" }
```

**Response:** `{ "response": "...", "language": "EN", "show_lawyer": false }`

Response time: ~5–10 seconds. Use REST only (no WebSocket on Vercel).

## 5.7 Token refresh

When any API returns **401**:

```
POST {VITE_AUTH_API_URL}/refresh
{ "refreshToken": "<stored>" }
```

Replace stored tokens with new ones from response. Retry original request.

---

# 6. Forgot password (OTP skipped)

While `passwordResetOtpRequired` is **false**:

**Step 1 — Request reset (returns token directly, no email):**

```
POST {VITE_AUTH_API_URL}/forgot-password
{ "email": "user@gmail.com" }
```

**Response:**

```json
{
  "ok": true,
  "email": "user@gmail.com",
  "resetToken": "<token>",
  "otpSkipped": true,
  "message": "Password reset token issued..."
}
```

**Step 2 — Set new password:**

```
POST {VITE_AUTH_API_URL}/reset-password
{
  "email": "user@gmail.com",
  "resetToken": "<token from step 1>",
  "password": "NewPassword123"
}
```

> Skip `verify-otp` step entirely while OTP is disabled.

> Google-only accounts cannot reset password — show **Continue with Google**.

---

# 7. Demo accounts (testing)

| Role | Email | Password |
| --- | --- | --- |
| Client | `client@nexuslexis.law` | `password123` |
| Lawyer | `lawyer@nexuslexis.law` | `password123` |
| CA | `ca@nexuslexis.law` | `password123` |

Login via `POST /login` to test dashboards without signup.

---

# 8. Common errors

| Error | Cause | Fix |
| --- | --- | --- |
| 504 Gateway Timeout on register | DNS/email hang on server | Backend redeploy with latest fix; or use Google login |
| 401 Unauthorized | Expired JWT | Refresh or re-login |
| Email verification required | OTP re-enabled on server | Check `/config`; add OTP flow |
| Account already exists | Duplicate register | Use login |
| CORS error | Frontend URL not allowed | Share URL with backend team |

---

# 9. Recommended integration order

1. Wire `.env.production` URLs
2. Implement **Continue with Google** (Section 3)
3. Implement email **login** + **register** (Section 4)
4. Store tokens; call **GET /me**
5. Route by role to client / lawyer / CA dashboard
6. Wire **Main API** endpoints (Section 5)
7. Add **LEX chat** widget
8. Add forgot-password when needed (Section 6)
9. When backend enables OTP later, add OTP screens per `/config`

---

**Document end — Nexus Lexis Google Sign-In and Main API Flow v1.0**
