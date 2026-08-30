# NexusLexis — Admin Library Draft APIs (Full Contract)

**Document ID:** NL-FE-LIB-DRAFT-001  
**Backend ticket:** NL-BE-LIB-DRAFT-001  
**Version:** 1.0  
**Updated:** 30 August 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app`  
**Prefix:** `/api/v2/admin/library`  
**Auth:** Admin JWT + `X-Client-Role: Admin`

Replaces FE `localStorage` drafts (`libraryPublishingDrafts.js`) with a separate server draft entity. Drafts never appear in Client Library or Knowledge Bank.

---

## 0. Common headers

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | Yes | `Bearer <JWT>` |
| `X-Client-Role` | Yes | `Admin` |
| `Content-Type` | POST/PUT with file | `multipart/form-data` |
| `Content-Type` | JSON-only | `application/json` |

**Error shape**

```json
{ "error": "Human-readable message" }
```

Publish validation:

```json
{
  "error": "Validation failed",
  "message": "Template name is required",
  "fields": {}
}
```

| HTTP | When |
|------|------|
| 400 | Malformed / empty draft save |
| 401 | Not authenticated |
| 403 | Not admin |
| 404 | Draft not found |
| 409 | Duplicate code/slug on publish |
| 422 | Publish validation failed |

---

## 1. Architecture (Option A)

- Drafts live in table `library_template_drafts` (not `services`).
- Published templates still use `POST /admin/library/templates`.
- Drafts always respond with `status: "draft"` and `isActive: false`.
- Publish flow (MVP): `POST /templates` (full body + file) → then `DELETE /drafts/:id`.
- Optional: pass `draftId` on publish and backend deletes the draft best-effort.
- Policy: **all admins** can list/edit all drafts; `createdBy` is stored.

---

## 2. Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v2/admin/library/drafts` | Create draft (partial OK; file optional) |
| PUT | `/api/v2/admin/library/drafts/:id` | Update draft (partial OK; replace file if sent) |
| GET | `/api/v2/admin/library/drafts/:id` | Get one draft (resume form) |
| DELETE | `/api/v2/admin/library/drafts/:id` | Delete draft |
| GET | `/api/v2/admin/library/catalog?status=draft` | Drafts tab list + `counts.draft` |
| POST | `/api/v2/admin/library/templates` | Publish live template (existing) |

---

## 3. POST `/api/v2/admin/library/drafts`

Create draft. **At least one field** (or file) must be non-empty.

**Content-Type:** `multipart/form-data`

| Field | Type | Draft save | Notes |
|-------|------|------------|-------|
| `name` | string | optional* | |
| `code` | string | optional* | uniqueness NOT enforced on draft |
| `accessType` | `paid` \| `public` | optional* | |
| `categorySlug` | string | optional* | |
| `block` | string | optional* | |
| `lang` / `language` | string | optional* | |
| `price` | number | optional | |
| `version` | string | optional* | |
| `lawyer` / `author` | string | optional* | display name |
| `lawyerProfileId` | string | optional* | aliases: `lawyerId`, `authorProfileId` |
| `description` | string | optional* | |
| `file` | File | optional | stored server-side |

**Response `201`**

```json
{
  "id": "draft-550e8400-e29b-41d4-a716-446655440000",
  "draftKey": "draft-550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "name": "Power of Attorney",
  "code": "NL FAM 001",
  "accessType": "paid",
  "categorySlug": "corporate-business",
  "block": "Petitions",
  "lang": "English / Urdu",
  "language": "English / Urdu",
  "price": 2500,
  "version": "v1.0",
  "lawyer": "Matti Ullah",
  "author": "Matti Ullah",
  "lawyerProfileId": "5",
  "lawyerId": "5",
  "authorProfileId": "5",
  "description": "...",
  "hasTemplateFile": false,
  "templateFileName": null,
  "isActive": false,
  "createdBy": "1",
  "createdAt": "2026-08-30T12:00:00.000Z",
  "updatedAt": "2026-08-30T12:00:00.000Z"
}
```

---

## 4. PUT `/api/v2/admin/library/drafts/:id`

Partial update. Same multipart fields as POST.  
Optional: `clearFile=true` to remove stored file.  
Sending a new `file` replaces the previous one.

**Path param:** `id` — `draft-…` key (or numeric DB id)

**Response `200`:** same draft shape as POST.

**Errors:** `404` draft not found · `400` resulting draft would be empty

---

## 5. GET `/api/v2/admin/library/drafts/:id`

Resume sidebar form.

**Response `200`:** same draft shape.

**Errors:** `404`

---

