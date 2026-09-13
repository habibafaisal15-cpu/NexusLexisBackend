# NexusLexis — Knowledge Bank Reads (Full API Contract)

**Document ID:** NL-FE-KB-READS-001  
**Backend ticket:** NL-BE-KB-READS-001  
**Version:** 2.0  
**Updated:** 13 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Card is JSON. Body is one PDF. Admin publishes → public `/knowledge` sections paint cards → click opens `DocumentPreviewModal` via `file.url`.

**Not this CR:** Library templates, calculators, SEO CMS (`/knowledge/articles`).

---

## 0. Common headers & errors

### Headers

| Header | Required on | Value |
|--------|-------------|-------|
| `Authorization` | All `/admin/…` | `Bearer <admin JWT>` |
| `X-Client-Role` | All `/admin/…` | `Admin` |
| `Content-Type` | PATCH JSON | `application/json` |
| `Content-Type` | POST create / POST file | `multipart/form-data` |

Public GET + public PDF: **no auth**.  
JSON list/detail responses: `Cache-Control: no-store`.  
Public PDF: `Content-Type: application/pdf`, CORS `*`, `Cache-Control: public, max-age=300`.

### Error envelope

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
| 400 | Malformed / missing multipart file |
| 401 | Missing/invalid JWT (admin) |
| 403 | Authenticated but not admin |
| 404 | Unknown id/slug, or public GET of draft/retired / missing PDF |
| 409 | Slug taken; published slug/pillar change locked |
| 413 | PDF > 15 MB |
| 415 | Not `application/pdf` |
| 422 | Publish without PDF; missing extras; featured taken; stack full; bad enum |

---

## 1. Pillars & shared entry object

| pillar | Landing | Layout |
|--------|---------|--------|
| `articles` | #articles | `featured` + `stack[0–2]` + `mini[]` |
| `summaries` | #summaries | filters + statute grid |
| `judgements` | #judgements | 2-col digest cards |

Statuses: `published` \| `draft` \| `retired`. Public never returns draft/retired.

### Full entry shape (admin + public detail)

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
  "hasFile": true,
  "file": {
    "url": "https://…/api/v2/knowledge-bank/articles/cheque-bounce-section-489f/file?v=1726000000000",
    "fileName": "cheque-bounce-section-489f.pdf",
    "mime": "application/pdf",
    "sizeBytes": 482113
  },
  "createdAt": "2026-09-13T10:00:00.000Z",
  "updatedAt": "2026-09-13T12:00:00.000Z",
  "updatedBy": "1",
  "placement": "stack",
  "kicker": "Criminal Law",
  "band": "seal",
  "author": null,
  "credit": null,
  "readMins": 5
}
```

**Pillar extras**

| Pillar | Extra fields |
|--------|--------------|
| `articles` | `placement` (`featured`\|`stack`\|`mini`), `kicker`, `band` (`seal`\|`gold`\|`navy`), `author`, `credit`, `readMins` |
| `summaries` | `tag` (`Constitutional`\|`Criminal`\|`Civil`\|`Family`\|`Property`\|`Tax`), `chapters`, `amended` |
| `judgements` | `court`, `cite`, `holding`, `spine` (`sc`\|`hc`\|`lhc`), `tags[]` (max 6), `readMins` |

**related** values allowed: `drafting` \| `consultation` \| `vlo`.

**Publish rules**
- `status=published` without PDF → **422** `{ fields.file: "required" }`
- Published articles need `placement`
- Published summaries need valid `tag`
- Published judgements need `cite`
- Only one published `featured`; at most two published `stack` → else **422**
- DELETE file → forces `status=draft`. Retire keeps file.

---

## 2. GET `/knowledge-bank/articles` (public)

**Auth:** none  
**Headers:** none required  
**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `search` | string | No | Filters title / excerpt / keyword (ILIKE) |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "featured": { /* one entry or null */ },
    "stack": [ /* 0–2 */ ],
    "mini": [ /* rest */ ],
    "items": [ /* all published, for client search */ ],
    "counts": { "published": 6 }
  }
}
```

Empty published set → **200** with `featured: null`, empty arrays (never 404 a list).

---

## 3. GET `/knowledge-bank/summaries` (public)

**Auth:** none  
**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tag` | string | No | One of `Constitutional`…`Tax`, or omit / `All` |

**Response `200`**

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

**Errors:** `422` if `tag` is not in the allowed set (and not `All`).

---

## 4. GET `/knowledge-bank/judgements` (public)

**Auth:** none  
**Query params:** none

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [ /* … */ ],
    "counts": { "published": 6 }
  }
}
```

