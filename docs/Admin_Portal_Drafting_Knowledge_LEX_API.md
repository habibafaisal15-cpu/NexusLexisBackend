# NexusLexis Admin Portal — Full API Contract

**Document ID:** NL-FE-ADMIN-PORTAL-001  
**Version:** 2.0  
**Updated:** 28 August 2026  
**Base URL:** `https://nexus-lexis-backend-ql8w.vercel.app`

---

## 0. Common conventions

### Headers (all admin routes)

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer <JWT>` |
| `X-Client-Role` | Yes | `Admin` (full rooms) or `RegistryStaff` (Drafting Desk only) |
| `Content-Type` | POST/PATCH with JSON | `application/json` |

### Standard error shape

```json
{ "error": "Human-readable message" }
```

| Status | When |
|--------|------|
| 400 | Validation / missing field |
| 401 | Missing or invalid JWT |
| 403 | Not admin / wrong role |
| 404 | Resource not found |
| 409 | Slot conflict (appointment reassign) |

### Pagination object (where used)

```json
{
  "page": 1,
  "limit": 20,
  "totalItems": 42,
  "totalPages": 3,
  "hasNext": true,
  "hasPrev": false
}
```

---

## 1. Drafting Desk

### 1.1 GET `/api/v2/admin/drafting-desk/stats`

**Aliases:** none  
**Auth:** Admin or RegistryStaff

**Query params:** none

**Response `200`**

```json
{
  "success": true,
  "stats": {
    "total": 18,
    "pending": 4,
    "inProgress": 6,
    "completed": 8,
    "slaBreached": 1,
    "unassigned": 2,
    "pendingSettlement": 3,
    "customDocs": 10,
    "serviceOrders": 8,
    "slaHours": 24
  }
}
```

---

### 1.2 GET `/api/v2/admin/drafting-desk/orders`

**Aliases:** `GET /api/v2/admin-panel/orders` · `GET /admin-panel/orders`  
**Auth:** Admin or RegistryStaff

**Query params**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Default `1` |
| `limit` | number | No | `10` \| `20` \| `50` (default `20`) |
| `status` | string | No | Filter by status key |
| `dateFrom` | string | No | ISO date `YYYY-MM-DD` (custom_docs appointments) |
| `dateTo` | string | No | ISO date `YYYY-MM-DD` |
| `search` | string | No | Client name/email, subject, lawyer name |
| `paymentConfirmed` | boolean | No | `true` \| `false` |
| `unassignedOnly` | boolean | No | `true` \| `false` \| `1` |
| `clientProfileId` | string | No | Filter by client user id |

**Response `200`**

```json
{
  "success": true,
  "room": "drafting_desk",
  "orders": [
    {
      "id": "appt_123",
      "kind": "custom_docs",
      "appointmentId": "123",
      "orderNumber": null,
      "client": { "id": "5", "name": "Ali Khan", "email": "ali@example.com" },
      "subject": "Partnership deed draft",
      "description": "Two partners, Lahore",
      "status": "pending",
      "statusKey": "pending",
      "paymentConfirmed": true,
      "paymentStatus": "paid",
      "assignedProfessional": {
        "id": "45",
        "userId": "12",
        "name": "Adv. Sara Ahmed",
        "type": "lawyer"
      },
      "assignedAt": "2026-08-27T10:00:00.000Z",
      "acceptanceDeadline": "2026-08-28T10:00:00.000Z",
      "acceptanceExpired": false,
      "slaHours": 24,
      "createdAt": "2026-08-27T09:00:00.000Z",
      "date": "2026-08-30",
      "source": "custom_docs"
    },
    {
      "id": "order_88",
      "kind": "service_order",
      "appointmentId": null,
      "orderNumber": "ORD-2026-0088",
      "orderId": "88",
      "client": { "id": "5", "name": "Ali Khan", "email": "ali@example.com" },
      "subject": "Affidavit drafting",
      "description": "Urgent",
      "status": "processing",
      "statusKey": "processing",
      "paymentConfirmed": true,
      "paymentStatus": "paid",
      "assignedProfessional": {
        "id": "12",
        "userId": "20",
        "name": "CA Usman Ali",
        "type": "ca"
      },
      "assignedAt": "2026-08-27T11:00:00.000Z",
      "acceptanceDeadline": "2026-08-28T11:00:00.000Z",
      "acceptanceExpired": false,
      "slaHours": 24,
      "createdAt": "2026-08-27T08:00:00.000Z",
      "intakeSchema": { "fields": [] },
      "intakeForm": { "brief": "Urgent", "source": "service_order" },
      "source": "service_order"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### 1.3 POST `/api/v2/admin/drafting-desk/orders/assign`

**Auth:** Admin or RegistryStaff

**Request body — service order (lawyer)**

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-2026-0088",
  "assigned_to_lawyer_id": "45",
  "note": "Priority family matter"
}
```

**Request body — service order (CA)**

```json
{
  "kind": "service_order",
  "orderNumber": "ORD-2026-0088",
  "assigned_to_ca_id": "12",
  "note": "Tax drafting"
}
```

**Request body — custom_docs appointment**

```json
{
  "kind": "custom_docs",
  "appointmentId": "123",
  "assigned_to_lawyer_id": "45",
  "note": "Assigned from Desk"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `kind` | string | Yes* | `custom_docs` \| `service_order` |
| `appointmentId` | string | If custom | Appointment id (or `id` without `appt_` prefix) |
| `orderNumber` | string | If service | Order number or numeric id |
| `assigned_to_lawyer_id` | string | One of | Lawyer profile id (alias: `lawyerProfileId`) |
| `assigned_to_ca_id` | string | One of | CA profile id (alias: `caProfileId`); custom_docs = lawyer only |
| `note` | string | No | Audit / milestone note |

**Response `200` — service order**

```json
{
  "success": true,
  "order": {
    "id": "order_88",
    "orderNumber": "ORD-2026-0088",
    "status": "processing",
    "assignedProfessional": {
      "id": "45",
      "userId": "12",
      "name": "Adv. Sara Ahmed",
      "type": "lawyer"
    },
    "assignedAt": "2026-08-27T12:00:00.000Z",
    "acceptanceDeadline": "2026-08-28T12:00:00.000Z",
    "slaHours": 24
  }
}
```

**Response `200` — custom_docs** returns full appointment oversight object from `GET /api/v2/admin/appointments/:id` (includes `appointment`, timeline, audit).

**Errors:** `400` missing assignee · `404` order/appointment not found · `409` slot taken

---

### 1.4 GET `/api/v2/admin/drafting-desk/settlements`

**Auth:** Admin or RegistryStaff

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `pending_payout` | Remittance filter |

**Response `200`**

```json
{
  "success": true,
  "settlements": [
    {
      "id": "88",
      "orderNumber": "ORD-2026-0088",
      "orderStatus": "completed",
      "remittanceStatus": "pending_payout",
      "settledAt": null,
      "settlementNote": null,
      "subject": "Affidavit drafting",
      "client": { "name": "Ali Khan", "email": "ali@example.com" },
      "professional": { "name": "Adv. Sara Ahmed", "type": "lawyer" }
    }
  ]
}
```

---

### 1.5 POST `/api/v2/admin/drafting-desk/settlements/:orderNumber/remit`

**Auth:** Admin or RegistryStaff

**Path params:** `orderNumber` — order number or id

**Request body**

```json
{
  "note": "Fee remitted via bank transfer REF-9921"
}
```

| Field | Type | Required |
|-------|------|----------|
| `note` | string | No (alias: `settlementNote`) |

**Response `200`**

```json
{
  "success": true,
  "settlement": {
    "orderNumber": "ORD-2026-0088",
    "remittanceStatus": "remitted",
    "settledAt": "2026-08-28T06:00:00.000Z",
    "settlementNote": "Fee remitted via bank transfer REF-9921"
  }
}
```

---

### 1.6 GET `/api/v2/admin/assignable-professionals`

**Auth:** Admin or RegistryStaff

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `professionalType` | string | `lawyer` | `lawyer` \| `ca` |
| `practiceArea` | string | — | Lawyer filter |
| `city` | string | — | City filter |
| `excludeProfileId` | string | — | Exclude current assignee |
| `search` | string | — | Name / practice area |

**Response `200`**

```json
{
  "success": true,
  "professionals": [
    {
      "id": "45",
      "name": "Adv. Sara Ahmed",
      "professionalType": "lawyer",
      "practiceArea": "Family Law",
      "experienceYears": null,
      "availability": "Available today",
      "currentLoad": 3,
      "rating": null,
      "status": "available",
      "city": "Lahore",
      "verificationStatus": "verified"
    }
  ]
}
```

---

## 2. Professional execution & delivery

### 2.1 GET `/api/v2/lawyer/orders`

**Auth:** Lawyer JWT + `X-Client-Role: LegalAdvocate`

**Response `200`**

```json
{
  "orders": [
    {
      "id": 88,
      "orderNumber": "ORD-2026-0088",
      "clientName": "Ali Khan",
      "serviceName": "Affidavit drafting",
      "templateName": "Affidavit drafting",
      "status": "Processing",
      "deadline": "2026-09-03T00:00:00.000Z",
      "intakeForm": { "brief": "Urgent" },
      "formData": { "brief": "Urgent" }
    }
  ]
}
```

`GET /api/v2/ca/orders` — same shape for CA.

---

### 2.2 POST `/api/v2/lawyer/orders/:orderId/deliver`

**Aliases:** `POST /api/v2/ca/orders/:orderId/deliver` · `POST /api/lawyers/assigned-orders/:orderId/upload/`  
**Auth:** Lawyer or CA JWT

**Headers:** `Content-Type: multipart/form-data`

**Form fields**

| Field | Type | Required |
|-------|------|----------|
| `document` | file | Yes — PDF or DOCX (max 8 MB) |

**Path params:** `orderId` — order number or numeric id

**Response `200`**

```json
{
  "success": true,
  "orderId": "ORD-2026-0088",
  "orderNumber": "ORD-2026-0088",
  "file": "affidavit-final.pdf",
  "remittanceStatus": "pending_payout",
  "settlement": { "status": "pending_payout", "triggered": true }
}
```

**Side effects:** order `status=completed` · client notification → My Documents · `remittance_status=pending_payout`

**Errors:** `400` missing file · `404` order not found or not assigned to caller

---

## 3. Knowledge Bank (CMS + public)

### 3.1 GET `/api/v2/admin/knowledge/articles`

**Alias:** `GET /api/knowledge/manage`  
**Auth:** Admin only (`RegistryStaff` → empty list, see §6)

**Query params**

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Default `1` |
| `limit` | number | Max `50`, default `20` |
| `status` | string | `draft` \| `published` \| `retired` |
| `pillar` | string | See pillars below |
| `search` | string | Title / summary / slug |

**Pillars:** `legal_articles` · `law_summaries` · `free_templates` · `legal_calculators`

**Response `200`**

```json
{
  "success": true,
  "articles": [
    {
      "id": "7",
      "slug": "how-to-register-partnership-pakistan",
      "title": "How to register a partnership in Pakistan",
      "pillar": "legal_articles",
      "summary": "SECP registration steps",
      "body": "<p>Full HTML or markdown…</p>",
      "status": "draft",
      "seoTitle": "Partnership Registration Pakistan",
      "seoDescription": "Step-by-step SECP guide",
      "keywords": ["partnership", "SECP"],
      "relatedServiceSlugs": ["partnership-deed"],
      "coverImage": "/uploads/cover.png",
      "publishedAt": null,
      "createdAt": "2026-08-27T10:00:00.000Z",
      "updatedAt": "2026-08-27T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

---

### 3.2 GET `/api/v2/admin/knowledge/articles/:idOrSlug`

**Alias:** `GET /api/knowledge/manage/:idOrSlug`  
**Auth:** Admin

**Response `200`:** `{ "success": true, "article": { …same fields as list item… } }`  
**Errors:** `404`

---

### 3.3 POST `/api/v2/admin/knowledge/articles`

**Alias:** `POST /api/knowledge/manage`  
**Auth:** Admin

**Request body**

```json
{
  "title": "How to register a partnership in Pakistan",
  "slug": "how-to-register-partnership-pakistan",
  "pillar": "legal_articles",
  "summary": "SECP registration steps",
  "body": "<p>Article body…</p>",
  "status": "draft",
  "seoTitle": "Partnership Registration Pakistan",
  "seoDescription": "Step-by-step SECP guide",
  "keywords": ["partnership", "SECP"],
  "relatedServiceSlugs": ["partnership-deed"],
  "coverImage": "/uploads/cover.png"
}
```

| Field | Type | Required |
|-------|------|----------|
| `title` | string | **Yes** |
| `pillar` | string | No (default `legal_articles`) |
| `slug` | string | No (auto from title) |
| `summary` | string | No |
| `body` | string | No |
| `status` | string | No (default `draft`) |
| `seoTitle` | string | No |
| `seoDescription` | string | No |
| `keywords` | string[] | No |
| `relatedServiceSlugs` | string[] | No |
| `coverImage` | string | No |

**Response `201`:** `{ "success": true, "article": { … } }`  
**Errors:** `400` missing title / invalid pillar

---

### 3.4 PATCH `/api/v2/admin/knowledge/articles/:idOrSlug`

**Alias:** `PATCH /api/knowledge/manage/:idOrSlug`  
**Auth:** Admin · partial update — any fields from POST

**Response `200`:** `{ "success": true, "article": { … } }`

---

### 3.5 DELETE `/api/v2/admin/knowledge/articles/:idOrSlug`

**Alias:** `DELETE /api/knowledge/manage/:idOrSlug`  
**Auth:** Admin · soft delete → `status: retired`

**Response `200`:** `{ "success": true, "article": { …, "status": "retired" } }`

---

### 3.6 GET `/api/v2/knowledge/articles` (public)

**Alias:** `GET /api/knowledge/articles`  
**Auth:** none

**Query params:** `page`, `limit`, `pillar`, `search` — published only; **no `body`** in list

**Response `200`:** same as admin list but `body` omitted and only `published` articles

---

### 3.7 GET `/api/v2/knowledge/articles/:slug` (public)

**Alias:** `GET /api/knowledge/articles/:slug`  
**Auth:** none

**Response `200`**

```json
{
  "success": true,
  "article": {
    "id": "7",
    "slug": "how-to-register-partnership-pakistan",
    "title": "How to register a partnership in Pakistan",
    "pillar": "legal_articles",
    "summary": "SECP registration steps",
    "body": "<p>Full content…</p>",
    "status": "published",
    "seoTitle": "Partnership Registration Pakistan",
    "seoDescription": "Step-by-step SECP guide",
    "keywords": ["partnership", "SECP"],
    "relatedServiceSlugs": ["partnership-deed"],
    "coverImage": "/uploads/cover.png",
    "publishedAt": "2026-08-27T12:00:00.000Z",
    "createdAt": "2026-08-27T10:00:00.000Z",
    "updatedAt": "2026-08-27T12:00:00.000Z",
    "relatedServices": [
      {
        "slug": "partnership-deed",
        "name": "Partnership Deed",
        "accessType": "paid",
        "block": "Corporate",
        "price": 2500,
        "href": "/library/partnership-deed"
      }
    ],
    "seo": {
      "title": "Partnership Registration Pakistan",
      "description": "Step-by-step SECP guide",
      "keywords": ["partnership", "SECP"],
      "schemaType": "LegalArticle"
    }
  }
}
```

---

## 4. LEX Console

### 4.1 GET `/api/v2/admin/lex/stats`

**Auth:** Admin only

**Response `200`**

```json
{
  "success": true,
  "stats": {
    "sessions": 120,
    "turns": 450,
    "turnsToday": 12,
    "guestOwners": 80,
    "flaggedTurns": 2,
    "guestPromptLimit": 4,
    "questionBank": {
      "entryCount": 320,
      "embeddingCount": 320,
      "loadedAt": 1693123456789,
      "cacheTtlMs": 300000,
      "hasTfidf": true
    }
  }
}
```

---

### 4.2 GET `/api/v2/admin/lex/sessions`

**Auth:** Admin only

**Query params:** `page`, `limit`, `guestOnly`, `userOnly`, `search`

**Response `200`**

```json
{
  "success": true,
  "sessions": [
    {
      "id": "session_1693123456_ab12cd34",
      "sessionKey": "session_1693123456_ab12cd34",
      "ownerKey": "guest:uuid-here",
      "isGuest": true,
      "title": "What is nikah nama?",
      "turnCount": 2,
      "flaggedCount": 0,
      "createdAt": "2026-08-27T10:00:00.000Z",
      "updatedAt": "2026-08-27T10:05:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalItems": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

---

### 4.3 GET `/api/v2/admin/lex/sessions/:sessionKey`

**Auth:** Admin only

**Response `200`**

```json
{
  "success": true,
  "session": {
    "id": "session_1693123456_ab12cd34",
    "sessionKey": "session_1693123456_ab12cd34",
    "ownerKey": "guest:uuid-here",
    "isGuest": true,
    "title": "What is nikah nama?",
    "createdAt": "2026-08-27T10:00:00.000Z",
    "updatedAt": "2026-08-27T10:05:00.000Z",
    "turns": [
      {
        "id": "101",
        "question": "What is nikah nama?",
        "response": "Nikah nama is…",
        "language": "EN",
        "register": "PLAIN",
        "referralShown": false,
        "isFlagged": false,
        "userId": null,
        "createdAt": "2026-08-27T10:01:00.000Z"
      }
    ]
  }
}
```

---

### 4.4 POST `/api/v2/admin/lex/turns/:turnId/flag`

**Auth:** Admin only

**Request body**

```json
{ "flagged": true }
```

**Response `200`:** `{ "success": true, "turnId": "101", "isFlagged": true }`

---

### 4.5 DELETE `/api/v2/admin/lex/sessions/:sessionKey`

**Auth:** Admin only

**Response `200`:** `{ "success": true, "sessionKey": "session_…" }`

---

### 4.6 POST `/api/v2/admin/lex/question-bank/reload`

**Auth:** Admin only · no body

**Response `200`**

```json
{
  "success": true,
  "questionBank": { "entryCount": 320, "embeddingCount": 0, "loadedAt": null, "cacheTtlMs": 300000, "hasTfidf": false },
  "message": "Question bank cache cleared and reload started"
}
```

---

## 5. RegistryStaff empty-room responses

When `X-Client-Role: RegistryStaff` calls Knowledge or LEX admin routes:

```json
{
  "success": true,
  "empty": true,
  "room": "knowledge",
  "articles": [],
  "pagination": { "page": 1, "limit": 20, "totalItems": 0, "totalPages": 0, "hasNext": false, "hasPrev": false }
}
```

LEX: `{ "success": true, "empty": true, "room": "lex", "sessions": [], … }` or `{ "stats": {} }`

No `403` — intentional (no locked-page signal).

---

## 6. Free template files (separate from CMS)

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v2/knowledge-bank/catalog` | Public |
| GET | `/api/v2/knowledge-bank/templates/:slug` | Public |
| GET | `/api/v2/knowledge-bank/templates/:slug/download` | Public — file bytes |

Use CMS `free_templates` pillar for SEO pages; use `knowledge-bank` for actual file downloads.

---

*NL-FE-ADMIN-PORTAL-001 v2.0 — Full request/response contract for frontend integration*
