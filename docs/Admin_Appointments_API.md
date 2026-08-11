# NexusLexis — Admin Appointments API (Frontend)

**Document ID:** NL-FE-ADMIN-APPT-001  
**Version:** 1.0  
**Updated:** 11 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`  
**Local:** `http://localhost:3000/api/v2`

```env
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
```

Demo admin: `admin@nexuslexis.law` / `admin123`

---

## 0. Changelog (this drop)

### Added

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/appointments` | Admin lists **all** lawyer bookings (every client × lawyer) |
| PATCH | `/admin/appointments/:appointmentId` | Admin updates status / note / slot on **any** booking |

### Updated

None. Existing client/lawyer appointment routes are unchanged.

### Deleted

None. Do **not** use the lawyer inbox workaround (`GET /lawyer/appointments` + demo lawyer login) on the admin screen anymore.

---

## 1. Product flow

```
Client books  POST /appointments  (or POST /documents/custom-requests)
        │
        ▼
Row in appointments  (pending)
        │
        ├─ Lawyer inbox     GET/PATCH /lawyer/appointments/:id
        │
        └─ Admin panel      GET/PATCH /admin/appointments/:id
                 │
                 ├─ Accept     → status confirmed
                 ├─ Reject     → status cancelled
                 ├─ Complete   → status completed
                 └─ No-show    → status no_show
```

Admin sees **every** booking (not only one lawyer). Same status rules as lawyer PATCH.

---

## 2. Auth

```
Authorization: Bearer <accessToken>
X-Client-Role: Admin
```

| Token | How |
|-------|-----|
| Real JWT | `POST {VITE_AUTH_API_URL}/login` as admin → `accessToken`. `role` must be `admin`. |
| Local mock UI | `mock-jwt-token-…` **plus** header `X-Client-Role: Admin` (resolves `admin@nexuslexis.law`) |

Not admin → **403** `{ "error": "Admin access required" }`  
Missing token → **401**

---

## 3. GET `/admin/appointments`

```
GET /api/v2/admin/appointments
GET /api/v2/admin/appointments?status=pending
GET /api/v2/admin/appointments?source=custom_docs
GET /api/v2/admin/appointments?lawyerProfileId=1
```

**200**

```json
{
  "appointments": [
    {
      "id": "3",
      "clientName": "Demo Client",
      "clientEmail": "client@nexuslexis.law",
      "clientPhone": "03001234567",
      "lawyerName": "Demo Lawyer",
      "professionalName": "Demo Lawyer",
      "professionalProfileId": 1,
      "source": "custom_docs",
      "subject": "Custom draft: Khula Petition",
      "serviceArea": "Family Law",
      "notes": "Need Khula petition…",
      "brief": { "source": "custom_docs", "subject": "Custom draft: Khula Petition" },
      "date": "2026-08-11",
      "time": "10:00",
      "timeSlot": "10:00",
      "slot": "2026-08-11T10:00:00+05:00",
      "mode": "document",
      "modeLabel": "Document",
      "status": "Pending",
      "statusKey": "pending",
      "attachments": [],
      "deliveredDocument": null
    }
  ]
}
```

Admin table columns:

| UI column | Field |
|-----------|--------|
| ID | `id` |
| Client | `clientName` + `clientEmail` |
| Lawyer | `lawyerName` \|\| `professionalName` |
| Source | `source` |
| Subject / brief | `subject` \|\| `brief.subject` \|\| `notes` |
| When | `date` + `time` / `timeSlot` |
| Mode | `modeLabel` \|\| `mode` |
| Status | `status` (`statusKey` for logic) |

---

## 4. PATCH `/admin/appointments/:appointmentId`

```
PATCH /api/v2/admin/appointments/3
{ "status": "Accepted" }
```

| Button | Send `status` | Stored `statusKey` |
|--------|----------------|--------------------|
| Accept | `Accepted` | `confirmed` |
| Reject | `Rejected` | `cancelled` |
| Complete | `Completed` | `completed` |
| No-show | `no_show` | `no_show` |

Also accepted: `pending`, `confirmed`, `cancelled`, `rescheduled`, plus `slot` / `date` / `timeSlot` / `responseNote` (same as lawyer PATCH).

**200**

```json
{
  "success": true,
  "status": "Accepted",
  "statusKey": "confirmed",
  "appointment": { }
}
```

| Code | When |
|------|------|
| 400 | Invalid status → `{ "error": "Invalid appointment status", "allowed": [ … ] }` |
| 404 | Unknown id |
| 409 | Reschedule slot already taken |

---

## 5. Frontend wiring

```ts
const BASE = import.meta.env.VITE_API_BASE_URL;

headers: {
  Authorization: `Bearer ${token}`,
  'X-Client-Role': 'Admin',
  'Content-Type': 'application/json',
}

GET  `${BASE}/admin/appointments`
PATCH `${BASE}/admin/appointments/${id}`  { status }
```

Do **not** call `GET /lawyer/appointments` from the admin screen.

---

## 6. Checklist

- [ ] Admin token (or mock + `X-Client-Role: Admin`)
- [ ] List all bookings on Appointments tab
- [ ] Accept / Reject / Complete / No-show → PATCH then refresh
- [ ] 403 if a non-admin token is used
- [ ] `VITE_API_BASE_URL` = production Main API (above)
