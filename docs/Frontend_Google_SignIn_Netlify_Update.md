# Nexus Lexis — Frontend Google Sign-In Update

**Document ID:** NL-FE-GGL-002  
**Date:** 5 October 2026  
**Audience:** Frontend team  
**Live frontends:** https://nexuslexis.netlify.app · https://nexuslexis.law  
**Auth API:** https://nexus-lexis-backend-45v4.vercel.app/api/auth  

Backend Google OAuth credentials were **rotated** (new Google Cloud project). Frontend must use the **new Client ID** and redeploy. Backend Auth API is already updated.

---

## 1. What changed (backend)

| Item | Status |
|------|--------|
| New Google Cloud OAuth Web client | Done |
| Authorized JS origins (Netlify + custom domain) | Add both in Google Console (see §4) |
| Auth Vercel `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Done — redeploy Auth if not already |
| Google redirect callback | `https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback` |

**Old Client ID must not be used** (project `540754283524-…`). That account is no longer available.

---

## 2. Frontend env changes (required)

Update **Netlify** environment variables (Production + Preview if used), then **Redeploy**.

```env
VITE_GOOGLE_CLIENT_ID=925512874310-duojhjmbplliooe0mqlgm532fogmq40g.apps.googleusercontent.com
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
```

| Variable | Action |
|----------|--------|
| `VITE_GOOGLE_CLIENT_ID` | **Replace** with the new value above |
| `VITE_AUTH_API_URL` | Confirm points to Auth API `:45v4` |
| Main / LEX base URLs | Keep as above unless already set |

Local `.env` / `.env.production` in the FE repo: same `VITE_GOOGLE_CLIENT_ID`.

---

## 3. Code changes

**Usually none**, if Google GIS / `@react-oauth/google` already posts the credential to Auth API.

## Preferred flow (use this — fixes `Unable to reach the server`)

`nexuslexis.law` is on **Hostinger**. Popup GIS + `POST /google/token` often dies with RTK `FETCH_ERROR`. Use **full-page redirect** instead (no XHR):

```js
// Continue with Google button onClick:
const role = 'client'; // or lawyer | ca
const returnTo = window.location.origin; // https://nexuslexis.law
window.location.href =
  `https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/start` +
  `?role=${encodeURIComponent(role)}` +
  `&returnTo=${encodeURIComponent(returnTo)}`;
```

Backend then:
1. Redirects to Google
2. Google → Auth `/google/callback`
3. Auth → `{returnTo}/login?token=...&refreshToken=...&state=...`

### On `/login` (and `/signup` if needed) — read tokens from URL

```js
useEffect(() => {
  const q = new URLSearchParams(window.location.search);
  const token = q.get('token');
  const refreshToken = q.get('refreshToken');
  const googleError = q.get('googleError');
  if (googleError) {
    setError(googleError);
    return;
  }
  if (token) {
    // store accessToken + refreshToken (same as password login success)
    // then navigate to dashboard and strip query params
  }
}, []);
```

### Legacy GIS popup flow (optional fallback only)

```
User clicks Continue with Google
  → Google Identity Services popup
  → POST {VITE_AUTH_API_URL}/google/token  { idToken | credential, role }
  → store tokens
```

If this shows **Unable to reach the server**, switch to `/google/start` redirect above.

### Request

```http
POST https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/token
Content-Type: application/json

{
  "idToken": "<Google credential JWT>",
  "role": "client"
}
```

### Success (200)

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "email": "...", "role": "client", ... }
}
```

### Common errors

| Symptom | Cause | Fix |
|---------|--------|-----|
| `Error 400: origin_mismatch` | Site origin missing in Google Console | Add `https://nexuslexis.netlify.app` **and** `https://nexuslexis.law` (no trailing `/`) under Authorized JavaScript origins |
| Google popup works but API 401/400 | FE still on **old** Client ID | Update `VITE_GOOGLE_CLIENT_ID` + redeploy |
| `Google sign-in is not configured` | Auth missing `GOOGLE_CLIENT_ID` | Backend / Vercel Auth env |
| **`Unable to reach the server. Check your connection…`** | RTK `FETCH_ERROR` — browser never got Auth response (cold start / aborted fetch / blocked) | See **§7** below |

---

## 7. Fix: `Unable to reach the server` on Google Sign-In

Backend Auth is up (`/api/health` → `db: ok`). This message is **frontend network**, not a bad password.

### 7.1 Warm Auth before Google click (quick)

On Login / SignUp mount:

```js
useEffect(() => {
  fetch('https://nexus-lexis-backend-45v4.vercel.app/api/health').catch(() => {});
  fetch('https://nexus-lexis-backend-45v4.vercel.app/api/auth/ping').catch(() => {});
}, []);
```

### 7.2 Recommended: same-origin proxy (kills CORS FETCH_ERROR)

**Netlify** `public/_redirects` or `netlify.toml`:

```
/api/auth/*  https://nexus-lexis-backend-45v4.vercel.app/api/auth/:splat  200
```

Then build with:

```env
VITE_AUTH_API_URL=/api/auth
```

Browser calls `https://nexuslexis.law/api/auth/google/token` (same origin) → Netlify proxies to Auth. More reliable than cross-origin to `vercel.app`.

### 7.3 DevTools check

1. Incognito (extensions off) → https://nexuslexis.law/login  
2. F12 → **Network** → Continue with Google  
3. Find `google/token`  
   - **(canceled) / failed** → warm-up (§7.1) or proxy (§7.2)  
   - **400/401 with JSON** → share response body with backend  
   - **missing entirely** → Google callback never fired (Client ID / GIS)

---

## 4. Google Console (already done on backend side — verify)

For the OAuth **Web client** tied to the new Client ID:

**Authorized JavaScript origins**
```
https://nexuslexis.netlify.app
https://nexuslexis.law
http://localhost:5173
```

**Authorized redirect URIs** (redirect flow only)
```
https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback
http://localhost:3001/api/auth/google/callback
```

Frontend team does **not** need Client Secret. Secret stays on Auth Vercel only.

---

## 5. Acceptance checklist

- [ ] Netlify env has **new** `VITE_GOOGLE_CLIENT_ID`
- [ ] Netlify **Redeploy** completed after env change
- [ ] On https://nexuslexis.netlify.app/login — Continue with Google works (no `origin_mismatch`)
- [ ] On https://nexuslexis.law/login — Continue with Google works (no `origin_mismatch`)
- [ ] After Google account pick — tokens returned; user lands in app
- [ ] Localhost test (optional): origin `http://localhost:5173` + local `VITE_GOOGLE_CLIENT_ID`

---

## 6. Do not change

- Do not hardcode Client Secret in frontend
- Do not call Main API (`ql8w`) for Google token exchange — only Auth API (`45v4`)
- Do not keep the old `540754283524-…` Client ID anywhere

---

*NL-FE-GGL-002 · Google Sign-In Netlify Client ID update for Frontend*
