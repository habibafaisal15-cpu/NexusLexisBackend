# NexusLexis — Virtual Legal Office (VLO) API Contract

**Document ID:** NL-FE-VLO-001  
**Backend ticket:** NL-BE-VLO-001  
**Source:** NexusLexis Developer Task Blueprint (VLO module)  
**Version:** 1.0  
**Updated:** 20 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Full request/response contract for Frontend: plans, subscribe/cancel, matters, lawyer desk, admin assign.

**Payment note:** JazzCash / Stripe gateways are **not** wired yet. `POST /vlo/subscribe` creates an **active** subscription with `paymentStatus: "manual_pending"`. FE can build the portal now; billing attaches later.

---

## 0. Headers & errors

| Header | Required on | Value |
|--------|-------------|-------|
| `Authorization` | All except `GET /vlo/plans` | `Bearer <JWT>` |
| `X-Client-Role` | Admin routes | `Admin` |
| `X-Client-Role` | Lawyer routes | `LegalAdvocate` (or JWT role `lawyer`) |
| `Content-Type` | JSON writes | `application/json` |
| `Content-Type` | Matter create / lawyer upload | `multipart/form-data` |

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "planId or planName is required",
  "fields": { "planId": "required" }
}
```

| HTTP | When |
|------|------|
| 400 | Missing multipart file |
| 401 | Missing/invalid JWT |
| 403 | No active subscription (submit matter) / wrong role / matter assigned to another lawyer |
| 404 | Unknown plan / subscription / matter |
| 409 | Already has active subscription |
| 422 | Validation (bad status, missing title, etc.) |

---

## 1. Plans (public)

### GET `/vlo/plans`

**Auth:** none

**Response `200`**

```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "1",
        "name": "Starter",
        "slug": "starter",
        "monthlyFee": 15000,
        "monthlyFeeLabel": "Rs. 15,000",
        "documentReviewsPerMonth": 5,
        "consultationsPerMonth": 2,
        "supportChannel": "email",
        "complianceReport": "quarterly",
        "hasDedicatedLawyer": false
      },
      {
        "id": "2",
        "name": "Growth",
        "slug": "growth",
        "monthlyFee": 30000,
        "monthlyFeeLabel": "Rs. 30,000",
        "documentReviewsPerMonth": 15,
        "consultationsPerMonth": 8,
        "supportChannel": "email_whatsapp",
        "complianceReport": "monthly",
        "hasDedicatedLawyer": true
      },
      {
        "id": "3",
        "name": "Enterprise",
        "slug": "enterprise",
        "monthlyFee": 60000,
        "monthlyFeeLabel": "Rs. 60,000",
        "documentReviewsPerMonth": "Unlimited",
        "consultationsPerMonth": "Unlimited",
        "supportChannel": "whatsapp_dedicated",
        "complianceReport": "monthly",
        "hasDedicatedLawyer": true
      }
    ],
    "counts": { "plans": 3 }
  }
}
```

`-1` in DB → `"Unlimited"` in JSON.

---

## 2. Client subscription

### GET `/vlo/subscription`  
*(alias also: `GET /subscription`)*

**Auth:** Client JWT

**Response `200` (subscribed)**

```json
{
  "success": true,
  "data": {
    "id": "12",
    "status": "active",
    "paymentStatus": "manual_pending",
    "plan": { "id": "2", "name": "Growth", "monthlyFee": 30000, "…": "…" },
    "planName": "Growth Retainer Plan",
    "price": "Rs. 30,000",
    "startDate": "2026-09-20",
    "nextBillingDate": "2026-10-20",
    "assignedLawyer": {
      "id": "44",
      "name": "Ayesha Khan",
      "email": "ayesha@…",
      "profileId": "7"
    },
    "usage": {
      "reviewsUsed": 0,
      "reviewsLimit": 15,
      "reviewsRemaining": 15,
      "consultationsUsed": 0,
      "consultationsLimit": 8,
      "consultationsRemaining": 8,
      "mattersSubmittedThisMonth": 1
    },
    "stripeSubscriptionId": null,
    "createdAt": "…",
    "updatedAt": "…"
  },
  "planName": "Growth Retainer Plan",
  "price": "Rs. 30,000",
  "nextBillingDate": "2026-10-20"
}
```

**No subscription:** `{ "success": true, "data": null, "planName": "", "price": "", "nextBillingDate": "" }`

---

### POST `/vlo/subscribe`

**Auth:** Client JWT  
**Headers:** `Content-Type: application/json`

**Request body**

```json
{ "planId": "2" }
```

or `{ "planName": "Growth" }` / `{ "slug": "growth" }`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `planId` | string/number | One of | Plan id |
| `planName` / `plan` / `slug` | string | One of | `Starter`\|`Growth`\|`Enterprise` |
| `stripeSubscriptionId` | string | No | Future Stripe hook |
| `paymentStatus` | string | No | Default `manual_pending` |

**Response `201`:** `{ "success": true, "data": { /* subscription */ }, "message": "…" }`  
**Errors:** `404` unknown plan · `409` already active · `422` missing plan

---

### POST `/vlo/subscription/cancel`  
*(alias: `POST /subscription/cancel`)*

**Auth:** Client JWT  
**Body:** none required

**Response `200`:** `{ "success": true, "data": { "status": "cancelled", … } }`  
**Errors:** `404` no active sub

---

## 3. Client matters

### GET `/vlo/matters`

**Auth:** Client JWT

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "101",
        "legacyId": "m-101",
        "title": "Employment contract review",
        "description": "…",
        "status": "received",
        "statusLabel": "Awaiting Counsel Vetting",
        "lawyerNotes": null,
        "opinion": null,
        "file": { "url": "https://…/vlo/matters/101/file?kind=intake", "fileName": "contract.pdf", "mime": "application/pdf", "hasFile": true },
        "completedFile": null,
        "createdAt": "…",
        "date": "2026-09-20"
      }
    ],
    "counts": { "total": 1 }
  },
  "matters": [ /* same items — legacy key */ ]
}
```

