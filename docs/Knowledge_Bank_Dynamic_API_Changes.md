# NexusLexis — Knowledge Bank Dynamic API Changes

**Document ID:** NL-BE-KB-DYN-001  
**Source brief:** `NL_Knowledge_Bank_Backend_API_Guidance.pdf` (Frontend → Backend, 18 Sep 2026)  
**Version:** 1.0  
**Updated:** 19 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

This document is the **backend change log + full endpoint contract** after implementing the FE guidance.  
Related (still valid): `Knowledge_Bank_Reads_API.pdf`, `Knowledge_Bank_Calculator_API.pdf`, Library admin template APIs.

---

## 0. What changed (summary)

| Area | Before | After |
|------|--------|-------|
| Free templates | No `verifiedAt` | Persist + return `verifiedAt` / `expiresAt` / `createdAt` / `updatedAt` |
| Public KB catalog | All active public templates | **Hides expired** (verifiedAt + 6 months) |
| Articles / Summaries | No validity | `verifiedAt` on write; public lists hide expired |
| Judgements | Core fields only | Optional `judges`, `result`, `caseNo`, `year`, `citedBy`, `bodyText` + `verifiedAt` |
| Law Books | Missing (FE localStorage) | **Full Admin + Public APIs** |
| Calculators | Already ready | Unchanged — keep existing calc PDF |

**Validity rule:** window = 6 months from `verifiedAt`. Month 5+ = alert (FE). After month 6 = expired → hidden on public; admin still lists. Re-verify = PATCH/PUT with new `verifiedAt` (+ `isActive=true` for templates).

---

## 1. Headers & errors

| Header | On | Value |
|--------|----|-------|
| `Authorization` | All `/admin/…` | `Bearer <admin JWT>` |
| `X-Client-Role` | All `/admin/…` | `Admin` |
| `Content-Type` | JSON writes | `application/json` |
| `Content-Type` | Template create/update + Reads create/file | `multipart/form-data` |

Public GET: **no auth**.

```json
{ "success": false, "error": "…", "message": "…", "fields": { } }
```

---

## 2. Free Templates (Document Library ↔ Knowledge Bank)

Same schema: `accessType: "public"` = KB free template.

### Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/admin/library/catalog?accessType=public` | Admin | Includes expired; returns `verifiedAt` |
| POST | `/admin/library/templates` | Admin | multipart; accept `verifiedAt` |
| PUT | `/admin/library/templates/:idOrSlug` | Admin | multipart; re-verify via `verifiedAt` |
| PATCH | `/admin/library/templates/:idOrSlug` | Admin | same as PUT fields |
| DELETE | `/admin/library/templates/:idOrSlug?hard=true` | Admin | Hard delete |
| GET | `/knowledge-bank/catalog` | Public | **Omits expired** public templates |
| GET | `/knowledge-bank/templates/:slug` | Public | 404 if expired |
| GET | `/knowledge-bank/templates/:slug/download` | Public | 404 if expired |

### POST `/admin/library/templates` (multipart)

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | |
| `accessType` | Yes for KB | `public` |
| `categorySlug` | Yes* | or existing category |
| `price` | No | Forced `0` when public |
| `description`, `code`, `block`, `lang`/`language`, `lawyer`/`author`, `lawyerProfileId`, `version` | No | |
| `verifiedAt` | No | ISO-8601; **defaults to now()** on public create |
| `isActive` | No | default true |
| `file` | Recommended | docx/pdf |

**Response `201`:** `{ "template": { …, "verifiedAt", "expiresAt", "createdAt", "updatedAt", "isFree": true, "accessType": "public" } }`

### Re-verify

PATCH/PUT same template with:

```
verifiedAt=<ISO now>
isActive=true
accessType=public
```

---

## 3. Articles / Summaries / Judgements (Reads)

