# NexusLexis — LEX Chat History API (Frontend)

**Document ID:** NL-FE-LEX-HIST-001  
**Version:** 1.0  
**Updated:** 11 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex`

```env
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex
```

Chat is still REST. No WebSockets in production.

---

## 0. Changelog

### Added

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/sessions/` | **New chat** — empty thread + `session_key` |
| GET | `/sessions/` | **History sidebar** — this owner’s threads |
| GET | `/sessions/:session_key/` | Open one thread (user + LEX turns) |
| DELETE | `/sessions/:session_key/` | Delete a thread |

### Updated

| Method | Path | Change |
|--------|------|--------|
| POST | `/chat/` | Saves every turn. Returns `session_key`, `owner_key`, `title`. Last 5 turns go to the LLM. |

### Deleted

None. `GET /sessions/` is no longer an empty stub.

---

## 1. Flow

```
Open LEX widget
   │
   ├─ First visit: mint owner_key = "guest_" + uuid
   │                store in localStorage (lexOwnerKey)
   │
   ├─ Sidebar: GET /sessions/?owner_key=<owner>
   │
   ├─ New chat ──────────────┐
   │                         ▼
   │              POST /sessions/  { owner_key }
   │              → session_key, title "New chat"
   │                         │
   │                         ▼
   │              User types message
   │              POST /chat/  { message, session_key, owner_key }
   │              → response + title (first message)
   │              Server stores user + LEX turn
   │
   └─ Click old thread
              GET /sessions/:session_key/?owner_key=<owner>
              → messages[]  render bubbles
```

Logged-in users: send `Authorization: Bearer <token>`. Backend sets `owner_key = user:<id>`. Do not mix guest and user owners.

---

## 2. Owner (required for history)

| Who | How |
|-----|-----|
| Guest | `owner_key` in JSON **or** header `X-Lex-Owner` |
| Logged in | JWT only — ignore guest key |

Without owner, `GET /sessions/` returns `[]`. Chat still works (server may create `guest:<uuid>` and return it — **save that `owner_key`**).

---

## 3. New chat

```
POST {VITE_LEX_API_BASE_URL}/sessions/
Content-Type: application/json
X-Lex-Owner: guest_8f3a…

{ "owner_key": "guest_8f3a…", "title": "New chat" }
```

`title` optional.

**201**

```json
{
  "id": "session_1786457021479_0678f44a",
  "session_key": "session_1786457021479_0678f44a",
  "owner_key": "guest_8f3a…",
  "title": "New chat",
  "created_at": "2026-08-11T14:10:21.479Z",
  "updated_at": "2026-08-11T14:10:21.479Z",
  "messages": []
}
```

---

## 4. Send a message (saved)

```
POST {VITE_LEX_API_BASE_URL}/chat/
{
  "message": "What is an FIR?",
  "session_key": "session_1786457021479_0678f44a",
  "owner_key": "guest_8f3a…"
}
```

If `session_key` is omitted, backend creates a session and returns it.

**200** (same as before, plus history fields)

```json
{
  "response": "An FIR is…",
  "language": "EN",
  "register": "PLAIN",
  "show_lawyer": true,
  "session_key": "session_1786457021479_0678f44a",
  "owner_key": "guest_8f3a…",
  "title": "What is an FIR?"
}
```

Title becomes the first user message (max 50 chars). Follow-ups keep that title.

---

## 5. History list

```
GET {VITE_LEX_API_BASE_URL}/sessions/?owner_key=guest_8f3a…
```

**200** — array (newest first)

```json
[
  {
    "id": "session_1786457021479_0678f44a",
    "session_key": "session_1786457021479_0678f44a",
    "owner_key": "guest_8f3a…",
    "title": "What is an FIR?",
    "created_at": "2026-08-11T14:10:21.479Z",
    "updated_at": "2026-08-11T14:12:01.002Z",
    "turnCount": 2,
    "messages": []
  }
]
```

`messages` on the list is always `[]`. Load the thread with the detail call.

---

## 6. Open / delete a thread

```
GET {VITE_LEX_API_BASE_URL}/sessions/:session_key/?owner_key=guest_8f3a…
```

```json
{
  "session_key": "session_1786457021479_0678f44a",
  "title": "What is an FIR?",
  "messages": [
    { "id": "u_12", "sender": "user", "text": "What is an FIR?" },
    {
      "id": "l_12",
      "sender": "lex",
      "text": "An FIR is…",
      "showReferral": true,
      "referralLabel": "Find a Lawyer →",
      "referralType": "lawyer",
      "language": "EN"
    }
  ]
}
```

```
DELETE {VITE_LEX_API_BASE_URL}/sessions/:session_key/
```

Unknown or wrong owner → **404**.

---

## 7. UI checklist

- [ ] Persist `owner_key` (guest uuid or use JWT)
- [ ] New chat → `POST /sessions/` then empty composer
- [ ] Sidebar → `GET /sessions/`
- [ ] Click row → `GET /sessions/:key/`
- [ ] Send → `POST /chat/` with same `session_key`
- [ ] `language === "UR"` → RTL; `show_lawyer` / `showReferral` → Find a Lawyer
- [ ] Optional delete on thread
- [ ] Do not use `/api/lex/ws` in production
