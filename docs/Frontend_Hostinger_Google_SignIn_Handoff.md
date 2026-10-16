# Frontend handoff — Hostinger Google Sign-In (NexusLexis)

**Date:** 16 Oct 2026  
**Site:** https://nexuslexis.law (Hostinger)  
**Auth API:** `https://nexus-lexis-backend-45v4.vercel.app/api/auth`  
**Status:** Backend ready. FE + Hostinger uploads required.

---

## 1. Problem (what is broken today)

| Issue | Evidence |
|-------|----------|
| Google signup stuck on Hostinger | Live bundle still uses `GoogleOAuthProvider` → `POST /google/token` |
| SPA routes 404 | `/login`, `/signup`, `/account`, etc. return **404**; only `/` works |
| Google return URL broken | Auth used to send users to `/login?token=…` → Hostinger 404 |
| Netlify OK, Hostinger not | `nexuslexis.netlify.app/login` works (SPA rewrite); Hostinger has none |

**Do not keep GIS popup on Hostinger.** It causes `FETCH_ERROR` / `origin_mismatch`. Use full-page redirect.

---

## 2. Required Hostinger uploads (do first)

Upload these **two files** into `public_html` (same folder as `index.html`):

| Source in backend repo | Upload as |
|------------------------|-----------|
| `docs/hostinger/.htaccess` | `public_html/.htaccess` |
| `docs/hostinger/google-auth.html` | `public_html/google-auth.html` |

**Or download from live Auth API:**

- https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/.htaccess  
- https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/google-auth.html  

### What each file does

- **`.htaccess`** — Apache SPA fallback so `/login`, `/signup`, `/account` serve `index.html` (no more 404).
- **`google-auth.html`** — After Google OAuth, Auth redirects here with `?token=&refreshToken=`. The page writes `sessionStorage` keys the app already uses (`accessToken`, `token`, `refreshToken`), then sends the user to `/`.

### Verify uploads

```text
https://nexuslexis.law/login              → 200 (app shell, not Hostinger 404)
https://nexuslexis.law/signup             → 200
https://nexuslexis.law/google-auth.html   → 200 (“Signing you in…”)
```

---

## 3. Required code change — Google button

### Remove (production Hostinger)

- `@react-oauth/google` / `GoogleOAuthProvider` / GIS popup button for Hostinger production
- `POST /google/token` as the primary path

### Add — redirect start

```js
const AUTH =
  import.meta.env.VITE_AUTH_API_URL ||
  'https://nexus-lexis-backend-45v4.vercel.app/api/auth';

/**
 * Full-page Google sign-in (no popup, no CORS XHR).
 * @param {'client'|'lawyer'|'ca'} role
 */
export function startGoogleSignIn(role = 'client') {
  const safeRole = ['client', 'lawyer', 'ca'].includes(role) ? role : 'client';
  // Warm Auth cold start (optional)
  fetch(`${AUTH}/ping`).catch(() => {});
  const returnTo = encodeURIComponent(window.location.origin);
  window.location.href =
    `${AUTH}/google/start?role=${encodeURIComponent(safeRole)}&returnTo=${returnTo}`;
}
```

Wire Login / SignUp Google buttons:

```jsx
<button type="button" onClick={() => startGoogleSignIn(selectedRole || 'client')}>
  Continue with Google
</button>
```

On SignUp, pass the selected role (`client` | `lawyer` | `ca`).

### Optional: warm Auth on app boot

```js
useEffect(() => {
  fetch(`${AUTH}/ping`).catch(() => {});
}, []);
```

---

## 4. End-to-end flow (after FE change)

```text
User clicks “Continue with Google”
  → GET {AUTH}/google/start?role=…&returnTo=https://nexuslexis.law
  → Google consent screen
  → GET {AUTH}/google/callback?code=…
  → 302 → https://nexuslexis.law/google-auth.html?token=…&refreshToken=…
  → google-auth.html writes sessionStorage
  → redirect → /
  → React app sees accessToken → treat as logged in → GET /me for user
```

### Error return

```text
/google-auth.html?googleError=<message>&next=/login
```

Show the message or send user to `/login`.

---

## 5. sessionStorage contract (already used by live FE)

