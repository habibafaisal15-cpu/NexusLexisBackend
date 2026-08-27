# NexusLexis — LEX AI Frontend Integration

**Document ID:** NL-FE-LEX-001  
**Version:** 1.6  
**Updated:** 13 August 2026  
**Audience:** Frontend team  
**Classification:** Internal  

---

## 1. What LEX is

LEX is the NexusLexis legal chat assistant. It answers **Pakistani law** questions in English, Urdu, or Roman Urdu. It is **not a lawyer** — UI must show a disclaimer.

Production chat is **REST only**. Do **not** use WebSockets in production.

**Guest limit:** Without login, users may send **4 prompts** on `POST /chat/`. The 5th attempt returns **401** with `loginRequired: true`. Logged-in clients are unlimited.

**Out of scope — do not integrate:** Lawyer / counsel LEX (`/api/v2/lawyer/lex/*`). No LEX widget on lawyer dashboard. Client / public widget only.

```env
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
```

| Who | Call |
|-----|------|
| Public / client chat widget | `{VITE_LEX_API_BASE_URL}/chat/` |

---

## 2. Architecture

```
Frontend chat widget
        │
        │  POST /api/v1/lex/chat/   { message, session_key }
        ▼
Main API  (Vercel only — nexus-lexis-backend-ql8w.vercel.app)
        │
        └─ LEX_MODE=inline  →  Node + Gemini + question bank
```

**Production hosts (Vercel only):**

| Service | URL |
|---------|-----|
| Main API + LEX | `https://nexus-lexis-backend-ql8w.vercel.app` |
| Auth API | `https://nexus-lexis-backend-45v4.vercel.app` |

LEX chat runs **inline** on the Main API (Node + Gemini). Chat history is stored on the server (`POST/GET/DELETE /sessions/` + persisted `POST /chat/`). Client widget only.

Local-only: `ws://localhost:3000/api/lex/ws` — **never use in production**.

---

## 3. Client chat flow

```
1. On widget open → show greeting from FE (or send "Hello")
2. Generate session_key once per conversation
     session_${Date.now()}_${random}
3. User types message
4. Append user bubble immediately (optimistic)
5. Show typing indicator
6. POST /chat/  { message, session_key }
7. Render data.response
8. If language === "UR" → RTL
9. If show_lawyer === true → CTA “Find a Lawyer”
10. Keep messages[] in React state (+ localStorage optional)
```

**Auth:** not required for public `/chat/`. Send JWT if the user is logged in (harmless; ignored today).

---

## 4. POST `/chat/`

```
POST https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex/chat/
Content-Type: application/json
```

```json
{
  "message": "How do I register a company in Pakistan?",
  "session_key": "session_1723280000000_ab12"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `message` | **Yes** | Non-empty string. Empty → `400 { "error": "Message is required" }` |
| `session_key` | Recommended | Stable id for this chat thread. If omitted, backend may use a default. |

**200 response**

```json
{
  "response": "To register a private limited company in Pakistan…",
  "language": "EN",
  "register": "PLAIN",
  "show_lawyer": false,
  "guestPromptLimit": 4,
  "guestPromptsUsed": 1,
  "guestPromptsRemaining": 3,
  "loginRequired": false
}
```

| Field | Type | Frontend use |
|-------|------|----------------|
| `response` | string | Bot bubble text (markdown-ish plain text; render as wrapped paragraphs) |
| `language` | `"EN"` \| `"UR"` | `"UR"` → `dir="rtl"` on that bubble |
| `register` | `"PLAIN"` \| `"LEGAL"` | Optional badge (“Legal terms”) |
| `show_lawyer` | boolean | If true, show **Find a Lawyer** → `/find-a-lawyer` |
| `guestPromptLimit` | number | `4` for guests; omitted when logged in |
| `guestPromptsRemaining` | number | Show “N free questions left”; at `0` next send needs login |
| `loginRequired` | boolean | `true` only on **401** (see below) |

**401 — guest limit reached**

```json
{
  "error": "Login required to continue using LEX",
  "code": "LEX_LOGIN_REQUIRED",
  "loginRequired": true,
  "guestPromptLimit": 4,
  "guestPromptsUsed": 4,
  "guestPromptsRemaining": 0
}
```

Show login/signup modal. After login, send `Authorization: Bearer` — unlimited prompts.

---

## 5. Reply decision flow (what LEX does with each question)

Same `POST /chat/` for every message. LEX decides internally — the frontend always renders `response`.

```
                         User asks a question
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │ 1. Introductory?        │
                    │  Hi / Salam / Who are   │
                    │  you / What is LEX?     │
                    └────────────┬────────────┘
                          yes │         │ no
                              ▼         ▼
                     Canned intro     ┌─────────────────────────┐
                     reply. STOP.     │ 2. Law-related?         │
                     No LLM.          └────────────┬────────────┘
                                            yes │         │ no
                                                │         ▼
                                                │   “I can only answer
                                                │    law-related questions.”
                                                │    STOP. No LLM. No bank.
                                                ▼
                    ┌─────────────────────────────────────────────┐
                    │ 3. Law-related → search Question Bank       │
                    │    • TF-IDF on the verified sheet (fast)    │
                    │    • Embeddings of bank questions (when     │
                    │      the background index is ready)         │
                    │    Match user question ↔ bank Q&A           │
                    └──────────────────────┬──────────────────────┘
                              hit │                 │ miss
                                  ▼                 ▼
                    ┌──────────────────┐   ┌──────────────────────┐
                    │ 4a. In bank      │   │ 4b. Not in bank      │
                    │ Pass verified    │   │ Connect to LLM       │
                    │ Q + A into LLM.  │   │ (Gemini) directly    │
                    │ LLM only forms   │   │ for general          │
                    │ sentence         │   │ Pakistani law.       │
                    │ structure — does │   │                      │
                    │ not invent facts │   │                      │
                    │ beyond the sheet.│   │                      │
                    └──────────────────┘   └──────────────────────┘
