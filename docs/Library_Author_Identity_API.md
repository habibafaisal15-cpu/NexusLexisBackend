# NexusLexis — Library Author Identity & Public Profile Fields

**Document ID:** NL-FE-LIB-AUTHOR-001  
**Version:** 1.0  
**Updated:** 15 August 2026  
**Audience:** Frontend team  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`  
**Backend CR:** NL-BE-LIB-AUTHOR-001

Names are labels. Identity is `lawyerProfileId`. Same-name lawyers (e.g. two “Matti Ullah”) must not collide.

---

## 0. Changelog

### Added / now returned

| Area | Fields |
|------|--------|
| `GET /lawyers/public` | `id`, `lawyerProfileId`, `email`, `image` / `photoUrl` / `profilePicture` |
| `GET /cas/public` | `id`, `caProfileId`, `email`, `image` / `photoUrl` / `profilePicture` |
| `GET /lawyer/profile` | `id`, `lawyerProfileId`, `email`, `photoUrl` / `avatarUrl` / `profilePicture` |
| Library templates | `lawyerProfileId`, `lawyerId`, `authorProfileId` on create/update/catalog/detail |
| `PATCH /admin/library/templates/:idOrSlug` | Reactivate / patch `isActive` |

### Updated

| Method | Path | Change |
|--------|------|--------|
| POST/PUT | `/admin/library/templates` | Persist `lawyerProfileId` (aliases: `lawyerId`, `authorProfileId`). Honour `isActive` / `active`. |
| GET | `/library/catalog`, `/admin/library/catalog`, `/library/templates/:slug` | Echo author id fields |
| POST | `/documents/custom-requests` | Requires `lawyerProfileId` — no name-only assign |
| POST | `/lawyer/profile/photo` | Saves photo to DB and returns URL |

### Unchanged

Client/lawyer appointment booking for normal consultations still accepts `lawyerName` when no id is sent. **Custom docs do not.**

---

## 1. Public lawyer directory

```
GET /api/v2/lawyers/public
```

```json
{
  "id": "13",
  "lawyerProfileId": "13",
  "name": "Matti Ullah",
  "email": "matti13@nexuslexis.law",
  "city": "Lahore",
  "practiceArea": "Family Law",
  "verificationStatus": "Verified",
  "image": "/uploads/… or fallback URL",
  "photoUrl": "…",
  "profilePicture": "…"
}
```

Use `id` / `lawyerProfileId` for selection and Custom Doc. Email may be null → show “Email not listed”.

Same shape for `GET /cas/public` with `caProfileId`.

---

## 2. Lawyer profile (dashboard)

```
GET /api/v2/lawyer/profile
```

Now includes `id`, `lawyerProfileId`, `email`, and picture fields.

```
POST /api/v2/lawyer/profile/photo
multipart field: photo
```

Returns `{ success, lawyerProfileId, photoUrl, avatarUrl, profilePicture }`.

---

## 3. Library template author identity

### Create / update (FormData or JSON)

Send any of:

- `lawyerProfileId` (canonical)
- `lawyerId`
- `authorProfileId`

Also keep `lawyer` / `author` as display labels (server overwrites name from the verified profile when id is valid).

**Validation:** id must be a **verified** public lawyer. Unknown → **400**. Author set without id → **400**.

### Catalog / detail response

```json
{
  "id": 1268,
  "slug": "patnership-deed",
  "name": "Patnership Deed",
  "lawyer": "Matti Ullah",
  "author": "Matti Ullah",
  "lawyerProfileId": "13",
  "lawyerId": "13",
  "authorProfileId": "13",
  "isActive": true
}
```

Drop the temporary `Matti Ullah · #13` credit string — id now round-trips.

---

## 4. Activate / deactivate

- **DELETE** `/admin/library/templates/:idOrSlug` → soft deactivate (`isActive: false`)
- **PUT** or **PATCH** with `{ "isActive": true }` (or `active: true`) → reactivate

Admin catalog includes inactive rows + `isActive`. Public catalog hides inactive.

---

## 5. Custom docs assignment

```
POST /api/v2/documents/custom-requests
{
  "lawyerProfileId": 13,
  "lawyerName": "Matti Ullah",
  "source": "custom_docs",
  "mode": "document"
}
```

Assign by **id only**. Missing/invalid id → **400**. Lawyer #13 inbox gets it; #5 does not.

---

## 6. Frontend checklist

- [ ] Find a Lawyer cards: show `id` + `email` + picture when present
- [ ] Library Publishing: keep sending `lawyerProfileId`; stop `#id` name workaround after verify
- [ ] Custom Doc: lock assignee from template `lawyerProfileId`
- [ ] Admin Activate uses PUT/PATCH `isActive: true`
- [ ] Never pick a lawyer by display name when two share the same name