---

## 5. GET `/knowledge-bank/reads` (public, optional alias)

**Auth:** none  
**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pillar` | string | Yes | `articles` \| `summaries` \| `judgements` |
| `tag` | string | No | Only when `pillar=summaries` |

**Response `200`:** same envelope as the matching pillar landing.  
**Errors:** `422` if `pillar` missing/invalid.

---

## 6. GET `/knowledge-bank/{pillar}/:slug` (public)

**Auth:** none  

**Path params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pillar` | string | Yes | `articles` \| `summaries` \| `judgements` |
| `slug` | string | Yes | Published slug |

**Response `200`**

```json
{
  "success": true,
  "data": { /* full entry including file.url */ }
}
```

**Errors:** `404` if unknown, draft, or retired.

---

## 7. GET / HEAD `/knowledge-bank/{pillar}/:slug/file` (public PDF)

**Auth:** none  

**Path params:** `pillar`, `slug` (published only)

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `download` | `"1"` | No | If `1` → `Content-Disposition: attachment`; else `inline` |
| `v` | number | No | Cache-buster from `file.url` (`updatedAt` ms) — ignored by server |

**Response `200`:** raw PDF bytes  

**Response headers**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/pdf` |
| `Content-Disposition` | `inline; filename="…"` or `attachment; …` |
| `Cache-Control` | `public, max-age=300` |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, HEAD, OPTIONS` |
| `Cross-Origin-Resource-Policy` | `cross-origin` |

**OPTIONS** same path → `204` with CORS headers.

**HEAD** → `200` with `Content-Length`, no body.

**Errors:** `404` if draft/retired or no PDF.

**FE:** `file.url` → pdf.js `getDocument({ url })`.

---

## 8. GET `/admin/knowledge-bank/entries`

**Auth:** Admin JWT + `X-Client-Role: Admin`  
**Headers:** `Authorization`, `X-Client-Role`

**Query params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `pillar` | string | No | `articles` \| `summaries` \| `judgements` |
| `status` | string | No | `published` \| `draft` \| `retired` |
| `search` | string | No | title / slug / keyword / category / cite / court |
| `page` | number | No | Default `1` |
| `limit` | number | No | `12` \| `24` \| `48` (nearest snap). Default `12` |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "12",
        "pillar": "articles",
        "slug": "cheque-bounce-section-489f",
        "title": "Cheque bounce under Section 489-F",
        "category": "Criminal Law",
        "keyword": "cheque bounce pakistan",
        "status": "published",
        "updatedAt": "…",
        "hasFile": true,
        "displayOrder": 20,
        "placement": "stack"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "totalItems": 18,
      "totalPages": 2,
      "hasNext": true,
      "hasPrev": false
    },
    "counts": {
      "articles": 8,
      "summaries": 9,
      "judgements": 6,
      "published": 19,
      "draft": 3,
      "retired": 1
    }
  }
}
```

`counts` are **global** KPI tiles (do not shrink when filters are on).  
Admin list rows are **compact** (summaries may show `tag`; judgements `cite`).

---

## 9. GET `/admin/knowledge-bank/entries/:id`

**Auth:** Admin  

**Path params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string/number | Yes | Entry id |

**Response `200`:** `{ "success": true, "data": { /* full entry */ } }`  
**Errors:** `404`

---

## 10. POST `/admin/knowledge-bank/entries` (create)

**Auth:** Admin  
**Headers:** `Content-Type: multipart/form-data`

**Body fields (form)**

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `pillar` | string | Yes | `articles` \| `summaries` \| `judgements` |
| `title` | string | Yes | Max 140 |
| `slug` | string | No | 4–72 kebab; default from title |
| `status` | string | No | Default `draft` |
| `excerpt` or `body` | string | No | Max 400 (admin “body” → excerpt) |
| `category` | string | No | |
| `keyword` | string | No | |
| `metaTitle` | string | No | |
| `metaDesc` | string | No | |
| `schema` | bool | No | `true`/`1`/`yes` |
| `related` | csv or multi | No | `drafting,consultation,vlo` |
| `displayOrder` | number | No | Default `0` |
| `placement` | string | If published article | `featured`\|`stack`\|`mini` |
| `kicker` | string | No | articles |
| `band` | string | No | `seal`\|`gold`\|`navy` |
| `author` | string | No | articles |
| `credit` | string | No | articles |
| `readMins` | number | No | 1–60 |
| `tag` | string | If published summary | Allowed summary tags |
| `chapters` | string | No | summaries |
| `amended` | string | No | summaries |
| `court` | string | No | judgements |
| `cite` | string | If published judgement | |
| `holding` | string | No | judgements |
| `spine` | string | No | `sc`\|`hc`\|`lhc` |
| `tags` | csv | No | judgements, max 6 |
| `file` | file | If published | Field name **must** be `file`. Max 15 MB PDF |

**Example (articles draft)**

```
pillar=articles
title=Cheque bounce under Section 489-F
slug=cheque-bounce-section-489f
status=draft
excerpt=Criminal complaint, civil recovery, or both…
category=Criminal Law
keyword=cheque bounce pakistan
schema=true
related=drafting,consultation
displayOrder=20
placement=stack
kicker=Criminal Law
band=seal
readMins=5
file=<optional pdf>
```

**Response `201`**

```json
{
  "success": true,
  "data": { /* full entry */ }
}
```

**Errors:** `400` missing file when required · `409` slug taken · `413` · `415` · `422` validation / placement rules

---

## 11. PATCH `/admin/knowledge-bank/entries/:id`

Metadata only — PDF untouched. Unknown keys ignored.

**Auth:** Admin  
**Headers:** `Content-Type: application/json`

**Path params:** `id`

**Request body** (partial JSON — any subset of create fields except `file`)

```json
{
  "title": "Cheque bounce under Section 489-F (updated)",
  "excerpt": "…",
  "status": "published",
  "placement": "featured",
  "band": "gold",
  "readMins": 6,
  "metaTitle": "…",
  "metaDesc": "…"
}
```

| Rule | Behaviour |
|------|-----------|
| Pillar change | Allowed only while `draft`; published → **409** `{ pillar: "locked" }` |
| Slug change | Allowed only while not published; published → **409** `{ slug: "locked" }` |
| Publish | Same publish extras + PDF required as create |

**Response `200`:** `{ "success": true, "data": { /* full entry */ } }`  
**Errors:** `404` · `409` · `422`

---

## 12. PATCH `/admin/knowledge-bank/entries/:id/status`

**Auth:** Admin  
**Headers:** `Content-Type: application/json`

**Request body**

```json
{ "status": "retired" }
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `status` | string | Yes | `published` \| `draft` \| `retired` |

