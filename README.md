# NexusLexis Backend

Backend-only monorepo for NexusLexis (no frontend). Three services:

| Service | Stack | Deploy target |
|---------|-------|---------------|
| **Main API** | Node.js / Express | **Vercel** (repo root) |
| **Auth API** | Node.js / Express | **Vercel** (`auth_backend/`) |
| **LEX AI** | Django + Qwen/Ollama | **Render / Railway / VPS** (not Vercel) |

Repository: [github.com/habibafaisal15-cpu/NexusLexisBackend](https://github.com/habibafaisal15-cpu/NexusLexisBackend)

---

## Local development

```bash
# 1. PostgreSQL — create database `nexuslexis`
# 2. Main API
cp .env.example .env          # edit DB + secrets
npm install
npm run dev                   # http://localhost:3000

# 3. Auth API (second terminal)
cd auth_backend
cp .env.example .env
npm install
npm run dev                   # http://localhost:3001

# 4. LEX AI (third terminal)
cd lex_backend
cp .env.example .env
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001

# 5. Ollama (for AI fallback)
ollama pull qwen2.5:7b-instruct
```

Health checks:
- Main: `GET http://localhost:3000/api/health`
- Auth: `GET http://localhost:3001/api/health`
- LEX:  `POST http://localhost:8001/api/v1/lex/chat/`

---

## Deploy to Vercel (Main + Auth)

### Prerequisites
1. **PostgreSQL** — use [Neon](https://neon.tech) or [Supabase](https://supabase.com) (free tier works).
2. Run schema once against that DB (from your machine):
   ```bash
   # Main schema
   DB_HOST=... DB_PASSWORD=... npm run db:migrate
   # Auth uses same DB — start auth locally once with RUN_STARTUP_DB=true or run auth seed
   ```

### Project 1 — Main API
1. Import repo on [Vercel](https://vercel.com) → **New Project** → select `NexusLexisBackend`.
2. **Root Directory:** `.` (repo root)
3. **Environment variables** (see `.env.production.example`):
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `JWT_SECRET`
   - `AUTH_API_URL` → URL of Auth Vercel project (set after Project 2)
   - `LEX_API_URL` → URL of LEX on Render (set after LEX deploy)
   - `FRONTEND_URLS` → your frontend URL(s)
   - `RUN_STARTUP_DB=false`
4. Deploy → note URL e.g. `https://nexuslexis-api.vercel.app`

### Project 2 — Auth API
1. **New Project** → same repo.
2. **Root Directory:** `auth_backend`
3. Same `DB_*` and `JWT_SECRET` as Main API.
4. Add Microsoft Graph vars for OTP email (`MS365_*`).
5. `FRONTEND_URLS`, `NODE_ENV=production`, `REQUIRE_EMAIL_DELIVERY=true`
6. Deploy → e.g. `https://nexuslexis-auth.vercel.app`
7. Update Main API `AUTH_API_URL` to this URL and redeploy Main.

### Frontend env (after deploy)
```env
VITE_API_BASE_URL=https://nexuslexis-api.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexuslexis-auth.vercel.app/api/auth
VITE_LEX_API_BASE_URL=https://nexuslexis-api.vercel.app/api/v1/lex
```
(WebSocket is not supported on Vercel — frontend should use REST `/api/v1/lex/chat/`)

---

## LEX AI in production

**LEX cannot run on Vercel** (Django, long AI requests, Ollama). Deploy separately:

### Option A — Render (recommended)
1. [Render](https://render.com) → **New Web Service** → connect this repo.
2. **Root Directory:** `lex_backend`
3. Use `render.yaml` or set:
   - Build: `pip install -r requirements.txt && python manage.py migrate --noinput`
   - Start: `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --timeout 120`
4. Env vars: `DJANGO_SECRET_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, etc.
5. Note URL e.g. `https://nexuslexis-lex.onrender.com`
6. Set Main API `LEX_API_URL` to that URL (no trailing path).

### Option B — Ollama for Qwen
Ollama does **not** run on Vercel/Render free tier. Choose one:

| Setup | `LLM_BASE_URL` |
|-------|----------------|
| Ollama on a VPS/GPU server | `http://YOUR_SERVER_IP:11434` |
| Ollama on same machine as LEX | `http://127.0.0.1:11434` (only if co-located) |
| Hosted Qwen API (OpenRouter, etc.) | adapt `llm_client.py` for OpenAI-compatible API |

On the Ollama server:
```bash
ollama pull qwen2.5:7b-instruct
# Keep Ollama running; firewall: allow port 11434 only from LEX server IP
```

LEX still works **without Ollama** for:
- Greetings & intro Q&A
- Excel question bank (Google Sheet RAG)

AI fallback (custom questions) needs a reachable `LLM_BASE_URL`.

---

## Production URL map (example)

| What | URL |
|------|-----|
| Main API base | `https://nexuslexis-api.vercel.app` |
| Auth API base | `https://nexuslexis-auth.vercel.app` |
| LEX (direct) | `https://nexuslexis-lex.onrender.com` |
| Frontend calls Main | `https://nexuslexis-api.vercel.app/api/v2` |
| Frontend calls Auth | `https://nexuslexis-auth.vercel.app/api/auth` |
| Frontend calls LEX | `https://nexuslexis-api.vercel.app/api/v1/lex` (proxied) |

---

## API documentation

See `docs/NexusLexis_API_Documentation.docx` (not included in Vercel deploy).

---

## Notes

- **No frontend** in this repo — frontend is a separate project.
- **Uploads** on Vercel are ephemeral — use S3/cloud storage for production files later.
- **WebSocket** (`/api/lex/ws`) only works in local dev; production uses REST chat.
- Vercel Hobby plan: 10s function timeout — upgrade to Pro (60s) if LEX proxy times out, or call LEX URL directly from frontend.