`google-auth.html` writes the same keys as current `tokenStorage`:

| Key | Value |
|-----|--------|
| `accessToken` | JWT |
| `token` | same JWT (alias) |
| `refreshToken` | refresh token |
| `user` | cleared; refill via `GET /me` |

After landing on `/`, call `GET {AUTH}/me` with `Authorization: Bearer <accessToken>` and hydrate Redux / auth context.

---

## 6. Google Cloud Console checklist

OAuth client type: **Web application**

**Authorized JavaScript origins**

- `https://nexuslexis.law`
- `https://www.nexuslexis.law`
- `https://nexuslexis.netlify.app`
- `http://localhost:5173` (local)

**Authorized redirect URIs** (exact — Auth callback, not the FE domain)

- `https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback`

**Client ID** in FE must match Vercel env `GOOGLE_CLIENT_ID` on Auth.

---

## 7. Auth API cheat sheet

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/ping` | Warm-up |
| `GET` | `/config` | Includes `googleAuth.recommendedMode: "redirect"` |
| `GET` | `/google/start?role=&returnTo=` | **Primary Google entry** |
| `GET` | `/google/callback` | Google → FE (do not call from FE) |
| `POST` | `/google/token` | Legacy GIS only — avoid on Hostinger |
| `GET` | `/me` | Current user + verification / re-apply flags |
| `POST` | `/login` | Email/password |
| `POST` | `/refresh` | Body `{ refreshToken }` |

Base: `https://nexus-lexis-backend-45v4.vercel.app/api/auth`

---

## 8. Related: lawyer reject → show Rejected + allow re-apply

After admin rejects a lawyer, Auth returns (login / refresh / `/me`):

```json
{
  "user": {
    "verificationStatus": "Rejected",
    "canAccessDashboard": false,
    "nextStep": "complete_lawyer_application",
    "pendingVerificationRole": null,
    "canReapply": true,
    "canApplyAsLawyer": true,
    "message": "Your lawyer application was rejected. You can update your details and apply for verification again."
  },
  "accountAccess": { "...same fields..." }
}
```

### FE routing rules

| Condition | UI |
|-----------|-----|
| `nextStep === 'verification_pending'` OR `pendingVerificationRole` set | Pending verification screen only |
| `verificationStatus === 'Rejected'` OR `canReapply === true` | **Rejected** message + re-open lawyer apply form |
| `canApplyAsLawyer === true` | Enable `POST /profile/lawyer/apply` again |

Do **not** treat `Rejected` as Pending.  
Do **not** gate apply only on `ApplicationRequired` — rejected users keep a profile row but must re-apply.

---

## 9. Acceptance checklist

- [ ] `.htaccess` uploaded to Hostinger `public_html`
- [ ] `google-auth.html` uploaded to Hostinger `public_html`
- [ ] `/login` and `/signup` return **200** (hard refresh)
- [ ] Google button uses `window.location.href` → `/google/start` (no GIS popup on Hostinger)
- [ ] Google signup completes → lands on site logged in
- [ ] Lawyer rejected in admin → FE shows **Rejected** + can submit apply again
- [ ] Google Console origins + redirect URI match §6

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Error 400: origin_mismatch` | Add site origin to Google Console JS origins |
| `Unable to reach the server` / RTK `FETCH_ERROR` | Stop using `/google/token`; use `/google/start` |
| Google finishes → blank / Hostinger 404 | Upload `.htaccess` + `google-auth.html` |
| Stuck on “Signing you in…” | Check `google-auth.html` query has `token`; check sessionStorage |
| Logged in but no user name | Call `GET /me` after bridge redirect |
| Redirect URI mismatch | Only Auth callback URL in Google Console (see §6) |

---

## 11. Files in this backend repo

| Path | Purpose |
|------|---------|
| `docs/hostinger/.htaccess` | SPA rewrite for Hostinger |
| `docs/hostinger/google-auth.html` | Token bridge page |
| `docs/hostinger/README.md` | Short upload note |
| `docs/Frontend_Google_Redirect_Fix.md` | Short version of this handoff |
| `docs/Frontend_Hostinger_Google_SignIn_Handoff.md` | **This document** |
