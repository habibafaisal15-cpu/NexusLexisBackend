# NexusLexis — Custom Docs, Appointments & My Documents

**Document ID:** NL-DOC-APPT-001  
**Version:** 1.0  
**Updated:** 2026-08-10  
**CR:** NL-BE-CR-CUSTOM-DOCS-001  
**Base URL:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
```

Demo: `client@nexuslexis.law` / `password123` · `lawyer@nexuslexis.law` / `password123`

---

## 0. Changelog (what shipped)

### Added

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/lawyers/:lawyerProfileId/availability?date=YYYY-MM-DD` | Real date-based free/busy slots |
| GET | `/admin/appointments` | Admin: list all bookings (optional `status`, `source`, `lawyerProfileId`) |
| PATCH | `/admin/appointments/:id` | Admin: `{ status, responseNote, slot, date }` — same status rules as lawyer PATCH |
| GET | `/lawyer/availability` | Lawyer weekly template + overrides |
| PUT | `/lawyer/availability` | Update weekly template + date overrides |
| POST | `/lawyer/appointments/:appointmentId/deliver` | Upload finished custom draft → My Documents |
| POST | `/documents/custom-requests` | Alias: create appointment with `source=custom_docs` |

### Updated

| Method | Path | Change |
|--------|------|--------|
| POST | `/appointments` | Persists custom-docs brief fields; mode enum; slot date/time from `slot`; **409** if slot taken |
| GET | `/appointments` | Returns `source`, brief fields, attachments, `deliveredDocument`, ISO `date` |
| GET | `/lawyer/appointments` | Same brief + `source` badge fields |
| PATCH | `/lawyer/appointments/:id` | Accepts `{ status, responseNote, slot, date }`; invalid status → **400** + `allowed` (never 500) |
| GET | `/documents` | Includes `source=custom_docs` delivered drafts |
| GET | `/documents/:orderNumber/download` | Downloads lawyer-delivered custom file |
| POST | `/lawyer/orders/:orderId/deliver` | Real deliver; **404** if order unknown (stub removed) |

### Deleted / stopped

| Method | Path | Change |
|--------|------|--------|
| POST | `/lawyer/orders/:orderId/deliver` | No longer fake-success for unknown ids |

---

## 1. Product flow

Library → Request custom draft / “doc not found” → brief + lawyer + free slot → **Document Drafting Consultation** (`source=custom_docs`) → lawyer inbox → lawyer **deliver** file → client **My Documents**.

Same API for Entry A (card) and Entry B (empty search). Prefill `matterNote` from search text.

---

## 2. Book appointment (custom docs + legacy)

```
POST /appointments
Authorization: Bearer <client>
```

JSON (legacy still works):

```json
{
  "lawyerProfileId": 1,
  "lawyerName": "Demo Lawyer",
  "slot": "2026-08-11T10:00:00+05:00",
  "mode": "document",
  "intake": "optional free-text",
  "clientCity": "Lahore",
  "source": "custom_docs",
  "categoryId": "drafting",
  "categoryLabel": "Document Drafting",
  "subject": "Custom draft: Khula Petition",
  "serviceArea": "Family Law",
  "matterNote": "Need Khula petition with schedule notes…",
  "language": "English",
  "attachments": []
}
```

Also accepts `date` + `timeSlot` instead of ISO `slot`. Multipart `attachments` files optional.

**Modes stored as-is:** `online` | `inperson` | `document` | `video` | `audio` | `chat`  
(`in-person` / `office` → `inperson`; `drafting` → `document`)

**Slot taken:** `409 { "error": "This slot is no longer available" }`

Alias:

```
POST /documents/custom-requests
```

Same body; forces `source=custom_docs`.

---

## 3. Availability

```
GET /lawyers/1/availability?date=2026-08-11
```

```json
{
  "lawyerProfileId": "1",
  "date": "2026-08-11",
  "slots": [
    { "start": "2026-08-11T10:00:00+05:00", "label": "10:00 AM", "available": true },
    { "start": "2026-08-11T11:30:00+05:00", "label": "11:30 AM", "available": false }
  ]
}
```

Default template if lawyer has not configured: 10:00, 11:30, 14:00, 16:00 (PKT).

Lawyer management:

```
GET /lawyer/availability
PUT /lawyer/availability
Authorization: Bearer <lawyer>
{
  "timezone": "Asia/Karachi",
  "weekly": { "monday": ["10:00", "11:30", "14:00", "16:00"] },
  "overrides": { "2026-08-11": ["10:00", "11:30"] }
}
```

---

## 4. GET appointment fields (client + lawyer)

| Field | Notes |
|-------|--------|
| `id`, `professionalId` / `professionalProfileId` | Consistent ids |
| `source` | `custom_docs` \| `consultation` |
| `categoryId`, `categoryLabel`, `subject`, `serviceArea`, `matterNote` | Brief |
| `language`, `city` / `clientCity` | |
| `description` / `caseDescription` | |
| `date` | ISO `YYYY-MM-DD` from slot (not request day) |
| `time` / `timeSlot` | `HH:MM` |
| `mode`, `status`, `statusKey` | |
| `attachments[]` | `{ id, fileName, url }` |
| `responseNote` | Lawyer note |
| `deliveredDocument` | `{ orderNumber, title }` or `null` |

Lawyer list also has `clientName`, `clientEmail`, `clientPhone`, `brief`, `notes`.

---

## 5. Status contract

DB / `statusKey`: `pending` | `confirmed` | `completed` | `cancelled` | `rescheduled` | `no_show`

FE aliases accepted on PATCH: `Accepted`→confirmed, `Rejected`/`Declined`→cancelled, `Completed`→completed, `rescheduled`, `no_show`.

Invalid → **400**:

```json
{ "error": "Invalid appointment status", "allowed": ["pending", "confirmed", "Accepted", "cancelled", "Rejected", "completed", "rescheduled", "no_show"] }
```

```
PATCH /lawyer/appointments/:id
{ "status": "Accepted", "responseNote": "See you then" }
{ "status": "rescheduled", "slot": "2026-08-12T11:30:00+05:00" }
```

---

## 6. Lawyer deliver → My Documents

```
POST /lawyer/appointments/:appointmentId/deliver
Authorization: Bearer <lawyer>
Content-Type: multipart/form-data
file=<docx|pdf>
title=Custom Khula Petition
notes=optional
```

```json
{
  "success": true,
  "appointmentId": "3",
  "status": "Completed",
  "document": {
    "orderNumber": "NL-CD-000003",
    "title": "Custom Khula Petition",
    "source": "custom_docs",
    "status": "completed"
  }
}
```

Then client:

```
GET /documents
GET /documents/NL-CD-000003/download
```

Appointment is marked **Completed** on deliver.

---

## 7. Order deliver (fixed stub)

```
POST /lawyer/orders/:orderId/deliver
```

Unknown / not assigned to this lawyer → **404**. No fake success.

---

## 8. Acceptance checklist

- [x] Custom draft brief + lawyer + slot → client + lawyer appointments with `source=custom_docs`
- [x] Unavailable slot → 409; availability reflects bookings
- [x] `mode=document` stored/returned (not coerced to online)
- [x] Slot calendar day matches listed `date`
- [x] Deliver upload → My Documents + download
- [x] Invalid status → 400 + allowed (no 500)
- [x] Fake order deliver → 404
