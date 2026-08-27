# NexusLexis — Admin Portal Backend (Drafting Desk · Knowledge · LEX Console)

**Document ID:** NL-FE-ADMIN-PORTAL-001  
**Version:** 1.1  
**Updated:** 27 August 2026  
**Audience:** Frontend team  
**Source flow:** `nexus_lexis_admin_flows.pdf`  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app`

Auth: JWT + `X-Client-Role: Admin` (full rooms) or `RegistryStaff` (Drafting Desk only).

---

## 1. Coverage vs admin flows PDF

| PDF step | Backend status |
|----------|----------------|
| Role isolation (Drafters → Desk only; empty other rooms) | Done — `RegistryStaff` gets empty Knowledge/LEX payloads |
| Order reception + filters | Done — `/admin/drafting-desk/orders` + alias `/admin-panel/orders` |
| Assign `assigned_to_lawyer_id` / `assigned_to_ca_id` + 24h SLA | Done |
| Professional brief via `/lawyer/orders` · `/ca/orders` + intake schema | Done |
| Upload deliverable + My Nexus notification | Done — lawyer/CA deliver + PDF upload alias |
| Ledger settlement / fee remittance | Done — settlements queue + remit |
| Knowledge manage (4 pillars) | Done — `/admin/knowledge/*` + `/api/knowledge/manage` |
| SEO meta + related-services conversion | Done — `seo` + `relatedServices` on article detail |
| Public funnel `/knowledge` → articles → slug | Done — public APIs (FE renders pages) |
| Free template **files** | Done — separate `/knowledge-bank/*` downloads |

---

## 2. Flow A — Drafting Desk (The Registry)

```
Order lands in admin queue
  GET /api/v2/admin/drafting-desk/orders
  alias: GET /api/v2/admin-panel/orders  |  GET /admin-panel/orders
  filters: status, dateFrom, dateTo, search, paymentConfirmed, unassignedOnly, clientProfileId
        │
        ▼
Assign Advocate or CA (24h clock starts)
  POST /api/v2/admin/drafting-desk/orders/assign
  body: assigned_to_lawyer_id | assigned_to_ca_id  (aliases: lawyerProfileId, caProfileId)
  picker: GET /api/v2/admin/assignable-professionals?professionalType=lawyer|ca
        │
        ▼
Professional opens brief + intake_form_schema
  GET /api/v2/lawyer/orders   |   GET /api/v2/ca/orders
        │
        ▼
Upload completed DOCX/PDF
  POST /api/v2/lawyer/orders/:id/deliver
  POST /api/v2/ca/orders/:id/deliver
  PDF alias: POST /api/lawyers/assigned-orders/:id/upload/
        │
        ▼
Client My Nexus notification → My Documents
  remittance_status = pending_payout
        │
        ▼
Admin settlement / fee remittance
  GET  /api/v2/admin/drafting-desk/settlements
  POST /api/v2/admin/drafting-desk/settlements/:orderNumber/remit
```

**Assign body (PDF field names supported):**

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-…",
  "assigned_to_lawyer_id": "45",
  "note": "Priority"
}
```

```json
{
  "kind": "custom_docs",
  "appointmentId": "123",
  "assigned_to_lawyer_id": "45"
}
```

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-…",
  "assigned_to_ca_id": "12"
}
```

**Role keys:** `RegistryStaff` may call Drafting Desk endpoints. Knowledge + LEX return `{ success: true, empty: true, … }` with empty lists (no “locked” signal).

---

## 3. Flow B — Knowledge Bank (Content & SEO)

Four pillars: `legal_articles` | `law_summaries` | `free_templates` | `legal_calculators`

```
Admin CMS
  /api/v2/admin/knowledge/articles
  PDF alias: /api/knowledge/manage
        │
        ▼
Publish (status=published) + SEO fields + relatedServiceSlugs
        │
        ▼
Public funnel (FE routes)
  /knowledge                  ← landing hub (FE)
  /knowledge/articles         ← GET /api/v2/knowledge/articles
                                 alias GET /api/knowledge/articles
  /knowledge/articles/{slug}  ← GET …/articles/:slug
                                 includes seo + relatedServices conversion panel
```

**Free templates note**

| Surface | API |
|---------|-----|
| SEO / content pages (`pillar=free_templates`) | `/knowledge/articles` |
| Actual public file downloads | `/api/v2/knowledge-bank/catalog` + `…/download` |

Article detail returns Schema.org hint: `seo.schemaType = "LegalArticle"`. FE injects JSON-LD + meta tags.

---

## 4. LEX Console (extra admin room)

Not in the PDF; still shipped for admin oversight of **client/public** LEX only.

`GET/DELETE /api/v2/admin/lex/…` · flag turns · `POST …/question-bank/reload`

---

## 5. Endpoint cheat-sheet

| Method | Path |
|--------|------|
| GET | `/api/v2/admin/drafting-desk/stats` |
| GET | `/api/v2/admin/drafting-desk/orders` |
| GET | `/api/v2/admin-panel/orders` *(alias)* |
| POST | `/api/v2/admin/drafting-desk/orders/assign` |
| GET | `/api/v2/admin/drafting-desk/settlements` |
| POST | `/api/v2/admin/drafting-desk/settlements/:orderNumber/remit` |
| GET | `/api/v2/admin/assignable-professionals?professionalType=lawyer\|ca` |
| POST | `/api/v2/lawyer/orders/:id/deliver` |
| POST | `/api/v2/ca/orders/:id/deliver` |
| POST | `/api/lawyers/assigned-orders/:id/upload/` *(PDF alias)* |
| CRUD | `/api/v2/admin/knowledge/articles[/:idOrSlug]` |
| CRUD | `/api/knowledge/manage[/:idOrSlug]` *(PDF alias)* |
| GET | `/api/v2/knowledge/articles[/:slug]` |
| GET | `/api/knowledge/articles[/:slug]` *(PDF alias)* |
| GET | `/api/v2/knowledge-bank/catalog` *(free files)* |

Upload field name: `document` (multipart).

---

## 6. FE checklist

1. Registry room: Desk queue filters + Assign (lawyer/CA) + Settlements remit.  
2. RegistryStaff role key → Desk only; hide/empty other rooms from empty API payloads.  
3. Lawyer + CA order inbox + upload (support PDF upload alias if needed).  
4. Knowledge CMS + public `/knowledge` funnel with related-services CTA.  
5. Wire free file downloads from `/knowledge-bank` where pillar is file-led.  
6. LEX Console for full Admin only.

---

*Backend: NL-BE-ADMIN-PORTAL-001 · Aligned to nexus_lexis_admin_flows.pdf*
