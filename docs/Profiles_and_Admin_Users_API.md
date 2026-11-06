# NexusLexis — Profiles & Admin Users API (implemented)

**Date:** 6 Nov 2026  
**Main API:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`  
**Auth API:** `https://nexus-lexis-backend-45v4.vercel.app/api/auth`

All routes need `Authorization: Bearer <accessToken>` unless noted. Admin routes also require an admin JWT (`role=admin`). Errors: `{ "error": "…" }`.

---

## A. Profile APIs (Client / Lawyer / CA)

### A1. GET client profile — **added**

`GET {MAIN}/client/profile`  
Also: `GET {AUTH}/account` is not used; Auth still has `GET {AUTH}/profile`.

**Headers:** Authorization  
**Body:** none

**Response 200**
```json
{
  "id": "12",
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 317 7171022",
  "cnic": "34241-1234578-9",
  "city": "Lahore",
  "language": "en",
  "avatarUrl": "/uploads/…",
  "memberSince": "2026-01-12T00:00:00.000Z",
  "status": "active"
}
```

### A2. PUT client profile — **updated**

`PUT {AUTH}/profile/client`

**Body**
```json
{
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 317 7171022",
  "cnic": "34241-1234578-9",
  "city": "Lahore",
  "language": "en",
  "address": "optional"
}
```

Now accepts `name`, `email`, `language` (`en`|`ur`) in addition to existing CNIC/city/phone.

### A3. POST client photo — **added**

`POST {MAIN}/client/profile/photo`  
Also: `POST {AUTH}/account/client/photo`

**Content-Type:** `multipart/form-data`  
**Field:** `file` (image)

**Response 200:** `{ "avatarUrl": "/uploads/…", "photoUrl": "/uploads/…" }`

### A4. GET lawyer profile — **updated**

`GET {MAIN}/lawyer/profile`

Now returns Settings shape: `chamberAddress`, `barRoll`, `experienceYears`, `enrolmentDate`, `courtLevel`, `practiceAreas[]`, `courts[]`, `bio`, `language`, `verificationStatus`, `tier`, `vault[]`, plus existing fee fields. Same object is also nested under `profile` for older clients.

### A5. PATCH lawyer profile — **updated**

`PATCH {MAIN}/lawyer/profile`

**Body**
```json
{
  "name": "Advocate Zainab Qazi",
  "email": "zainab.advocate@nexuslexis.law",
  "phone": "+92 300 9876543",
  "city": "Lahore",
  "chamberAddress": "Suite 402, High Court Bar Chambers, Lahore",
  "barRoll": "BC-LH-98421",
  "experienceYears": 12,
  "enrolmentDate": "2014-05-15",
  "courtLevel": "High Court Advocate",
  "practiceAreas": ["Corporate Law", "Civil Litigation"],
  "courts": ["High Court"],
  "bio": "…"
}
```

Changing bar credentials may set verification back to pending.

### A6. POST lawyer photo — **existing**

`POST {MAIN}/lawyer/profile/photo`  
`multipart` field `photo` → `{ "avatarUrl": "…" }`

### A7. GET CA profile — **updated**

`GET {MAIN}/ca/profile`

Adds `icapNumber`, `firmName`, `ntn`, `targetSegment`, `specializations[]`, `officeAddress`, `language`, `vault[]`.

### A8. PATCH CA profile — **updated**

`PATCH {MAIN}/ca/profile`

**Body**
```json
{
  "name": "Ayesha Rahman, FCA",
  "email": "ayesha@rahmanandco.pk",
  "phone": "+92 321 5550199",
  "city": "Karachi",
  "officeAddress": "14th Floor, Progressive Centre",
  "icapNumber": "R-45281",
  "firmName": "Rahman & Co.",
  "ntn": "3123456-7",
  "targetSegment": "SMEs & Corporate Retainers",
  "specializations": ["Corporate Taxation", "Auditing"],
  "bio": "…",
  "language": "en"
}
```

### A9. POST CA photo — **existing**

`POST {MAIN}/ca/profile/photo` field `photo`

### A10. Vault upload — **updated aliases**

`POST {AUTH}/profile/documents/upload`  
`multipart`: `file` + `docType`

`docType` now also accepts: `bar_license`, `cnic`, `icap`, `fbr_ntn` (plus existing `barCertificate`, `cnicFront`, `cnicBack`, `caCertificate`, `photo`, `profilePhoto`).

`GET {AUTH}/account/vault` → `{ "items": [ { "id", "docType", "label", "fileName", "fileUrl", "state" } ] }`

---

## B. Shared account security — **added**

Use **Main** `{MAIN}/account/…` or **Auth** `{AUTH}/account/…` (same behaviour).

### B1. Change password

`POST /account/password`

**Body**
```json
{ "currentPassword": "oldpass12", "newPassword": "newpass12" }
```

**Response:** `{ "ok": true }`  
**401** if current password is wrong. Google-only accounts (no password) return 400.

### B2. List sessions

`GET /account/sessions`  
Optional header `X-Refresh-Token` to mark `current: true`.

**Response**
```json
{
  "items": [
    {
      "id": "sess_1",
      "device": "Unknown device",
      "location": null,
      "ip": null,
      "lastActiveAt": "2026-11-06T18:00:00.000Z",
      "current": true
    }
  ]
}
```

