# NexusLexis — Document Library End-to-End Flow

**Document ID:** NL-FE-LIB-FLOW-001  
**Version:** 1.0  
**Updated:** 22 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Companion contracts (detail APIs):
- NL-DOC-LIB-002 — Library / Knowledge Bank / My Documents fields
- NL-FE-LIB-AUTHOR-001 — Author identity (`lawyerProfileId`)
- NL-DOC-APPT-001 — Custom docs → appointments → deliver

---

## 1. What this module is

Document Library is one product surface with **four linked tracks**:

| Track | Who | What |
|-------|-----|------|
| **A. Admin publishing** | Admin | Create categories + upload templates (paid or public) |
| **B. Knowledge Bank** | Anyone | Free public templates → download to device |
| **C. Paid Library** | Logged-in client | Browse → buy → pay → unlock in My Documents |
| **D. Custom draft** | Client + assigned lawyer | Request draft from a template author → lawyer delivers → My Documents |

All tracks share the same `services` / template rows. Identity of the author is `lawyerProfileId` (never name alone).

---

## 2. Actors & interlinked components

```
┌─────────────┐     publish templates      ┌──────────────────────┐
│ Admin panel │ ─────────────────────────► │ services (templates) │
│ /admin/     │     accessType paid|public │ + lawyerProfileId    │
└─────────────┘                            └──────────┬───────────┘
                                                      │
          ┌───────────────────────────────────────────┼───────────────────────────┐
          ▼                                           ▼                           ▼
┌──────────────────┐                      ┌──────────────────┐         ┌────────────────────┐
│ Knowledge Bank   │                      │ Client Library   │         │ Custom Doc path    │
│ accessType=public│                      │ accessType=paid  │         │ uses author id     │
└────────┬─────────┘                      └────────┬─────────┘         └─────────┬──────────┘
         │ free download                          │ purchase                    │
         ▼                                        ▼                             ▼
   Device only                              My Documents              Appointments
   (NOT My Documents)                       + download               (source=custom_docs)
                                                                      │
                                                                      ▼
                                                               Lawyer inbox → deliver
                                                                      │
                                                                      ▼
                                                                My Documents
```

| Component | Role |
|-----------|------|
| Admin Library | Categories + templates CRUD; soft activate/deactivate |
| Find a Lawyer (`/lawyers/public`) | Source of verified `lawyerProfileId` + email + photo for author pick |
| Knowledge Bank | Public free catalog + device download |
| Client Library | Paid catalog, sample preview, purchase + complete |
| Coupons | Optional discount on purchase |
| My Documents (`/documents`) | Unlocked paid library files + custom-draft delivers |
| Appointments / custom-requests | Custom drafting booking keyed by `lawyerProfileId` |
| Lawyer appointments + deliver | Accept request; upload finished draft into My Documents |
| Admin Oversight (optional) | Sees `source=custom_docs` bookings platform-wide |

---

## 3. Start → end: Admin publishing (Track A)

```
1. Admin logs in (JWT + X-Client-Role: Admin)
2. GET /admin/library/categories          → pick or create category
3. GET /lawyers/public                    → pick author by lawyerProfileId
4. POST /admin/library/templates
     multipart: file + name + accessType + lawyerProfileId + …
5. Template appears:
     • accessType=paid   → Client Library catalog
     • accessType=public → Knowledge Bank catalog
6. Later: PUT/PATCH isActive true|false   → activate / soft-deactivate
   DELETE /admin/library/templates/:id    → soft deactivate only
```

**Rules**
- `lawyerProfileId` required when an author is set; must be a verified lawyer.
- Catalog echoes `lawyer`, `author`, `lawyerProfileId`, `lawyerId`, `authorProfileId`.
- Inactive templates stay in admin catalog; hidden from public/client catalogs.

---

## 4. Start → end: Knowledge Bank — free (Track B)

```
Guest or client opens Knowledge Bank
        │
        ▼
GET /knowledge-bank/catalog
        │
        ▼
GET /knowledge-bank/templates/:slug     (detail)
        │
        ▼
GET /knowledge-bank/templates/:slug/download
        │
        ▼
File saves to the user's device
```

**Rules**
- No login.
- **Never** lands in My Documents.
- Only `accessType=public` + active rows.

---

## 5. Start → end: Paid Library → My Documents (Track C)

```
Client opens Library (Bearer optional on catalog for "owned")
        │
        ▼
GET /library/catalog?page=&limit=&category=&search=
        │  shows paid templates; owned=true if already purchased
        ▼
GET /library/templates/:slug
        │
        ├─ Sample (optional)
        │     GET /library/templates/:slug/sample
        │
        ▼
POST /library/templates/:slug/purchase
     { couponCode? }
        │  creates pending purchase (paymentRequired)
        │  optional: POST /library/coupons/validate first
        ▼
POST /library/purchases/:orderNumber/complete
     { paymentMethod, paymentReference?, couponCode? }
        │  status → completed; source = library_purchase
        ▼
GET /documents?page=&limit=
        │  purchased row appears
        ▼
GET /documents/:orderNumber/download
        │
        ▼
Client downloads the paid file
```