### Admin

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/admin/knowledge-bank/entries` | — | Query: `pillar`, `status`, `search`, `page`, `limit` ∈ {12,24,48} |
| GET | `/admin/knowledge-bank/entries/:id` | — | Full entry + `verifiedAt` |
| POST | `/admin/knowledge-bank/entries` | multipart or JSON | Include `verifiedAt` on publish (auto-stamped if omitted) |
| PATCH | `/admin/knowledge-bank/entries/:id` | JSON | Partial; may set `verifiedAt` |
| PATCH | `/admin/knowledge-bank/entries/:id/status` | `{ "status" }` | Publish still needs PDF |
| POST | `/admin/knowledge-bank/entries/:id/file` | multipart `file` | Max 15 MB PDF |
| DELETE | `/admin/knowledge-bank/entries/:id/file` | — | Forces `draft` |
| GET | `/admin/knowledge-bank/entries/:id/file` | — | Admin PDF preview |

### Public

| Method | Path | Notes |
|--------|------|-------|
| GET | `/knowledge-bank/articles?search=` | `featured`/`stack`/`mini`/`items`; **hides expired** |
| GET | `/knowledge-bank/summaries?tag=` | `filters` + `items`; **hides expired** |
| GET | `/knowledge-bank/judgements` | `items` (no hide-on-expire by default) |
| GET | `/knowledge-bank/{pillar}/:slug` | Published detail; articles/summaries 404 if expired |
| GET/HEAD | `/knowledge-bank/{pillar}/:slug/file` | PDF; same expiry rule |
| GET | `/knowledge-bank/reads?pillar=` | Optional alias |

### Entry fields (common)

`id`, `pillar`, `slug`, `status`, `title`, `excerpt`, `category`, `keyword`, `metaTitle`, `metaDesc`, `schema`, `related[]`, `displayOrder`, `file{url,fileName,mime,sizeBytes}`, **`verifiedAt`**, **`expiresAt`**, `createdAt`, `updatedAt`

**Articles:** `placement`, `author`, `readMins`, `band`/`kicker`/`credit`  
**Summaries:** `tag`, `chapters`, `amended`  
**Judgements:** `court`, `cite`, `holding`, `judges`, `result`, `caseNo`, `year`, `citedBy`, `bodyText`, `tags`/`spine` (legacy)

### PATCH re-verify example

```json
{ "verifiedAt": "2026-09-19T12:00:00.000Z", "status": "published" }
```

### Admin list response

```json
{
  "success": true,
  "data": {
    "items": [ /* compact rows incl. verifiedAt */ ],
    "pagination": { "page": 1, "limit": 12, "totalItems": 18, "totalPages": 2, "hasNext": true, "hasPrev": false },
    "counts": { "articles": 8, "summaries": 9, "judgements": 6, "published": 19, "draft": 3, "retired": 1 }
  }
}
```

---

## 4. Law Books — NEW

Replaces FE `localStorage['nexus-lexis-law-books-v2']`.

### Admin endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/knowledge-bank/books` | Admin | List + counts; query `status`, `search`, `kind`, `subject`, `page`, `limit` |
| GET | `/admin/knowledge-bank/books/:idOrSlug` | Admin | Detail (draft/published/retired) |
| POST | `/admin/knowledge-bank/books` | Admin | Create JSON |
| PUT | `/admin/knowledge-bank/books/:idOrSlug` | Admin | Full/partial update |
| PATCH | `/admin/knowledge-bank/books/:idOrSlug` | Admin | Partial update |
| PATCH | `/admin/knowledge-bank/books/:idOrSlug/status` | Admin | `{ "status": "published" }` |
| DELETE | `/admin/knowledge-bank/books/:idOrSlug` | Admin | Soft → `retired`; `?hard=true` hard delete |

### Public endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/knowledge-bank/books` | Public | Published only; filters below |
| GET | `/knowledge-bank/books/:idOrSlug` | Public | Published detail |

**Public query params:** `search`, `kind`, `subject`, `year`, `language` (`EN`\|`UR`\|`EN_UR`), optional `page`/`limit`

### POST `/admin/knowledge-bank/books` body