### B3. Revoke one session

`DELETE /account/sessions/:sessionId`

### B4. Revoke all other sessions

`POST /account/sessions/revoke-others`  
Optional `X-Refresh-Token` or body `{ "refreshToken": "…" }` to keep the current session.

### B5. Language preference

`PATCH /account/preferences`

**Body:** `{ "language": "en" }` or `{ "language": "ur" }`

---

## C. Admin Users APIs — **added**

Base: `{MAIN}/admin/users`  
**Headers:** `Authorization: Bearer <admin token>`  
Admin role required.

### C1. Stats

`GET /admin/users/stats`

```json
{
  "total": 248,
  "pending": 12,
  "lawyers": 86,
  "cas": 34,
  "clients": 118,
  "suspended": 5,
  "multi": 14
}
```

### C2. List

`GET /admin/users`

**Query:** `q`, `tab` (`all|client|lawyer|ca|multi|pending|suspended`), `status` (`new|pending|active|suspended`), `city`, `page`, `pageSize`, `sort` (`newest|oldest|name|last_active`)

**Response:** `{ "items": [ { "id", "name", "email", "phone", "roles", "status", "city", "cnic", "barRoll", "icap", "joinedAt", "lastActiveAt", "avatarUrl" } ], "page", "pageSize", "total" }`

### C3. Detail

`GET /admin/users/:id`

Includes `profiles.lawyer|client|ca`, `vault[]`, `suspendReason`.

### C4. Create

`POST /admin/users`

**Body**
```json
{
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 300 1234567",
  "city": "Lahore",
  "cnic": "34241-1234578-9",
  "roles": ["client", "lawyer"],
  "barRoll": "BC-LH-11111",
  "icap": null,
  "address": "Chamber address",
  "sendInvite": true
}
```

**201** list-item shape. If `sendInvite` is false, response includes `temporaryPassword` once. **409** if email exists.

### C5. Update identity

`PATCH /admin/users/:id`

**Body:** `{ "name", "email", "phone", "city", "cnic", "barRoll", "icap", "firm", "address" }`

### C6. Roles

`PUT /admin/users/:id/roles`

**Body:** `{ "roles": ["client", "lawyer"] }` (≥ 1 role)

### C7. Approve

`POST /admin/users/:id/approve`

**Body:** `{ "approveVault": true, "notifyEmail": true, "roles": ["lawyer"] }`

### C8. Reject vault doc

`POST /admin/users/:id/vault/:docId/reject`

**Body:** `{ "reason": "Blurry CNIC — please re-upload" }`

### C9. Suspend

`POST /admin/users/:id/suspend`

**Body:** `{ "reason": "Client complaint under review", "note": "Internal", "signOutSessions": true }`

Blocks login (`auth_users.is_active = false`) and revokes refresh tokens when `signOutSessions` is true.

### C10. Reinstate

`POST /admin/users/:id/reinstate`

**Body:** `{ "note": "Complaint closed — restoring access" }`

### C11. Reset password

`POST /admin/users/:id/reset-password`

```json
{ "mode": "link" }
```
or
```json
{ "mode": "temporary", "forceChangeOnLogin": true }
```

`link` → `{ "ok": true }` (emails reset OTP if mail is configured).  
`temporary` → `{ "temporaryPassword": "…" }` once.

### C12. Email user

`POST /admin/users/:id/email`

**Body:** `{ "template": "custom", "subject": "…", "body": "…" }`

### C13. Sessions

`GET /admin/users/:id/sessions`  
`DELETE /admin/users/:id/sessions/:sessionId`  
`POST /admin/users/:id/sessions/revoke-others`

### C14. Drawer tabs

`GET /admin/users/:id/matters?page=1&pageSize=20`  
`GET /admin/users/:id/documents?page=1&pageSize=20`  
`GET /admin/users/:id/payments?page=1&pageSize=20`  
`GET /admin/users/:id/audit?page=1&pageSize=20`

### C15. Bulk

`POST /admin/users/bulk`

**Body**
```json
{
  "action": "approve",
  "userIds": ["12", "15"],
  "payload": { "reason": "Bulk suspension by Registry", "subject": "…", "body": "…" }
}
```

`action`: `approve` | `suspend` | `email`. Max 50 ids.  
**Response:** `{ "ok": true, "processed": 2, "failed": [] }`

---

## D. Apply (unchanged registration)

`POST {AUTH}/profile/lawyer/apply`  
`POST {AUTH}/profile/ca/apply`

---

## E. Frontend mapping

| UI | Method | Path |
|----|--------|------|
| Open Client profile | GET | `{MAIN}/client/profile` |
| Save Client | PUT | `{AUTH}/profile/client` |
| Client photo | POST | `{MAIN}/client/profile/photo` |
| Open/save Lawyer | GET/PATCH | `{MAIN}/lawyer/profile` |
| Open/save CA | GET/PATCH | `{MAIN}/ca/profile` |
| Change password | POST | `{MAIN}/account/password` or `{AUTH}/account/password` |
| Sessions | GET/DELETE/POST | `{MAIN}/account/sessions…` |
| Language | PATCH | `{MAIN}/account/preferences` |
| Admin Users screen | | `{MAIN}/admin/users…` |