Statuses: `received` \| `under_review` \| `completed`

---

### GET `/vlo/matters/:id`

**Auth:** Client  
**Path:** id numeric or `m-101`

**Response `200`:** `{ "success": true, "data": { /* one matter */ } }`  
**Errors:** `404`

---

### POST `/vlo/matters`

**Auth:** Client  
**Headers:** `Content-Type: multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Max 255 |
| `description` | string | Yes | |
| `file` | file | No | Preferred field name |
| `files` | file[] | No | Legacy — first file used |

**Response `201`:** `{ "success": true, "data": { /* matter */ } }`  
**Errors:** `403` no active subscription · `422` missing title/description

---

### GET `/vlo/matters/:id/file?kind=intake|completed`

**Auth:** Client  
**Response:** raw file bytes

### GET `/vlo/matters/:id/download`

**Auth:** Client  
Prefers completed upload; else text opinion fallback.  
Legacy alias: `GET /api/vlo/matters/download/:id`

---

## 4. Lawyer desk (`/lawyer/vlo/…`)

Base: `/api/v2/lawyer`  
**Auth:** Lawyer JWT + `X-Client-Role: LegalAdvocate` (or role `lawyer`)

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/lawyer/vlo/subscribers` | Assigned clients only |
| GET | `/lawyer/vlo/subscribers/:subscriberId/matters` | Matters for that client |
| PATCH | `/lawyer/vlo/matters/:matterId` | JSON `{ "status", "lawyerNotes" }` |
| POST | `/lawyer/vlo/matters/:matterId/notes` | `{ "note": "…" }` or `{ "lawyerNotes" }` |
| POST | `/lawyer/vlo/matters/:matterId/upload` | multipart `file` = completed opinion PDF |
| GET | `/lawyer/vlo/matters/:matterId/file?kind=` | Download intake or completed |

### PATCH body example

```json
{
  "status": "under_review",
  "lawyerNotes": "Initial review started. Awaiting annexures."
}
```

Complete:

```json
{
  "status": "completed",
  "lawyerNotes": "Opinion: the clause is enforceable under…"
}
```

### POST upload

```
Content-Type: multipart/form-data
file=<pdf>
```

---

## 5. Admin (`/admin/vlo/…`)

**Auth:** Admin JWT + `X-Client-Role: Admin`

### GET `/admin/vlo/stats`

