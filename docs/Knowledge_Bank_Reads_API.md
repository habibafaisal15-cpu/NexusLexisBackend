# NexusLexis — Knowledge Bank Reads API Contract

**Document ID:** NL-FE-KB-READS-001  
**Backend ticket:** NL-BE-KB-READS-001  
**Version:** 1.0  
**Updated:** 13 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Card is JSON. Body is one PDF. Admin publishes → public `/knowledge` sections paint cards → click opens `DocumentPreviewModal` via `file.url`.

**Not this CR:** Library templates, calculators, SEO CMS (`/knowledge/articles`).

---

## 0. Headers

| Header | Routes | Value |
|--------|--------|-------|
| `Authorization` | Admin | `Bearer <JWT>` |
| `X-Client-Role` | Admin | `Admin` |
| `Content-Type` | Create / file | `multipart/form-data` |
| `Content-Type` | PATCH | `application/json` |

Public GET + public PDF: **no auth**. PDF responses send `Content-Type: application/pdf`, CORS `*`, `Cache-Control: public, max-age=300`.

**Error shape**

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "A PDF is required to publish",
  "fields": { "file": "required" }
}
```

| HTTP | When |
|------|------|
| 400 | Malformed / missing multipart |
| 401 / 403 | Admin auth |
| 404 | Unknown id/slug, or public GET of draft/retired |
| 409 | Slug taken; published slug/pillar change |
| 413 | PDF > 15 MB |
| 415 | Not PDF |
| 422 | Publish without PDF; missing extras; second featured; stack full; bad enum |

---

## 1. Pillars

| pillar | Landing | Layout |
|--------|---------|--------|
| `articles` | #articles | featured + stack[0–2] + mini[] |
| `summaries` | #summaries | filters + statute grid |
| `judgements` | #judgements | 2-col digest cards |

Statuses: `published` \| `draft` \| `retired`. Public never returns draft/retired.

---

## 2. Endpoints

### Public

| Method | Path |
|--------|------|
| GET | `/knowledge-bank/articles` |
| GET | `/knowledge-bank/summaries` |
| GET | `/knowledge-bank/judgements` |
| GET | `/knowledge-bank/articles/:slug` |
| GET | `/knowledge-bank/summaries/:slug` |
| GET | `/knowledge-bank/judgements/:slug` |
| GET/HEAD | `/knowledge-bank/{pillar}/{slug}/file` (?download=1 → attachment) |
| GET | `/knowledge-bank/reads?pillar=articles\|summaries\|judgements` *(optional)* |

### Admin

| Method | Path |
|--------|------|
| GET | `/admin/knowledge-bank/entries` |
| GET | `/admin/knowledge-bank/entries/:id` |
| POST | `/admin/knowledge-bank/entries` |
| PATCH | `/admin/knowledge-bank/entries/:id` |
| PATCH | `/admin/knowledge-bank/entries/:id/status` |
| POST | `/admin/knowledge-bank/entries/:id/file` |
| DELETE | `/admin/knowledge-bank/entries/:id/file` |
| GET | `/admin/knowledge-bank/entries/:id/file` |

---

## 3. Shared entry object

```json
{
  "id": "12",
  "pillar": "articles",
  "slug": "cheque-bounce-section-489f",
  "status": "published",
  "title": "Cheque bounce under Section 489-F",
  "excerpt": "Criminal complaint, civil recovery, or both…",
  "category": "Criminal Law",
  "keyword": "cheque bounce pakistan",
  "metaTitle": "…",
  "metaDesc": "…",
  "schema": true,
  "related": ["drafting", "consultation"],
  "displayOrder": 20,
  "file": {
    "url": "https://…/knowledge-bank/articles/cheque-bounce-section-489f/file?v=…",
    "fileName": "cheque-bounce-section-489f.pdf",
    "mime": "application/pdf",
    "sizeBytes": 482113
  },
  "createdAt": "…",
  "updatedAt": "…",
  "updatedBy": "1"
}
```

**Publish rule:** `status=published` without PDF → **422**. Retire keeps file. DELETE file → forces `draft`.

---

## 4. Public landing responses

### GET `/knowledge-bank/articles`

```json
{
  "success": true,
  "data": {
    "featured": { /* one or null */ },
    "stack": [ /* 0–2 */ ],
    "mini": [ /* rest */ ],
    "items": [ /* all, for search */ ],
    "counts": { "published": 6 }
  }
}
```

Article extras: `placement` (`featured`\|`stack`\|`mini`), `kicker`, `band` (`seal`\|`gold`\|`navy`), `author`, `credit`, `readMins`.

**Uniqueness (reject):** only one published `featured`; at most two published `stack`. Second write → 422 (admin chooses).

### GET `/knowledge-bank/summaries`

```json
{
  "success": true,
  "data": {
    "filters": ["All", "Constitutional", "Criminal", "Civil", "Family", "Property", "Tax"],
    "items": [ /* … */ ],
    "counts": { "published": 9 }
  }
}
```

Extras: `tag` (required on publish), `chapters`, `amended`. Query `?tag=Criminal` optional.

### GET `/knowledge-bank/judgements`

```json
{
  "success": true,
  "data": {
    "items": [ /* … */ ],
    "counts": { "published": 6 }
  }
}
```

Extras: `court`, `cite` (required on publish), `holding`, `spine` (`sc`\|`hc`\|`lhc`), `tags[]`, `readMins`.

Empty published lists → **200** with empty arrays / `featured: null` (never 404 a list).

---

## 5. Admin ledger

`GET /admin/knowledge-bank/entries?pillar=&status=&search=&page=&limit=`

`limit` ∈ {12, 24, 48}, default 12.

```json
{
  "success": true,
  "data": {
    "items": [ /* compact rows */ ],
    "pagination": { "page": 1, "limit": 12, "totalItems": 18, "totalPages": 2, "hasNext": true, "hasPrev": false },
    "counts": {
      "articles": 8, "summaries": 9, "judgements": 6,
      "published": 19, "draft": 3, "retired": 1
    }
  }
}
```

`counts` are **global** (KPI tiles do not shrink when filters are on).

---

## 6. Create / update

### POST `/admin/knowledge-bank/entries` (multipart)

```
pillar=articles
title=…
slug=cheque-bounce-section-489f
status=draft
excerpt=…          # admin "body" field → excerpt
category=Criminal Law
keyword=…
metaTitle=…
metaDesc=…
schema=true
related=drafting,consultation
displayOrder=20
placement=stack
kicker=Criminal Law
band=seal
readMins=5
file=<pdf>         # optional on draft; required if published
```

Summaries also: `tag`, `chapters`, `amended`.  
Judgements also: `court`, `cite`, `holding`, `spine`, `tags`.

**Response `201`:** `{ "success": true, "data": { /* full entry */ } }`

### PATCH `/admin/knowledge-bank/entries/:id` (JSON)

Metadata only — PDF untouched. Unknown keys ignored.  
Pillar/slug change blocked after publish → **409**.

### PATCH `/admin/knowledge-bank/entries/:id/status`

```json
{ "status": "retired" }
```

### POST `/admin/knowledge-bank/entries/:id/file`

Field name **must** be `file`. Optional `fileName`. Max 15 MB. Replace atomic.

### DELETE `…/file`

Clears PDF and forces `status=draft`.

---

## 7. PDF popup

Public `file.url` → pdf.js `getDocument({ url })`.

- No auth on public file
- Draft/retired → 404
- `Content-Type: application/pdf`
- `Content-Disposition: inline` (or `attachment` if `?download=1`)
- CORS allow GET/HEAD/OPTIONS
- URL includes `?v=<updatedAt>` cache-buster after replace

---

## 8. FE swap

| Current | Replace with |
|---------|--------------|
| Hardcoded article JSX | `GET /knowledge-bank/articles` → featured/stack/mini |
| `STATUTES` | `GET /knowledge-bank/summaries` |
| `JUDGEMENTS` | `GET /knowledge-bank/judgements` |
| Click no-op | `setPreview({ title, pdfUrl: entry.file.url })` |
| Admin local SEED | `GET/POST/PATCH …/entries` + file routes |

Until first successful GET with items, FE may keep fixtures.

---

## 9. Delivery status

| P | Item | Status |
|---|------|--------|
| P0 | Admin CRUD + three pillars | **Shipped** |
| P0 | PDF upload/replace + public file CORS | **Shipped** |
| P0 | Public articles/summaries/judgements layouts | **Shipped** |
| P0 | Publish-without-PDF = 422; retire hides | **Shipped** |
| P1 | Featured/stack uniqueness (reject) | **Shipped** |
| P1 | Admin pagination + search + PATCH status | **Shipped** |
| P2 | Hard delete, CDN, PDF full-text | Deferred |

---

*NL-FE-KB-READS-001 · Full request/response contract for frontend*
