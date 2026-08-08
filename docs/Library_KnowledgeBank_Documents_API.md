# NexusLexis — Library, Knowledge Bank & My Documents (API Contract)

**Document ID:** NL-DOC-LIB-002  
**Version:** 2.2  
**Updated:** 2026-08-08  
**Replaces:** NL-DOC-LIB-001 (download-without-payment flow removed)  
**Related CR:** NL-BE-CR-PAGINATION-001  
**Base URL:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
```

Admin demo: `admin@nexuslexis.law` / `admin123`  
Client demo: `client@nexuslexis.law` / `password123`

---

## 0. What changed (send this to frontend)

### Added

| Method | Path | Notes |
|--------|------|--------|
| POST | `/library/templates/:slug/purchase` | Start buy (pending payment) |
| POST | `/library/purchases/:orderNumber/complete` | Complete pay → unlock My Documents |
| POST | `/library/coupons/validate` | Demo coupons `WELCOME10`, `NEXUS20` |
| GET | `/knowledge-bank/catalog` | Public templates only |
| GET | `/knowledge-bank/templates/:slug` | Public detail |
| GET | `/knowledge-bank/templates/:slug/download` | Free download (not My Documents) |
| GET | `/library/templates/:slug/sample` | Paid preview only |
| GET/POST/PUT/DELETE | `/admin/library/categories` | Admin category CRUD |
| POST/PUT/DELETE | `/admin/library/templates` | Admin template upload (`accessType`) |
| GET | `/admin/library/catalog` | Admin catalog + pagination + `counts` |
| GET | `/admin/documents` | **TEMP** list purchases (testing) |
| DELETE | `/admin/documents/:orderNumber` | **TEMP** hard-delete My Documents row |
| DELETE | `/admin/library/templates/:slug?hard=true` | **TEMP** hard-delete template + purchases |

### Updated

| Method | Path | Change |
|--------|------|--------|
| GET | `/library/catalog` | Paid only + field contract + `owned` + **pagination** + flat `documents[]` |
| GET | `/library/templates/:slug` | Paid only + field contract + `owned` |
| GET | `/documents` | Includes library purchases + **pagination** + `counts` |
| GET | `/documents/:orderNumber/download` | Serves purchased library file; **402** if unpaid |
| POST | `/library/templates/:slug/download` | **410 Gone** — do not use |

### Pagination (Library, My Documents, Admin catalog)

`page` default `1`, `limit` default `12` (allow 6/12/24/48, max 48).

```json
"pagination": { "page": 1, "limit": 12, "totalItems": 87, "totalPages": 8, "hasNext": true, "hasPrev": false }
```

---

## 1. Product rules

| Type | `accessType` | UI | Rules |
|------|--------------|----|--------|
| Public | `public` | Knowledge Bank | No login. Free device download. **Never** My Documents. |
| Paid | `paid` | Client Library | Login → **Buy** → **Pay** → unlock in My Documents → download **only** from My Documents. |

**Removed:** `POST /library/templates/:slug/download` no longer unlocks paid files without payment (returns `410`).

---

## 2. Target purchase flow (paid Library)

1. `GET /library/catalog` — show paid docs (`owned` when Bearer present).
2. `POST /library/templates/:slug/purchase` — create pending purchase.
3. `POST /library/purchases/:orderNumber/complete` — mark paid / unlock.
4. `GET /documents` — purchased doc appears.
5. `GET /documents/:orderNumber/download` — download file (completed only).

Knowledge Bank stays: catalog → free `GET .../download` (no My Documents).

---

## 3. Response field contract (templates)

| FE need | API field(s) |
|---------|----------------|
| Route key | `id`, `slug` |
| Title | `name`, `title` |
| Code | `code` (e.g. `NL FAM 04`) |
| Category filter | `category`, `categorySlug`, `categoryName` |
| Block filter | `block` (e.g. Petitions / Notices / Agreements) |
| Language filter | `lang`, `language` |
| Price / Buy CTA | `price`, `priceLabel` (`0` / Free for public) |
| Copy | `description` |
| Attribution | `lawyer`, `author` |
| Version | `version` |
| Routing | `accessType` (`public` \| `paid`) |
| File state | `hasTemplateFile` |
| Ownership | `owned`, `ownedOrderNumber` |
| Actions | `purchaseUrl`, `sampleDownloadUrl`, `downloadUrl` |

Catalog also returns:

```json
{
  "accessType": "paid",
  "categories": [...],
  "templateCount": 9,
  "filters": {
    "categories": ["corporate-business", "..."],
    "blocks": ["Agreements", "Notices", "Petitions"],
    "languages": ["English"]
  }
}
```

Query params on catalogs: `category`, `search`, `block`, `language` (or `lang`).

---

## 3.1 Pagination (Library, My Documents, Admin catalog)

Shared contract on:

- `GET /library/catalog`
- `GET /documents`
- `GET /admin/library/catalog`

Knowledge Bank is **not** paginated in this version.

| Param | Default | Notes |
|-------|---------|--------|
| `page` | `1` | 1-based. `0` / negative → `1`. If `page > totalPages`, clamped to last page. |
| `limit` | `12` | Allowed: `6`, `12`, `24`, `48`. Invalid → nearest allow-list or `12`. Max `48`. |

Always returned (even if `page`/`limit` omitted):

```json
"pagination": {
  "page": 1,
  "limit": 12,
  "totalItems": 87,
  "totalPages": 8,
  "hasNext": true,
  "hasPrev": false
}
```

**Approach A (Library + Admin):** paginate **templates**, not categories.

- `documents` / `templates` = current page only (flat)
- `categories` = filter metadata (`slug`, `name`, `icon`, `templateCount`) — no nested page slice
- `templateCount` = `pagination.totalItems`
- Filters (`search`, `category`, `accessType`, `status`) apply **before** OFFSET/LIMIT

**My Documents:** `documents` = current page only. Sort newest first.

Examples:

```
GET /library/catalog?page=2&limit=12&category=document-services
GET /library/catalog?page=1&limit=24&search=nda
GET /documents?page=1&limit=12&status=completed
GET /admin/library/catalog?page=1&limit=12&accessType=public
GET /admin/library/catalog?page=3&limit=24&search=khula
```

Admin catalog also includes `counts: { paid, public, inactive }` for tabs.

---

## 4. My Documents field contract

| FE need | API field(s) |
|---------|----------------|
| Key | `orderNumber` / `id` |
| Title | `templateName`, `title` |
| Status | `status`, `statusKey` (`pending_payment` \| `completed` \| …) |
| Source | `source` = `library_purchase` (preferred) |
| Dates | `purchasedAt`, `createdAt` |
| Receipt | `price`, `totalPaid` |
| Download | `hasDownload`, `downloadUrl` (only when completed + ready) |
| Category | `category`, `categorySlug`, `categoryName` |

---

## 5. Public Knowledge Bank

| Method | Path | Auth |
|--------|------|------|
| GET | `/knowledge-bank/catalog` | No |
| GET | `/knowledge-bank/templates/:slug` | No |
| GET | `/knowledge-bank/templates/:slug/download` | No |

Returns **only** `accessType=public` and active templates.

---

## 6. Client Library (paid)

| Method | Path | Auth |
|--------|------|------|
| GET | `/library/catalog` | Optional Bearer → sets `owned` |
| GET | `/library/templates/:slug` | Optional Bearer |
| GET | `/library/templates/:slug/sample` | No (preview only) |
| **POST** | `/library/templates/:slug/purchase` | Client JWT |
| **POST** | `/library/purchases/:orderNumber/complete` | Client JWT |
| POST | `/library/coupons/validate` | No |
| POST | `/library/templates/:slug/download` | **410 Gone** |

### Purchase

```http
POST /library/templates/:slug/purchase
Authorization: Bearer <client>
{ "couponCode": "WELCOME10" }
```

Response highlights:

- `paymentRequired: true` + `completeUrl`
- or `alreadyOwned: true` + `downloadUrl` under My Documents
- status stays `pending_payment` until complete

### Complete payment (demo / webhook substitute)

```http
POST /library/purchases/:orderNumber/complete
Authorization: Bearer <client>
{
  "paymentMethod": "demo",
  "paymentReference": "optional-ref",
  "couponCode": "WELCOME10"
}
```

Unlocks document (`status=completed`, `source=library_purchase`).

### Coupons (demo)

```http
POST /library/coupons/validate
{ "code": "WELCOME10", "templateSlug": "affidavit" }
```

Demo codes: `WELCOME10` (10%), `NEXUS20` (20%).

---

## 7. My Documents

| Method | Path | Auth |
|--------|------|------|
| GET | `/documents` | Client JWT |
| GET | `/documents/:orderNumber` | Client JWT |
| GET | `/documents/:orderNumber/download` | Client JWT |

`GET /documents` accepts `page`, `limit`, `status` (`completed`, `pending_payment`, `active`, …). Response includes `documents` (current page), `counts` (all-user totals for tabs), and `pagination`.

Download of unpaid library purchases returns **402** with `completeUrl`.

---

## 8. Admin APIs

Auth: admin Bearer.

| Method | Path |
|--------|------|
| GET | `/admin/library/catalog` |
| GET | `/admin/library/categories` |
| POST | `/admin/library/categories` |
| PUT | `/admin/library/categories/:idOrSlug` |
| DELETE | `/admin/library/categories/:idOrSlug` |
| POST | `/admin/library/templates` (multipart) |
| PUT | `/admin/library/templates/:idOrSlug` |
| DELETE | `/admin/library/templates/:idOrSlug` |

Template multipart fields: `name`, `accessType` (`public`|`paid`), `categorySlug`, `price`, `description`, `code`, `block`, `language`, `author`, `version`, `file`.

### Temporary testing deletes (remove after QA)

Admin Bearer required. Marked `temporaryTestingApi: true`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/documents` | List recent purchases across clients |
| DELETE | `/admin/documents/:orderNumber` | Hard-delete one My Documents row |
| DELETE | `/admin/library/templates/:idOrSlug?hard=true` | Hard-delete template + its purchases |

Normal `DELETE /admin/library/templates/:idOrSlug` (no `hard`) still only deactivates.

---

## 9. Acceptance checklist

- [x] Schema columns migrated on Vercel cold start (`is_active`, `description`, `access_type`, `code`, `block`, `language`, …)
- [x] `GET /knowledge-bank/catalog` → 200, public only
- [x] `GET /library/catalog` → 200, paid only
- [x] Detail/sample → 200/404 (not schema 500)
- [x] Paid file cannot enter My Documents without payment complete
- [x] Purchase + complete path exists
- [x] `GET /documents` lists purchases; download when completed
- [x] Catalog JSON includes section-3 fields + `owned`
- [x] Admin upload with `accessType` works

---

## 10. Custom drafting

`POST /orders` custom intake remains available but is **out of scope** for this Library buy flow.