```json
{
  "success": true,
  "data": {
    "subscriptions": { "total": 10, "active": 7, "unassigned": 2 },
    "matters": { "total": 22, "received": 5, "under_review": 4, "completed": 13 },
    "byPlan": [
      { "plan": "Starter", "activeSubscribers": 3 },
      { "plan": "Growth", "activeSubscribers": 3 },
      { "plan": "Enterprise", "activeSubscribers": 1 }
    ]
  }
}
```

### GET `/admin/vlo/subscriptions`

**Query**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `status` | string | No | `active`\|`cancelled`\|`paused`\|`expired` |
| `plan` | string | No | `Starter`\|`Growth`\|`Enterprise` |
| `search` | string | No | client name/email/plan |
| `page` | number | No | default 1 |
| `limit` | number | No | `12`\|`24`\|`48` |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "12",
        "status": "active",
        "plan": { "name": "Growth", "…": "…" },
        "client": { "id": "9", "name": "Habib Corp", "email": "…" },
        "assignedLawyer": null,
        "usage": { "…": "…" }
      }
    ],
    "pagination": { "page": 1, "limit": 12, "totalItems": 10, "totalPages": 1, "hasNext": false, "hasPrev": false },
    "counts": { "total": 10, "active": 7, "cancelled": 2, "paused": 0, "expired": 1, "unassigned": 2 }
  }
}
```

### GET `/admin/vlo/subscriptions/:id`

**Response `200`:** `{ "success": true, "data": { /* one subscription + client */ } }`

### POST `/admin/vlo/subscriptions/:id/assign-lawyer`

**Headers:** `Content-Type: application/json`

```json
{ "lawyerUserId": "44" }
```

or `{ "lawyerProfileId": "7" }`

**Response `200`:** `{ "success": true, "data": { /* subscription with assignedLawyer */ } }`  
**Errors:** `404` · `422` invalid lawyer

---

## 6. Master endpoint index

### Public / Client

| Method | Path |
|--------|------|
| GET | `/vlo/plans` |
| GET | `/vlo/subscription` |
| POST | `/vlo/subscribe` |
| POST | `/vlo/subscription/cancel` |
| GET | `/vlo/matters` |
| GET | `/vlo/matters/:id` |
| POST | `/vlo/matters` |
| GET | `/vlo/matters/:id/file` |
| GET | `/vlo/matters/:id/download` |
| GET | `/subscription` *(legacy alias)* |
| POST | `/subscription/cancel` *(legacy alias)* |

### Lawyer

| Method | Path |
|--------|------|
| GET | `/lawyer/vlo/subscribers` |
| GET | `/lawyer/vlo/subscribers/:subscriberId/matters` |
| PATCH | `/lawyer/vlo/matters/:matterId` |
| POST | `/lawyer/vlo/matters/:matterId/notes` |
| POST | `/lawyer/vlo/matters/:matterId/upload` |
| GET | `/lawyer/vlo/matters/:matterId/file` |

### Admin

| Method | Path |
|--------|------|
| GET | `/admin/vlo/stats` |
| GET | `/admin/vlo/subscriptions` |
| GET | `/admin/vlo/subscriptions/:id` |
| POST | `/admin/vlo/subscriptions/:id/assign-lawyer` |

---

## 7. FE swap checklist

| Screen | API |
|--------|-----|
| `/vlo` plans comparison | `GET /vlo/plans` |
| Subscribe CTA | `POST /vlo/subscribe` |
| `/account/vlo` header / usage | `GET /vlo/subscription` |
| Submit matter | `POST /vlo/matters` |
| Matter list / detail | `GET /vlo/matters` · `GET /vlo/matters/:id` |
| Download opinion | `file.url` or `…/download` |
| Lawyer VLO desk | `/lawyer/vlo/subscribers` + matter PATCH/upload |
| Admin `/admin-panel/vlo` | `GET /admin/vlo/subscriptions` + assign-lawyer |
| Cancel | `POST /vlo/subscription/cancel` |

---

## 8. Delivery status

| Item | Status |
|------|--------|
| Plans catalogue (15k / 30k / 60k) | **Shipped** |
| Subscribe / cancel / usage | **Shipped** |
| Client matters CRUD + file | **Shipped** |
| Lawyer update / notes / upload | **Shipped** |
| Admin list + assign lawyer + stats | **Shipped** |
| JazzCash / Stripe recurring billing | Deferred |
| WhatsApp support channel automation | Deferred |

---

*NL-FE-VLO-001 · Full request/response contract for Frontend*
