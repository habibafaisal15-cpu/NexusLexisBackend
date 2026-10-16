# Frontend fix — Google Sign-Up on Hostinger

**Site:** https://nexuslexis.law  
**Auth API:** https://nexus-lexis-backend-45v4.vercel.app/api/auth

## Why Google is still stuck

Live Hostinger build (checked Oct 2026) still uses **GIS popup** → `POST /google/token`.  
That path fails often on Hostinger (`FETCH_ERROR` / `origin_mismatch`).

Also: Hostinger returns **404 for `/login`, `/signup`, every SPA route**.  
Only `/` and real files work. Google redirect must **not** land on `/login`.

---

## Do these 3 Hostinger uploads (required)

Copy from this repo:

| File | Upload to |
|------|-----------|
| `docs/hostinger/.htaccess` | `public_html/.htaccess` |
| `docs/hostinger/google-auth.html` | `public_html/google-auth.html` |

`.htaccess` fixes SPA 404s.  
`google-auth.html` receives Auth redirect tokens, writes `sessionStorage`, then opens the app.

Verify after upload:

- https://nexuslexis.law/login → **200** (same shell as home)
- https://nexuslexis.law/google-auth.html → **200** (signing-in page)

---

## Change the Google button (required)

**Remove** `@react-oauth/google` / GIS popup for production Hostinger.

```js
const AUTH = import.meta.env.VITE_AUTH_API_URL
  || 'https://nexus-lexis-backend-45v4.vercel.app/api/auth';

function startGoogleSignIn(role = 'client') {
  const returnTo = encodeURIComponent(window.location.origin);
  // Warm auth (optional but helps cold start)
  fetch(`${AUTH}/ping`).catch(() => {});
  window.location.href =
    `${AUTH}/google/start?role=${encodeURIComponent(role)}&returnTo=${returnTo}`;
}
```

Use `role=lawyer` / `role=ca` when that tab is selected.

### Flow after click

1. Browser goes to Auth `/google/start` (no CORS)
2. Google consent
3. Auth `/google/callback` creates session
4. Redirect → `https://nexuslexis.law/google-auth.html?token=...&refreshToken=...`
5. Page saves tokens → `/`

---

## Google Cloud Console checklist

OAuth client (Web):

**Authorized JavaScript origins**

- `https://nexuslexis.law`
- `https://www.nexuslexis.law`
- `https://nexuslexis.netlify.app`
- `http://localhost:5173` (dev)

**Authorized redirect URIs**

- `https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback`

Same **Client ID** must be in FE env **and** Vercel `GOOGLE_CLIENT_ID`.

---

## Backend endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/ping` | Warm-up (call on page load) |
| GET | `/api/auth/google/start` | **Use this** — 302 → Google |
| GET | `/api/auth/google/callback` | Google → `/google-auth.html` with tokens |
| POST | `/api/auth/google/token` | Legacy GIS popup (unreliable on Hostinger) |

---

## Do not keep relying on GIS popup

If you still see:

- `Error 400: origin_mismatch` → missing JS origin in Console  
- `Unable to reach the server` / RTK `FETCH_ERROR` → switch to `/google/start`  
- Google finishes then blank/404 → missing `.htaccess` or `google-auth.html`