**Rules**
- Login required for purchase / complete / My Documents download.
- Unpaid download → **402**.
- Old `POST /library/templates/:slug/download` → **410 Gone** (do not call).
- Already owned → purchase may return `alreadyOwned` + My Documents download URL.

---

## 6. Start → end: Custom draft from Library (Track D)

Linked to author identity + appointments.

```
Client on a Library (or KB) card
        │  reads lawyerProfileId from template
        ▼
POST /documents/custom-requests   (or POST /appointments)
{
  lawyerProfileId: 13,          // REQUIRED — not name
  lawyerName: "Matti Ullah",    // label only
  source: "custom_docs",
  mode: "document",
  subject / matterNote / slot / …
}
        │
        ▼
Appointment row created (pending)
        │
        ├─ Client: GET /appointments
        ├─ Lawyer #13: GET /lawyer/appointments   (only assignee)
        └─ Admin: GET /admin/appointments?source=custom_docs
        │
        ▼
Lawyer Accept / Reject / Complete (PATCH)
        │
        ▼
POST /lawyer/appointments/:id/deliver   (file upload)
        │
        ▼
Client My Documents gets delivered draft
GET /documents → GET /documents/:orderNumber/download
```

**Rules**
- Missing/invalid `lawyerProfileId` → **400** (no “any Matti Ullah”).
- Template author id from catalog must drive the request.
- Delivered custom docs use `source=custom_docs` in My Documents.

---

## 7. My Documents — unified inbox

| Source | How it got there | Download |
|--------|------------------|----------|
| `library_purchase` | Paid Library buy + complete | After `completed` |
| `custom_docs` | Lawyer delivered custom draft | After deliver |
| Other service orders | Classic order flow | When ready |

```
GET /documents?page=&limit=&status=
GET /documents/:orderNumber
GET /documents/:orderNumber/download
```

Pagination same shape as Library catalog.

---

## 8. API map (by screen)

### Admin — Library Publishing
| Method | Path |
|--------|------|
| GET/POST/PUT/DELETE | `/admin/library/categories` |
| GET | `/admin/library/catalog` |
| POST/PUT/PATCH/DELETE | `/admin/library/templates` / `:idOrSlug` |
| GET | `/lawyers/public` (author picker) |

### Client — Knowledge Bank
| Method | Path |
|--------|------|
| GET | `/knowledge-bank/catalog` |
| GET | `/knowledge-bank/templates/:slug` |
| GET | `/knowledge-bank/templates/:slug/download` |

### Client — Paid Library
| Method | Path |
|--------|------|
| GET | `/library/catalog` |
| GET | `/library/templates/:slug` |
| GET | `/library/templates/:slug/sample` |
| POST | `/library/templates/:slug/purchase` |
| POST | `/library/purchases/:orderNumber/complete` |
| POST | `/library/coupons/validate` |

### Client — My Documents
| Method | Path |
|--------|------|
| GET | `/documents` |
| GET | `/documents/:orderNumber` |
| GET | `/documents/:orderNumber/download` |

### Client — Custom draft
| Method | Path |
|--------|------|
| POST | `/documents/custom-requests` |
| GET | `/appointments` |
| GET | `/lawyers/:id/availability?date=` |

### Lawyer — Custom draft inbox
| Method | Path |
|--------|------|
| GET/PATCH | `/lawyer/appointments` / `:id` |
| POST | `/lawyer/appointments/:id/deliver` |

---

## 9. Decision rules (quick)

| Question | Answer |
|----------|--------|
| Free vs paid? | `accessType`: `public` → KB; `paid` → Library |
| Where does free file go? | Device only |
| Where does paid file go? | My Documents after complete |
| Who is the author? | `lawyerProfileId` on template |
| Custom doc assignee? | Same `lawyerProfileId` on request |
| Soft delete template? | DELETE admin template → `isActive: false` |
| Reactivate? | PUT/PATCH `{ isActive: true }` |

---

## 10. Frontend checklist

- [ ] Admin publish sends `lawyerProfileId` and shows it back on catalog
- [ ] Knowledge Bank never writes to My Documents
- [ ] Paid Library: catalog → purchase → complete → documents → download
- [ ] Handle `owned` / already purchased on catalog cards
- [ ] Custom Doc locks assignee from template `lawyerProfileId`
- [ ] Shared pagination component for Library + My Documents + Admin catalog
- [ ] Do not call removed `POST /library/templates/:slug/download`
