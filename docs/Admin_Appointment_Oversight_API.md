# NexusLexis — Admin Appointment Oversight API (Frontend)

**Document ID:** NL-FE-ADMIN-OVERSIGHT-001  
**Version:** 1.0  
**Updated:** 13 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
```

Demo admin: `admin@nexuslexis.law` / `admin123`

Extends **NL-FE-ADMIN-APPT-001** (thin list + PATCH). Same appointment rows as Client/Lawyer — no parallel booking system.

---

## 0. Changelog

### Added

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/appointments/stats` | Stat cards (total, pending, revenue, …) |
| GET | `/admin/appointments/:id` | Full detail: timeline + audit + payment + meeting |
| POST | `/admin/appointments/:id/reassign` | Assign another professional |
| GET | `/admin/assignable-professionals` | Candidates for Assign Lawyer modal |

### Updated

| Method | Path | Change |
|--------|------|--------|
| GET | `/admin/appointments` | Paginated oversight list; nested `payment`, `assignment`, `meeting`; filters |
| PATCH | `/admin/appointments/:id` | Unchanged aliases; response may include full oversight object |

### Unchanged

Client `POST/GET /appointments`, Lawyer `GET/PATCH /lawyer/appointments`, custom-docs deliver.

---

## 1. Auth

Every admin oversight call:

```
Authorization: Bearer <adminJWT>
X-Client-Role: Admin
```

Also accepts `X-Client-Role: RegistryStaff` with mock JWT. Non-admin → **403**.

---

## 2. GET `/admin/appointments` — paginated list

### Query parameters

| Param | Notes |
|-------|--------|
| `page` | Default `1` |
| `limit` | `10` \| `20` \| `50` (default `20`) |
| `search` | id, client name/email, professional name |
| `status` | `pending`, `confirmed`, `completed`, `cancelled`, `rescheduled`, `no_show`, `in_progress` |
| `paymentStatus` | `paid`, `pending`, `failed`, `refunded` |
| `professionalType` | `lawyer` (CA rows not in this table yet) |
| `mode` | `video`, `in_person`, `phone`, `document` (`online`→video, `audio`→phone) |
| `serviceArea` | e.g. `family`, `corporate` |
| `assignmentStatus` | `assigned`, `pending_assignment`, `reassignment_required` |
| `dateFrom` / `dateTo` | `YYYY-MM-DD` |
| `attentionOnly` | `true` → rows with attention flags |
| `source` | `consultation` \| `custom_docs` |
| `lawyerProfileId` | Filter by assigned professional |

### Response

```json
{
  "success": true,
  "appointments": [ /* oversight item — §4 */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  }
}
```

Reuse the same `pagination` object as Library / Documents (`CatalogPagination`).

List rows omit heavy `timeline` / `audit` — load detail for the drawer.

---

## 3. GET `/admin/appointments/stats`

```json
{
  "success": true,
  "stats": {
    "total": 137,
    "pending": 42,
    "confirmed": 31,
    "today": 5,
    "completed": 48,
    "cancelled": 11,
    "needsReassignment": 3,
    "revenue": 1250000
  }
}
```

- `today` — appointment date == today (Asia/Karachi)
- `needsReassignment` — `assignment.status === reassignment_required`
- `revenue` — sum of `fee` where `payment.status === paid` (PKR integer)

---

## 4. Oversight appointment object

