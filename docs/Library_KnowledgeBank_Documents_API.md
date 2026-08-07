# NexusLexis — Library, Knowledge Bank & My Documents

**Document ID:** NL-DOC-LIB-001  
**Version:** 1.0  
**Updated:** 2026-08-07  
**Audience:** Frontend / Admin UI  
**Base URL (Main API):** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
```

---

## 1. Overview

There are **two template types**:

| Type | `accessType` | UI surface | Behavior |
|------|--------------|------------|----------|
| **Public** | `public` | Knowledge Bank | Free browse + download. Does **not** go to My Documents. |
| **Paid** | `paid` | Client Library | Client download → saved to **My Documents**. Can also place a custom order. |

Admin uploads templates once and sets `accessType`. Clients consume them from the matching catalog.

```
Admin uploads template (accessType)
        │
        ├── public ──► Knowledge Bank ──► free download
        │
        └── paid ────► Client Library
                            │
                            ▼
              POST .../library/templates/:slug/download
                            │
                            ▼
                      My Documents
                   GET /documents
```

---

## 2. Admin APIs (new)

**Auth:** Bearer token — role must be `admin`  
Demo: `admin@nexuslexis.law` / `admin123`

### 2.1 List all templates (admin)

```
GET /admin/library/catalog
GET /admin/library/catalog?accessType=public
GET /admin/library/catalog?accessType=paid
```

Includes inactive templates. Optional `accessType` filter.

### 2.2 Create category

```
POST /admin/library/categories
Content-Type: application/json
```

```json
{
  "name": "Knowledge Bank",
  "slug": "knowledge-bank",
  "description": "Free public templates",
  "icon": "book-open",
  "displayOrder": 4
}
```

### 2.3 Create template (upload)

```
POST /admin/library/templates
Content-Type: multipart/form-data
```

| Field | Required | Notes |
|-------|----------|--------|
| `name` | yes | Display name |
| `accessType` | yes* | `public` or `paid` (*defaults to `paid`) |
| `categorySlug` | yes* | e.g. `document-services` (*or `categoryId`) |
| `price` | paid only | Must be `> 0` for paid; public forced to `0` |
| `deliveryDays` | no | Default `7` |
| `description` | no | |
| `slug` | no | Auto-generated from name |
| `intakeSchema` | no | JSON string |
| `file` | no | PDF / DOC / DOCX / TXT / PNG / JPG (max 5MB) |

**Public example**

```
name=Sample Affidavit Guide
accessType=public
categorySlug=knowledge-bank
description=Free guide for Knowledge Bank
file=<guide.pdf>
```

**Paid example**

```
name=NDA Agreement
accessType=paid
categorySlug=document-services
price=15000
deliveryDays=5
description=Standard NDA for startups
file=<nda.pdf>
```

**Response (201):** `{ "template": { id, name, slug, accessType, listing, price, ... } }`

Template fields of note:

| Field | Meaning |
|-------|---------|
| `accessType` | `public` \| `paid` |
| `listing` | `knowledge_bank` \| `library` |
| `isFree` / `isPaid` | Booleans |
| `hasTemplateFile` | Admin uploaded a file |
| `downloadUrl` | Client-facing download path (see below) |

### 2.4 Update template

```
PUT /admin/library/templates/:idOrSlug
Content-Type: multipart/form-data
```

Same fields as create (all optional). Use `clearFile=true` to remove attached file. Change `accessType` to move between Knowledge Bank and Library.

### 2.5 Deactivate template

```
DELETE /admin/library/templates/:idOrSlug
```

Soft-deletes (`isActive=false`). Hidden from public/client catalogs.

---

## 3. Knowledge Bank APIs (public templates)

No auth required.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/knowledge-bank/catalog` | List free templates (`accessType=public`) |
| GET | `/knowledge-bank/templates/:slug` | Template detail |
| GET | `/knowledge-bank/templates/:slug/download` | Download free file |

Query on catalog: `?category=`, `?search=`

**Note:** Knowledge Bank downloads are **not** written to My Documents.

---

## 4. Client Library APIs (paid templates)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/library/catalog` | No | List **paid** templates only |
| GET | `/library/templates/:slug` | No | Paid template detail |
| GET | `/library/templates/:slug/sample` | No | Preview sample file (if uploaded) |
| **POST** | `/library/templates/:slug/download` | **Client JWT** | **Download → save to My Documents** |