## 6. DELETE `/api/v2/admin/library/drafts/:id`

**Response `200`**

```json
{ "ok": true, "id": "draft-550e8400-e29b-41d4-a716-446655440000" }
```

---

## 7. GET `/api/v2/admin/library/catalog`

### Query params

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `active` \| `paid` \| `public` \| `inactive` \| `draft` |
| `accessType` | string | `paid` \| `public` (optional) |
| `search` | string | Name/code/description |
| `category` | string | Category slug |
| `block` | string | |
| `language` / `lang` | string | |
| `page` | number | Default 1 |
| `limit` | number | Pagination limits |

### `status` behaviour

| `status` | Returns |
|----------|---------|
| `active` (or omit with filters) | Published + `isActive=true` |
| `paid` | Active paid templates |
| `public` | Active public (Knowledge Bank) templates |
| `inactive` | Published then deactivated (`isActive=false`) |
| `draft` | Draft entities only (`status: "draft"` on each item) |

### Response when `status=draft`

```json
{
  "status": "draft",
  "accessType": null,
  "categories": [],
  "documents": [
    {
      "id": "draft-…",
      "status": "draft",
      "name": "Power of Attorney",
      "isActive": false,
      "hasTemplateFile": true,
      "templateFileName": "poa.pdf"
    }
  ],
  "templates": [ /* same as documents */ ],
  "templateCount": 2,
  "counts": {
    "paid": 16,
    "public": 3,
    "inactive": 0,
    "draft": 2
  },
  "filters": { "categories": [], "blocks": [], "languages": [] },
  "pagination": {
    "page": 1,
    "limit": 12,
    "totalItems": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

**Important:** each draft item includes `status: "draft"` so FE can show the Draft badge.  
`counts.draft` is always present on admin catalog responses (including non-draft tabs).

---

## 8. Publish flow (MVP)

```
1. Admin fills form / auto-saves
   POST /drafts  →  { id: "draft-…" }
   PUT  /drafts/:id  (on subsequent saves)

2. Admin clicks Publish (all required fields + file)
   POST /templates  multipart:
     name, code, accessType, categorySlug, block, lang,
     price (if paid), version, lawyer, lawyerProfileId,
     description, file
     optional: draftId=<draft-…>

3. On 201 success:
   DELETE /drafts/:id
   (or skip if draftId was sent — backend already tries cleanup)
```

### Publish required fields (existing POST `/templates`)

| Field | Required |
|-------|----------|
| `name` | Yes |
| `code` | Yes (recommended; uniqueness checked via slug) |
| `accessType` | Yes (`paid` \| `public`) |
| `categorySlug` | Yes |
| `block` | Yes |
| `lang` | Yes |
| `price` | Yes if paid (> 0) |
| `version` | Yes |
| `lawyer` / `lawyerProfileId` | `lawyerProfileId` required for author identity |
| `description` | Yes |
| `file` | Yes for usable download |

**Response `201`:** `{ "template": { …published template… } }`  
**422** if validation fails · **409** on duplicate slug

---

## 9. Business rules

| Rule | Behaviour |
|------|-----------|
| Admin-only | Drafts never in `/library/*` or `/knowledge-bank/*` |
| Draft ≠ inactive | Inactive = was published then soft-deactivated |
| Auto-save | Sidebar close → POST (new) or PUT (existing id) |
| Slug/code uniqueness | Enforced on **publish** only |
| File storage | Server stores base64; response has `hasTemplateFile` + `templateFileName` |
| Empty save | Rejected with 400 |

---

## 10. FE swap checklist

| Current (localStorage) | Replace with |
|------------------------|--------------|
| `saveLibraryPublishingDraft()` | `POST` or `PUT /admin/library/drafts` |
| `loadLibraryPublishingDrafts()` | `GET /admin/library/catalog?status=draft` |
| `deleteLibraryPublishingDraft()` | `DELETE /admin/library/drafts/:id` |
| Publish + remove local draft | `POST /templates` + `DELETE /drafts/:id` |

FE files: `src/utils/libraryPublishingDrafts.js`, `src/services/libraryApi.js`, `LibraryPublishing.jsx`.

---

## 11. Delivery status

| Priority | Item | Status |
|----------|------|--------|
| P0 | POST + PUT + DELETE `/drafts` | **Shipped** |
| P0 | GET `/catalog?status=draft` + `counts.draft` | **Shipped** |
| P1 | GET `/drafts/:id` | **Shipped** |
| P2 | Atomic `POST /drafts/:id/publish` | Deferred (use publish + delete) |

---

*NL-FE-LIB-DRAFT-001 · Full request/response contract for frontend*