```json
{
  "slug": "pakistan-penal-code-annotated",
  "status": "published",
  "kind": "annotated",
  "subject": "criminal",
  "title": "Pakistan Penal Code - annotated",
  "description": "Bare text with section notes...",
  "spineBand": "VOL. I",
  "spineCode": "PPC",
  "edition": "2026 ed.",
  "year": 2026,
  "pages": 1240,
  "languages": ["EN", "UR"],
  "spineTone": "seal",
  "author": "Nexus Lexis Panel",
  "contents": [{ "title": "Preliminary", "page": 1 }],
  "sampleChapter": { "title": "Sample", "body": "..." }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | Always | |
| `description` | When `published` | |
| `kind` | Yes | `annotated`\|`constitution`\|`reporter`\|`practice`\|`commentary` |
| `subject` | Yes | `criminal`\|`constitutional`\|`procedure`\|`family`\|`tax`\|`civil` |
| `slug` | No | Unique; **immutable after publish** |
| `status` | No | default `draft` |
| `languages` | No | default `["EN"]` |
| `spineTone` | No | `seal`\|`navy`\|`blue`\|`green`\|`teal`\|`brown` |

**Response `201`:** `{ "success": true, "data": { /* LawBook */ } }`

### Admin list response

```json
{
  "success": true,
  "data": {
    "items": [ /* LawBook */ ],
    "pagination": { "page": 1, "limit": 12, "totalItems": 8, "totalPages": 1, "hasNext": false, "hasPrev": false },
    "counts": { "books": 8, "published": 6, "draft": 1, "retired": 1 }
  }
}
```

### Public list response

```json
{
  "success": true,
  "data": {
    "items": [ /* published only */ ],
    "filters": {
      "kinds": ["annotated","constitution","reporter","practice","commentary"],
      "subjects": ["criminal","constitutional","procedure","family","tax","civil"],
      "languages": ["EN","UR","EN_UR"],
      "years": [2026,2025]
    },
    "counts": { "published": 6 }
  }
}
```

Draft/retired never returned on public routes.

---

## 5. Calculators (unchanged)

Keep using existing contract: `docs/Knowledge_Bank_Calculator_API.pdf`  
Public: `GET /knowledge-bank/calculators[/:id]`  
Admin: snapshot PUT/PATCH + resource PDF routes.

---

## 6. Master endpoint index (all KB dynamic APIs)

### Public

| Method | Path |
|--------|------|
| GET | `/knowledge-bank/catalog` |
| GET | `/knowledge-bank/templates/:slug` |
| GET | `/knowledge-bank/templates/:slug/download` |
| GET | `/knowledge-bank/articles` |
| GET | `/knowledge-bank/summaries` |
| GET | `/knowledge-bank/judgements` |
| GET | `/knowledge-bank/{pillar}/:slug` |
| GET/HEAD | `/knowledge-bank/{pillar}/:slug/file` |
| GET | `/knowledge-bank/books` |
| GET | `/knowledge-bank/books/:idOrSlug` |
| GET | `/knowledge-bank/calculators` |
| GET | `/knowledge-bank/calculators/:id` |
| GET | `/knowledge-bank/calculators/:id/resource.pdf` |

### Admin

| Method | Path |
|--------|------|
| GET | `/admin/library/catalog` |
| POST | `/admin/library/templates` |
| PUT/PATCH | `/admin/library/templates/:idOrSlug` |
| DELETE | `/admin/library/templates/:idOrSlug` |
| GET | `/admin/knowledge-bank/entries` |
| GET | `/admin/knowledge-bank/entries/:id` |
| POST | `/admin/knowledge-bank/entries` |
| PATCH | `/admin/knowledge-bank/entries/:id` |
| PATCH | `/admin/knowledge-bank/entries/:id/status` |
| POST | `/admin/knowledge-bank/entries/:id/file` |
| DELETE | `/admin/knowledge-bank/entries/:id/file` |
| GET | `/admin/knowledge-bank/entries/:id/file` |
| GET | `/admin/knowledge-bank/books` |
| GET | `/admin/knowledge-bank/books/:idOrSlug` |
| POST | `/admin/knowledge-bank/books` |
| PUT/PATCH | `/admin/knowledge-bank/books/:idOrSlug` |
| PATCH | `/admin/knowledge-bank/books/:idOrSlug/status` |
| DELETE | `/admin/knowledge-bank/books/:idOrSlug` |
| GET | `/admin/knowledge-bank/calculators` |
| PUT | `/admin/knowledge-bank/calculators/:id` |
| PUT | `/admin/knowledge-bank/calculators/:id/groups/:groupId` |
| PATCH | `/admin/knowledge-bank/calculators/:id` |
| POST/DELETE | `/admin/knowledge-bank/calculators/:id/resource` |

---

## 7. Acceptance checklist (from FE brief)

- [x] Publish public template with `verifiedAt` → appears on KB; simulate age > 6 months → disappears from public; admin still lists; re-verify restores  
- [x] Same for article + summary  
- [x] Create/publish law book via Admin API → public `/knowledge-bank/books`  
- [x] Draft book never on public  
- [x] Admin KPI `counts` returned for books + reads  
- [x] No browser localStorage required for catalogue truth  

**Deferred (optional):** book cover/PDF upload multipart; dedicated `POST …/reverify` (FE uses PATCH).

---

*NL-BE-KB-DYN-001 · Backend implementation change log for Frontend*
