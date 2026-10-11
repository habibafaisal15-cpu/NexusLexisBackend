# Frontend fix — Google Sign-Up via redirect

**Date:** 11 October 2026  
**Site:** https://nexuslexis.law (Hostinger)  
**Why:** Popup + `POST /google/token` → `Unable to reach the server` (FETCH_ERROR)

## Change the Google button to this

```js
window.location.href =
  'https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/start'
  + '?role=client'
  + '&returnTo=' + encodeURIComponent(window.location.origin);
```

Use `role=lawyer` or `role=ca` when those signup tabs are selected.

## Handle return on `/login`

After Google, user lands on:

`https://nexuslexis.law/login?token=...&refreshToken=...`

Save tokens like normal login, then go to dashboard.

Errors return as:

`/login?googleError=...`

## Backend endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/google/start` | 302 → Google (use this) |
| GET | `/api/auth/google/callback` | Google → FE with tokens |
| POST | `/api/auth/google/token` | Old popup flow (unreliable on Hostinger) |
