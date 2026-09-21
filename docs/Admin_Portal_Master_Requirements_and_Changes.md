# NexusLexis Admin Portal — Requirements & Backend Delivery

**Document ID:** NL-FE-ADMIN-MASTER-001  
**Version:** 1.0  
**Date:** 27 August 2026  
**Audience:** Frontend team  
**Source requirements:** `nexus_lexis_admin_flows.pdf`  
**Production API:** `https://nexus-lexis-backend-ql8w.vercel.app`  
**Auth:** Bearer JWT + `X-Client-Role: Admin` (full) or `RegistryStaff` (Drafting Desk only)

This is the **single** frontend contract for everything delivered against the admin flows PDF, plus related admin rooms shipped with it.

---

## 1. Requirements (from admin flows PDF)

### 1.1 Drafting Desk — The Registry

| # | Requirement | Spec detail |
|---|-------------|-------------|
| R1 | Access & role isolation | Desk is a restricted Registry room via role keys. Drafters see **only** Drafting Desk. Unauthorized room APIs return **empty** payloads (not locked pages). |
| R2 | Order reception & filtering | Incoming bespoke drafting orders land in admin queue. Filters: status, date range, client profile, payment confirmation. FE path noted: `/admin-panel/orders/`. |
| R3 | Assignment & 24h SLA | Assign verified Advocate or CA via `assigned_to_lawyer_id` / `assigned_to_ca_id`. Starts 24-hour execution SLA clock. |
| R4 | Professional execution | Professional opens brief + intake via `/lawyer/orders` or `/ca/orders`. Render `intake_form_schema` dynamically. |
| R5 | Delivery & settlement | Upload DOCX/PDF via `POST /api/lawyers/assigned-orders/{id}/upload/`. Notify client My Nexus. Update order status and trigger ledger fee remittance. |

### 1.2 Knowledge Bank — Content & SEO Engine

| # | Requirement | Spec detail |
|---|-------------|-------------|
| R6 | Four pillars | Legal Articles · Law Summaries · Free Templates · Legal Calculators |
| R7 | Content management | Admin room to author, edit, categorize, retire articles. Path noted: `/api/knowledge/manage` |
| R8 | SEO & conversion | Keyword/meta fields; Schema.org LegalArticle; internal links to paid drafting/consultation |
| R9 | Public funnel | `/knowledge` → `/knowledge/articles` → `/knowledge/articles/{slug}` with related-services CTA. List API: `GET /api/knowledge/articles/` |

**Product split (important):** Drafting Desk = paid fulfillment. Knowledge Bank = organic acquisition → leads.

---

## 2. What we built (backend delivery map)

| Req | Status | How it is met |
|-----|--------|----------------|
| R1 | Done | `RegistryStaff` → Desk works; Knowledge/LEX return `{ success: true, empty: true, … }` |
| R2 | Done | Queue + filters on Drafting Desk orders; aliases for `/admin-panel/orders` |
| R3 | Done | Assign lawyer/CA; `acceptance_deadline` = now + 24h; CA picker supported |
| R4 | Done | Existing lawyer/CA orders APIs return intake form + schema |
| R5 | Done | Lawyer + CA deliver/upload; My Nexus notification; remittance queue + remit |
| R6 | Done | Pillars on `knowledge_articles` |
| R7 | Done | Admin CRUD + `/api/knowledge/manage` alias |
| R8 | Done | `seo` + `relatedServices` on article detail (`schemaType: LegalArticle`) |
| R9 | Done | Public article list/detail APIs (FE renders `/knowledge` pages) |

**Also shipped (not in PDF, same release train):** LEX Console for client/public LEX oversight.

**Out of backend scope (FE / ops):** injecting JSON-LD into HTML, interactive calculator UI/engines, payment-gateway payout rails (API marks `pending_payout` → `remitted`).

---

## 3. End-to-end flows (implement these)

### A. Drafting Desk

```
Client order / custom draft
        │
        ▼
Admin queue
  GET /api/v2/admin/drafting-desk/orders
  GET /api/v2/admin/drafting-desk/stats
  alias: GET /api/v2/admin-panel/orders  |  GET /admin-panel/orders
        │  filters: status, dateFrom, dateTo, search,
        │           paymentConfirmed, unassignedOnly, clientProfileId
        ▼
Assign
  POST /api/v2/admin/drafting-desk/orders/assign
  picker: GET /api/v2/admin/assignable-professionals?professionalType=lawyer|ca
  fields: assigned_to_lawyer_id | assigned_to_ca_id
          (aliases: lawyerProfileId, caProfileId)
        │  → 24h SLA + professional notification
        ▼
Professional workspace
  GET /api/v2/lawyer/orders  |  GET /api/v2/ca/orders
        │
        ▼
Upload deliverable (multipart field: document)
  POST /api/v2/lawyer/orders/:id/deliver
  POST /api/v2/ca/orders/:id/deliver
  PDF alias: POST /api/lawyers/assigned-orders/:id/upload/
        │  → My Documents + client My Nexus notification
        │  → remittance_status = pending_payout
        ▼
Settlement
  GET  /api/v2/admin/drafting-desk/settlements
  POST /api/v2/admin/drafting-desk/settlements/:orderNumber/remit
```

