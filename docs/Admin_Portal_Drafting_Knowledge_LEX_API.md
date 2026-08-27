# NexusLexis — Admin Portal Backend (Drafting Desk · Knowledge · LEX Console)

**Document ID:** NL-FE-ADMIN-PORTAL-001  
**Version:** 1.0  
**Updated:** 25 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app`

Auth: JWT + `X-Client-Role: Admin` on all `/api/v2/admin/*` routes below.

---

## 1. What shipped

Three admin rooms from the Nexus Lexis admin flow:

| Room | Purpose |
|------|---------|
| **Drafting Desk** | Queue + assign bespoke drafting (`custom_docs` appointments + drafting service orders); 24h SLA |
| **Knowledge content** | SEO CMS for four pillars (articles / summaries / free-template pages / calculators) |
| **LEX Console** | Oversight of **client/public** LEX chat only; reload question bank |

Related existing APIs (still use these for execution):

- Lawyer: `GET /api/v2/lawyer/orders`, appointments + deliver  
- CA: `GET /api/v2/ca/orders`  
- Free **document** templates: `GET /api/v2/knowledge-bank/*` (not the same as Knowledge articles)  
- Appointment oversight: `GET /api/v2/admin/appointments*`

---

## 2. End-to-end flows

### A. Drafting Desk (The Registry)

```
Client pays / submits custom draft
        │
        ▼
Admin Drafting Desk queue
  GET /admin/drafting-desk/orders
  GET /admin/drafting-desk/stats
        │
        │  assign lawyerProfileId or caProfileId
        ▼
POST /admin/drafting-desk/orders/assign
  → starts 24h acceptance SLA
  → notifies professional
        │
        ▼
Lawyer/CA workspace (/lawyer/orders or /ca/orders)
  → upload deliverable
        │
        ▼
Client My Documents + notification
```

**Assign body examples**

Custom docs appointment:

```json
{
  "kind": "custom_docs",
  "appointmentId": "123",
  "lawyerProfileId": "45",
  "note": "Priority family matter"
}
```

Service order:

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-…",
  "lawyerProfileId": "45"
}
```

or CA:

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-…",
  "caProfileId": "12"
}
```

Assignable professionals: `GET /api/v2/admin/assignable-professionals`

---

### B. Knowledge Bank content (CMS / SEO)

```
Admin creates article (draft)
  POST /admin/knowledge/articles
        │
        ▼
Admin publishes (status=published)
  PATCH /admin/knowledge/articles/:idOrSlug
        │
        ▼
Public site /knowledge
  GET /knowledge/articles?pillar=legal_articles
  GET /knowledge/articles/:slug
        │
        ▼
CTA → related library service / Find a Lawyer
```

**Pillars:** `legal_articles` | `law_summaries` | `free_templates` | `legal_calculators`  
**Statuses:** `draft` | `published` | `retired`

`free_templates` pillar = **content pages** that can link to template slugs via `relatedServiceSlugs`.  
Actual free file downloads remain at `/api/v2/knowledge-bank/*`.

---

### C. LEX Console

```
Client/guest uses POST /api/v1/lex/chat/
        │
        ▼
Admin Console
  GET /admin/lex/stats
  GET /admin/lex/sessions
  GET /admin/lex/sessions/:sessionKey
        │
  flag turn / delete session / reload Q&A sheet
        ▼
POST /admin/lex/turns/:turnId/flag
DELETE /admin/lex/sessions/:sessionKey
POST /admin/lex/question-bank/reload
```

Guests still capped at **4** prompts (`LEX_LOGIN_REQUIRED`). Logged-in clients unlimited.  
**Do not** build lawyer LEX into this console UI.

---

## 3. API reference

### Drafting Desk

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v2/admin/drafting-desk/stats` | Totals, SLA breach, unassigned |
| GET | `/api/v2/admin/drafting-desk/orders` | Query: `page`, `limit` (10/20/50), `status`, `search`, `dateFrom`, `dateTo`, `paymentConfirmed`, `unassignedOnly` |
| POST | `/api/v2/admin/drafting-desk/orders/assign` | See body above |

Order list item fields: `id` (`appt_*` / `order_*`), `kind`, `client`, `subject`, `status`, `paymentConfirmed`, `assignedProfessional`, `assignedAt`, `acceptanceDeadline`, `slaHours` (24), `source`.

---

### Knowledge articles

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/admin/knowledge/articles` | Admin |
| GET | `/api/v2/admin/knowledge/articles/:idOrSlug` | Admin |
| POST | `/api/v2/admin/knowledge/articles` | Admin |
| PATCH | `/api/v2/admin/knowledge/articles/:idOrSlug` | Admin |
| DELETE | `/api/v2/admin/knowledge/articles/:idOrSlug` | Admin (soft → `retired`) |
| GET | `/api/v2/knowledge/articles` | Public (published only) |
| GET | `/api/v2/knowledge/articles/:slug` | Public |

**POST/PATCH body**

```json
{
  "title": "How to register a partnership in Pakistan",
  "pillar": "legal_articles",
  "summary": "Short SEO blurb",
  "body": "Markdown or HTML body…",
  "status": "draft",
  "seoTitle": "…",
  "seoDescription": "…",
  "keywords": ["partnership", "SECP"],
  "relatedServiceSlugs": ["partnership-deed"],
  "coverImage": "/uploads/…"
}
```

Public list query: `pillar`, `search`, `page`, `limit`.

---

### LEX Console

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v2/admin/lex/stats` | Sessions, turns, guests, Q&A meta |
| GET | `/api/v2/admin/lex/sessions` | `guestOnly`, `userOnly`, `search`, `page`, `limit` |
| GET | `/api/v2/admin/lex/sessions/:sessionKey` | Full turns |
| DELETE | `/api/v2/admin/lex/sessions/:sessionKey` | Moderation delete |
| POST | `/api/v2/admin/lex/turns/:turnId/flag` | Body `{ "flagged": true }` |
| POST | `/api/v2/admin/lex/question-bank/reload` | Clears cache; reloads Google Sheet |

Client LEX chat (unchanged): `/api/v1/lex/chat/`, `/api/v1/lex/sessions/` — see **LEX_AI_Frontend_API.pdf**.

---

## 4. FE build checklist

1. Admin nav rooms: Drafting Desk, Knowledge (CMS), LEX Console.  
2. Drafting Desk table with filters + Assign drawer (lawyer/CA picker from assignable-professionals).  
3. Knowledge CMS list + editor; public `/knowledge` reads public articles API.  
4. LEX Console: stats cards, session list, transcript drawer, flag + delete, “Reload Q&A”.  
5. Keep using existing lawyer/CA order + deliver APIs for execution (no new deliver endpoint required).

---

## 5. Errors

| Status | When |
|--------|------|
| 400 | Missing assign target / invalid pillar / status |
| 401 | Missing/invalid admin JWT |
| 403 | Not admin |
| 404 | Order / article / session / turn not found |
| 409 | Appointment slot conflict on reassign |

---

*Backend ticket: NL-BE-ADMIN-PORTAL-001 · Companion FE: this document*