```json
{
  "id": "14",
  "isCustomRequest": true,
  "source": "custom_docs",
  "client": { "id": "4", "name": "Demo Client", "email": "client@nexuslexis.law", "phone": "+92…" },
  "professional": { "id": "13", "name": "Matti Ullah", "type": "lawyer", "practiceArea": "Family Law" },
  "service": "Custom draft: Khula Petition",
  "serviceArea": "family",
  "requestDescription": "…",
  "requestDate": "2026-08-10T16:05:00+05:00",
  "date": "2026-08-16",
  "time": "10:00",
  "durationMinutes": 45,
  "mode": "video",
  "fee": 8500,
  "currency": "PKR",
  "status": "pending",
  "statusKey": "pending",
  "statusDisplay": "Pending",
  "responseNote": null,
  "payment": {
    "status": "paid",
    "transactionId": "TXN-…",
    "paymentDate": "2026-08-10T10:35:00+05:00",
    "refundStatus": "none",
    "remittanceStatus": "pending_payout"
  },
  "assignment": {
    "status": "assigned",
    "assignedAt": "2026-08-10T10:36:00+05:00",
    "reassignmentRequired": false,
    "reassignmentReason": null,
    "originalProfessional": null
  },
  "meeting": {
    "mode": "video",
    "status": "scheduled",
    "link": "https://…",
    "scheduledAt": "2026-08-16T10:00:00+05:00",
    "joinStatus": "not_started"
  },
  "acceptanceWindowHours": 24,
  "acceptanceDeadline": "2026-08-12T16:10:00+05:00",
  "acceptanceExpired": false,
  "attentionFlags": ["pending_confirmation"],
  "deliveredDocument": null,
  "timeline": [],
  "audit": []
}
```

**Flat aliases kept:** `clientName`, `clientEmail`, `professionalName`, `lawyerName`, `professionalProfileId`, `timeSlot`, `modeLabel`, `slot`, `subject`, `brief`.

---

## 5. GET `/admin/appointments/:id`

Full object including `timeline[]` and `audit[]` for the detail drawer. **404** if unknown.

---

## 6. PATCH `/admin/appointments/:id`

Same as NL-FE-ADMIN-APPT-001:

```json
{ "status": "Accepted", "responseNote": "Admin confirmed after review." }
```

Optional reschedule: `{ "status": "rescheduled", "date": "2026-08-20", "slot": "2026-08-20T10:00:00+05:00" }`

| UI / button | PATCH body | Stored `statusKey` |
|-------------|------------|-------------------|
| Accept / Confirm | `Accepted` | `confirmed` |
| Reject / Cancel | `Rejected` | `cancelled` |
| Complete | `Completed` | `completed` |
| No-show | `no_show` | `no_show` |
| Reschedule | `rescheduled` + slot/date | `rescheduled` |

Invalid status → **400** with `allowed[]`. Slot clash → **409**.

---

## 7. POST `/admin/appointments/:id/reassign`

Assign Lawyer modal:

```json
{
  "professionalProfileId": "11",
  "professionalType": "lawyer",
  "note": "Acceptance window expired — reassigned by admin"
}
```

**200** — full oversight appointment after mutation.

Side effects: new lawyer on row, `status` → `pending`, acceptance window restarts, old lawyer inbox drops it, new lawyer inbox shows it, client sees updated `professionalName`.

**400** missing/invalid/same professional · **409** slot clash · **404** unknown id.

---

## 8. GET `/admin/assignable-professionals`

Query: `professionalType`, `practiceArea`, `city`, `excludeProfileId`, `search`.

```json
{
  "success": true,
  "professionals": [
    {
      "id": "11",
      "name": "Barrister Farah Khan",
      "professionalType": "lawyer",
      "practiceArea": "Corporate & Commercial",
      "experienceYears": null,
      "availability": "Available today",
      "currentLoad": 3,
      "rating": null,
      "status": "available",
      "city": "Lahore"
    }
  ]
}
```

---

## 9. Frontend wiring checklist

- [ ] Replace `adminAppointmentsMock` with live `GET /admin/appointments`
- [ ] Stat cards → `GET /admin/appointments/stats`
- [ ] Drawer → `GET /admin/appointments/:id`
- [ ] Assign modal → `GET /admin/assignable-professionals` + `POST …/reassign`
- [ ] Status buttons → existing `PATCH /admin/appointments/:id`
- [ ] Pagination: same component as Library (`page`, `limit`, `totalItems`, `totalPages`, `hasNext`, `hasPrev`)
- [ ] Map `attentionFlags` for “Needs attention” filter/toggle
- [ ] Do **not** call lawyer inbox from Admin screen