Publishing via this route still requires existing PDF + pillar extras (same as PATCH metadata).

**Response `200`:** `{ "success": true, "data": { /* full entry */ } }`  
**Errors:** `404` · `422`

---

## 13. POST `/admin/knowledge-bank/entries/:id/file`

Replace PDF atomically.

**Auth:** Admin  
**Headers:** `Content-Type: multipart/form-data`

**Path params:** `id`

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | PDF, max 15 MB. Field name **must** be `file` |
| `fileName` | string | No | Display name override |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "12",
    "hasFile": true,
    "file": {
      "url": "https://…/file?v=…",
      "fileName": "cheque-bounce-section-489f.pdf",
      "mime": "application/pdf",
      "sizeBytes": 482113
    }
  }
}
```

**Errors:** `400` missing file · `404` · `413` · `415`

---

## 14. DELETE `/admin/knowledge-bank/entries/:id/file`

**Auth:** Admin  
**Body:** none

Clears PDF and forces `status=draft`.

**Response `200`:** `{ "success": true, "data": { /* entry with file: null, status: "draft" */ } }`  
**Errors:** `404`

---

## 15. GET `/admin/knowledge-bank/entries/:id/file`

**Auth:** Admin  

**Query:** `download=1` optional (same as public)

**Response `200`:** raw PDF bytes (CORS headers set; admin may preview drafts).  
**Errors:** `404` if no file.

---

## 16. FE swap

| Current | Replace with |
|---------|--------------|
| Hardcoded article JSX | `GET /knowledge-bank/articles` → featured/stack/mini |
| `STATUTES` | `GET /knowledge-bank/summaries` |
| `JUDGEMENTS` | `GET /knowledge-bank/judgements` |
| Click no-op | `setPreview({ title, pdfUrl: entry.file.url })` |
| Admin local SEED | `GET/POST/PATCH …/entries` + file routes |

Until first successful GET with items, FE may keep fixtures.

---

## 17. Delivery status

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

*NL-FE-KB-READS-001 · v2.0 Full request/response contract for frontend*