### 4.1 Download paid template → My Documents (new)

```
POST /library/templates/:slug/download
Authorization: Bearer <client_access_token>
```

**Response (201)**

```json
{
  "ok": true,
  "message": "Template downloaded and saved to My Documents",
  "document": {
    "orderNumber": "4821",
    "templateId": "nda-agreement",
    "templateName": "NDA Agreement",
    "status": "Completed",
    "statusKey": "completed",
    "source": "library_download",
    "downloadUrl": "/api/v2/documents/4821/download"
  },
  "downloadUrl": "/api/v2/documents/4821/download"
}
```

| Case | Document status |
|------|-----------------|
| Template has an uploaded file | `Completed` — file ready via `downloadUrl` |
| Template has no file | `Pending Payment` — still appears in My Documents |

Catalog `downloadUrl` for paid items points at this POST endpoint.

---

## 5. My Documents APIs (changed behavior)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/documents` | Client JWT | List client documents (orders + library downloads) |
| GET | `/documents/:orderNumber` | Client JWT | Document detail |
| GET | `/documents/:orderNumber/download` | Client JWT | Download file |

**Changed:**  
Documents now include library downloads (`source: "library_download"`).  
If the document came from a library file, download serves the stored template file (not only disk uploads / plain-text fallback).

Extra fields on document objects:

| Field | Notes |
|-------|--------|
| `source` | `library_download` \| `order` |
| `downloadUrl` | Present when file/status allows download |
| `hasDownload` | On list items |

---

## 6. Custom orders (existing, clarified)

For custom drafting (intake form), still use:

```
POST /orders
Authorization: Bearer <client_token>
```

```json
{
  "templateId": "moa",
  "templateName": "Memorandum of Association",
  "formData": { "summary": "Need MOA for Pvt Ltd in Lahore" }
}
```

- Only **paid** templates  
- Public Knowledge Bank templates **cannot** be ordered (400)  
- Created document appears in `GET /documents` with status `Pending Payment`

---

## 7. Frontend integration checklist

1. **Admin UI**
   - Upload form includes `accessType` (`public` | `paid`)
   - Paid requires `price > 0`
   - Optional `file` attachment

2. **Knowledge Bank page**
   - `GET /knowledge-bank/catalog`
   - Download via `GET /knowledge-bank/templates/:slug/download`

3. **Client Library page**
   - `GET /library/catalog`
   - On Download button: `POST /library/templates/:slug/download` with Bearer token
   - Then refresh My Documents or navigate using returned `document`

4. **My Documents page**
   - `GET /documents`
   - Re-download: `GET /documents/:orderNumber/download`

---

## 8. Env & auth reminder

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
```

- Admin / client tokens come from Auth API login (`POST /api/auth/login`)
- Main API accepts the same JWT (`Authorization: Bearer ...`)

---

## 9. Seeded examples

After deploy/seed:

- Existing corporate / property / document-services templates → **`paid`** (Client Library)
- Sample Knowledge Bank entries (`kb-sample-affidavit`, `kb-nda-overview`) → **`public`**

---

## 10. API summary (added / changed)

| Status | Method | Path |
|--------|--------|------|
| **Added** | GET | `/admin/library/catalog` |
| **Added** | POST | `/admin/library/categories` |
| **Added** | POST | `/admin/library/templates` |
| **Added** | PUT | `/admin/library/templates/:idOrSlug` |
| **Added** | DELETE | `/admin/library/templates/:idOrSlug` |
| **Added** | GET | `/knowledge-bank/catalog` |
| **Added** | GET | `/knowledge-bank/templates/:slug` |
| **Added** | GET | `/knowledge-bank/templates/:slug/download` |
| **Added** | POST | `/library/templates/:slug/download` |
| **Changed** | GET | `/library/catalog` — returns **paid only** |
| **Changed** | GET | `/library/templates/:slug` — **paid only** |
| **Changed** | GET | `/documents` — includes library downloads |
| **Changed** | GET | `/documents/:orderNumber/download` — serves library template files |
| **Changed** | POST | `/orders` — rejects public templates; returns document-shaped payload |

---

*Owner: NexusLexis Engineering · Internal frontend handoff*