```

| Step | Condition | What LEX returns | LLM? |
|------|-----------|------------------|------|
| **1 Intro** | Greeting / who-is-LEX | Fixed intro text | No |
| **2 Refuse** | Neither intro nor law (weather, cricket, recipes, code…) | Polite “I can’t answer that — ask a law question.” | No |
| **3 + 4a Bank hit** | Law + close match in question bank | LLM rewrite of the **verified** sheet answer | Yes — structure only |
| **4b Bank miss** | Law + nothing in the bank | LLM answers from general Pakistani legal knowledge | Yes — direct |

Urgency words (`FIR`, `court`, `sue`, `police`, `عدالت`…) set `show_lawyer: true` on law answers.

LEX will **not** quote exact SECP/FBR filing fee numbers — it points the user to the platform **Fee Calculator**.

---

## 6. Length & timing (design the bubble + loader)

There is **one** generation cap: `LLM_MAX_TOKENS = 400` (~1,200–1,800 English characters). No separate short/long API.

| Type | Length | Time (prod measured) |
|------|--------|----------------------|
| Short (hello / off-topic) | 150–350 chars | **0.3–0.8 s** |
| Long (legal) | 800–2,000 chars | **2–6 s** (measured ~2.8 s) |

| Timeout | Value |
|---------|--------|
| FE recommended abort | **45–60 s** |
| Backend LLM timeout | 60 s |
| Vercel Hobby hard limit | ~10 s if the function is cold/slow — show retry |

No streaming. The full `response` arrives in one JSON body. Show a typing indicator until then.

---

## 7. Chat history (frontend + `session_key`)

On **live Vercel**, LEX does **not** persist threads on the server. The widget must keep history in `localStorage` (or app state). Still send one `session_key` per thread so follow-ups stay grouped.

Every successful `POST /chat/` with a `session_key`:

1. Use the **same key** for the whole conversation.
2. Append the user bubble + `response` locally.
3. Title the thread from the first message (trim to ~50 characters).

Frontend must send the **same `session_key`** for the whole thread. A new key = a new conversation (blank memory + new sidebar item).

```
User: "What is an FIR?"     session_key=session_1723_ab
User: "How do I get a copy?"  ← same key → LEX remembers FIR context
```

### 7.1 List threads (sidebar)

```
GET {VITE_LEX_API_BASE_URL}/sessions/
```

```json
[
  {
    "id": 1723280000000,
    "session_key": "session_1723280000000_ab12",
    "title": "How do I register a company…",
    "created_at": "2026-08-10T11:02:01.123456+00:00",
    "messages": []
  }
]
```

`messages` on the list is always `[]`. Load the thread with the detail call.

**Privacy:** this list is **not scoped to the logged-in user** today (no JWT filter). Do **not** dump the full array as “My chats”. Keep the `session_key`s this browser created (localStorage) and only show / fetch those.

### 7.2 Load one thread

```
GET {VITE_LEX_API_BASE_URL}/sessions/:session_key/
```

```json
{
  "session_key": "session_1723280000000_ab12",
  "title": "How do I register a company…",
  "messages": [
    { "id": "u_12", "sender": "user", "text": "How do I register a company in Pakistan?" },
    {
      "id": "l_12",
      "sender": "lex",
      "text": "To register a private limited company…",
      "showReferral": false,
      "referralLabel": "Find a Lawyer →",
      "referralType": "lawyer"
    }
  ]
}
```

| Field | Use |
|-------|-----|
| `sender` | `"user"` \| `"lex"` |
| `text` | Bubble copy |
| `showReferral` | Same as chat `show_lawyer` |
| `referralLabel` | Ready-made CTA string (EN / UR) |
| `referralType` | `"lawyer"` → `/find-a-lawyer` |

Unknown key → **404** `{ "error": "Session not found" }`.

### 7.3 Suggested UI flow

```
Open LEX
  ├─ Read localStorage.lexSessionKeys[]
  ├─ For each key → GET /sessions/:key/   (skip 404s)
  └─ Sidebar = titles; click = render messages[]