**Assign examples**

```json
{
  "kind": "custom_docs",
  "appointmentId": "123",
  "assigned_to_lawyer_id": "45",
  "note": "Priority"
}
```

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-…",
  "assigned_to_ca_id": "12"
}
```

### B. Knowledge Bank

```
Admin CMS
  CRUD /api/v2/admin/knowledge/articles
  alias CRUD /api/knowledge/manage
  pillars: legal_articles | law_summaries | free_templates | legal_calculators
  statuses: draft | published | retired
        │
        ▼
Public funnel (FE routes + APIs)
  /knowledge
  /knowledge/articles
       GET /api/v2/knowledge/articles
       alias GET /api/knowledge/articles
  /knowledge/articles/{slug}
       GET /api/v2/knowledge/articles/:slug
       → body, seo { title, description, keywords, schemaType },
         relatedServices[] (conversion panel)
```

**Free templates:** CMS pillar pages (`free_templates`) vs file downloads (`GET /api/v2/knowledge-bank/catalog` + `…/download`). Use both where product needs pages + files.

### C. LEX Console (extra)

```
GET  /api/v2/admin/lex/stats
GET  /api/v2/admin/lex/sessions
GET  /api/v2/admin/lex/sessions/:sessionKey
DELETE /api/v2/admin/lex/sessions/:sessionKey
POST /api/v2/admin/lex/turns/:turnId/flag
POST /api/v2/admin/lex/question-bank/reload
```

Client LEX chat remains `/api/v1/lex/*` (guest limit 4 prompts). Do **not** wire lawyer LEX into this console.

---

## 4. API cheat-sheet (all surfaces)

| Method | Path | Room |
|--------|------|------|
| GET | `/api/v2/admin/drafting-desk/stats` | Desk |
| GET | `/api/v2/admin/drafting-desk/orders` | Desk |
| GET | `/api/v2/admin-panel/orders` | Desk alias |
| POST | `/api/v2/admin/drafting-desk/orders/assign` | Desk |
| GET | `/api/v2/admin/drafting-desk/settlements` | Desk |
| POST | `/api/v2/admin/drafting-desk/settlements/:orderNumber/remit` | Desk |
| GET | `/api/v2/admin/assignable-professionals` | Desk |
| POST | `/api/v2/lawyer/orders/:id/deliver` | Lawyer |
| POST | `/api/v2/ca/orders/:id/deliver` | CA |
| POST | `/api/lawyers/assigned-orders/:id/upload/` | PDF upload alias |
| CRUD | `/api/v2/admin/knowledge/articles[/:idOrSlug]` | Knowledge |
| CRUD | `/api/knowledge/manage[/:idOrSlug]` | Knowledge alias |
| GET | `/api/v2/knowledge/articles[/:slug]` | Public |
| GET | `/api/knowledge/articles[/:slug]` | Public alias |
| GET | `/api/v2/knowledge-bank/catalog` | Free files |
| GET | `/api/v2/knowledge-bank/templates/:slug/download` | Free files |
| * | `/api/v2/admin/lex/*` | LEX Console |

---

## 5. Backend change log (this delivery)

| Area | Change |
|------|--------|
| Schema | `knowledge_articles`; order `assigned_at`, `acceptance_deadline`, `remittance_status`, `settled_at` |
| Drafting Desk | List/stats/assign/settlements services + admin routes |
| Professionals | CA in assignable picker; CA order deliver |
| Delivery | Shared deliver → My Documents + client notify + `pending_payout` |
| Settlement | Admin list + remit endpoint |
| Knowledge | Admin CRUD + public list/detail + SEO/relatedServices |
| Aliases | `/admin-panel/orders`, `/api/knowledge/*`, `/api/lawyers/…/upload/` |
| Roles | `RegistryStaff` Desk-only empty-room isolation |
| LEX Console | Stats, sessions, flag, delete, Q&A reload |
| Docs | This master document (+ PDF) |

Git commits (main): `9e3ca15` (initial rooms) → `5264a3a` (PDF alignment).

---

## 6. Frontend build checklist

1. Admin nav: **Drafting Desk**, **Knowledge CMS**, **LEX Console** (hide LEX/Knowledge for RegistryStaff when APIs return `empty: true`).
2. Desk table with PDF filters + Assign drawer (lawyer/CA) + Settlements remit UI.
3. Lawyer + CA order inbox + multipart upload (`document`).
4. Knowledge CMS editor (4 pillars) + public `/knowledge` funnel with related-services CTA + meta/JSON-LD from `seo`.
5. Free file downloads from `/knowledge-bank` where needed.
6. LEX Console for full Admin only.

---

## 7. Errors

| Status | Meaning |
|--------|---------|
| 400 | Bad assign / invalid pillar or status |
| 401 | Missing/invalid JWT |
| 403 | Not admin/registry |
| 404 | Order / article / session not found |
| 409 | Appointment slot conflict on reassign |

---

*Single FE handoff document · NL-FE-ADMIN-MASTER-001 · Replaces need to juggle separate portal scraps for this release*