Send message
  ├─ POST /chat/ { message, session_key }
  ├─ Append user + lex bubbles from the 200 body
  └─ Save the updated thread in localStorage

New chat
  └─ mint a new session_key; start empty
```

### 7.4 Live behaviour

`GET /sessions/` returns `[]` and detail is a stub. Keep a local copy so the UI does not go blank.

```ts
type LexMessage = {
  id: string;
  sender: 'user' | 'lex';
  text: string;
  language?: 'EN' | 'UR';
  showLawyer?: boolean;
  at: string;
};
```

---

## 8. UI contract

1. **Disclaimer** (always visible under the widget):  
   *“LEX provides general legal information for Pakistan. It is not a substitute for a licensed advocate.”*
2. **Languages:** detect from `language`. Urdu → RTL + a Urdu-capable font.
3. **Find a Lawyer** when `show_lawyer` / `showLawyer` / `showReferral` is true. Label: EN `Find a Lawyer →` · UR `وکیل تلاش کریں ←`.
4. **Off-topic:** render `response` as-is (LEX already refuses politely). Do not retry automatically.
5. **Errors:** `400` empty message · `502` LEX down · network timeout → “LEX is temporarily unavailable. Try again.”
6. **Do not** open WebSockets (`/api/lex/ws`) in production builds.
7. Always use the Vercel Main URL above. Do not call any other LEX host.

---

## 9. Sample client code

```ts
const LEX = import.meta.env.VITE_LEX_API_BASE_URL;

export async function askLex(message: string, sessionKey: string, signal?: AbortSignal) {
  const res = await fetch(`${LEX}/chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_key: sessionKey }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `LEX HTTP ${res.status}`);
  }
  return res.json() as Promise<{
    response: string;
    language: 'EN' | 'UR';
    register: 'PLAIN' | 'LEGAL';
    show_lawyer: boolean;
  }>;
}
```

Abort after 45s:

```ts
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 45_000);
try {
  const data = await askLex(text, sessionKey, ctrl.signal);
} finally {
  clearTimeout(t);
}
```

---

## 10. Quick test (no login)

```bash
curl -s https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex/chat/ \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Hello\",\"session_key\":\"fe_smoke_1\"}"
```

Expect a greeting in `response`. Then try a legal question and an off-topic question (`what is the weather?`).

---

## 11. Acceptance checklist

- [ ] `.env` has `VITE_LEX_API_BASE_URL` (no trailing issues — path already includes `/api/v1/lex`)
- [ ] Widget uses `POST …/chat/` with `{ message, session_key, owner_key }`
- [ ] Guest: show `guestPromptsRemaining`; on `401 LEX_LOGIN_REQUIRED` open login
- [ ] After login, send Bearer — unlimited prompts
- [ ] Typing indicator for 0.3–6 s; timeout ~45 s
- [ ] Urdu bubbles RTL
- [ ] `show_lawyer` opens Find a Lawyer
- [ ] Disclaimer visible
- [ ] Same `session_key` for the whole thread (server history + follow-up memory)
- [ ] Sidebar: `GET /sessions/` + `GET /sessions/:key/` with `owner_key` or JWT
- [ ] New chat = `POST /sessions/`
- [ ] No WebSocket in production build

---

## 12. API index

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/api/v1/lex/chat/` | Public / client JWT | Client widget |
| POST | `/api/v1/lex/sessions/` | Public / client JWT | New chat |
| GET | `/api/v1/lex/sessions/` | Public / client JWT | History sidebar |
| GET | `/api/v1/lex/sessions/:session_key/` | Public / client JWT | Open thread |
| DELETE | `/api/v1/lex/sessions/:session_key/` | Public / client JWT | Delete thread |

**Deleted / do not use**

| Method | Path | Why |
|--------|------|-----|
| WS | `/api/lex/ws` | Local dev only; Vercel has no sockets |
