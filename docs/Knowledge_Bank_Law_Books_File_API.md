# NexusLexis — Law Books Volume File API

**Document ID:** NL-FE-KB-BOOKS-FILE-001  
**Backend ticket:** NL-BE-KB-BOOKS-FILE-001  
**Source brief:** `NL_Knowledge_Bank_Law_Books_File_API_Guidance.pdf`  
**Version:** 1.1  
**Updated:** 22 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Delta on top of Law Books CRUD (`NL-BE-KB-DYN-001`). Adds **PDF / DOCX volume file** upload, replace, delete, and public stream.

---

## Status (confirmed live)

**Yes — Law Books volumes are added as PDF *or* DOCX.** Both types are accepted on create/update and on dedicated file upload. One volume file per book. Other types → `400`.

| Type | Extension | MIME stored |
|------|-----------|-------------|
| PDF | `.pdf` | `application/pdf` |
| DOCX | `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

Max **25 MB**. Form field name: **`file`**.

---

## 0. What changed

| Item | Before | After |
|------|--------|-------|
| Create/update book | JSON only | **multipart** metadata + optional `file` |
| Publish rule | title + description | title + description + **hasFile** |
| Dedicated file routes | Missing | POST / DELETE / GET admin + GET public |
| Allowed types | — | **PDF or DOCX**, **max 25 MB** (both live) |
| Delete file | — | Clears file and forces `status=draft` |

---

## 1. Headers

| Header | On | Value |
|--------|----|-------|
| `Authorization` | All `/admin/…` | `Bearer <admin JWT>` |
| `X-Client-Role` | All `/admin/…` | `Admin` |
| `Content-Type` | PATCH status only | `application/json` |
| `Content-Type` | Create / update / file | `multipart/form-data` |

Public `GET …/file`: **no auth**.

```json
{ "success": false, "error": "…", "message": "…", "fields": { "file": "required" } }
```

| HTTP | When |
|------|------|
| 400 | Missing/oversized/wrong type file; publish without file |
| 401 / 403 | Admin auth |
| 404 | Unknown book / public file for draft / no file |
| 409 | Slug locked / taken |

---

## 2. Allowed file rules

| Rule | Value |
|------|-------|
| Accepted | **PDF and DOCX only** (either one) |
| MIME / extension | `application/pdf` (`.pdf`) **or** `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`) |
| Max size | **25 MB** (26214400 bytes) |
| Form field name | **`file`** |
| Optional | `fileName` string |
| Reject | Any other type / oversize → `400` (`fields.file: invalid_type` / `too_large`) |

Detection uses MIME, extension, and magic bytes (`%PDF` / ZIP+`.docx`).

---

## 3. Create / update with optional file

### POST `/admin/knowledge-bank/books`

**Auth:** Admin  
**Body:** `multipart/form-data`

```
slug=pakistan-penal-code-annotated
status=published
kind=annotated
subject=criminal
title=Pakistan Penal Code - annotated
description=Bare text with section notes...
spineBand=VOL. I
spineCode=PPC
edition=2026 ed.
year=2026
pages=1240
languages=["EN","UR"]
spineTone=seal
author=Nexus Lexis Panel
contents=[{"title":"Preliminary","page":1}]
sampleChapter={"title":"Sample","body":"..."}
file=<pdf|docx>
fileName=ppc-2026.pdf
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "3",
    "slug": "pakistan-penal-code-annotated",
    "status": "published",
    "title": "Pakistan Penal Code - annotated",
    "hasFile": true,
    "file": {
      "url": "https://nexus-lexis-backend-ql8w.vercel.app/api/v2/knowledge-bank/books/pakistan-penal-code-annotated/file?v=…",
      "fileName": "ppc-2026.pdf",
      "mime": "application/pdf",
      "sizeBytes": 4821930
    }
  }
}
```

**Publish without file → `400`** `{ fields: { file: "required" } }`  
Draft may omit file.

### PUT / PATCH `/admin/knowledge-bank/books/:idOrSlug`

Same multipart fields. Omit `file` to leave existing volume unchanged.  
Slug rewrite blocked after publish (`409`).

JSON-only PATCH status still works:

### PATCH `/admin/knowledge-bank/books/:idOrSlug/status`

```json
{ "status": "published" }
```

Requires existing volume file or **400**.

---

## 4. Dedicated file routes

### POST `/admin/knowledge-bank/books/:idOrSlug/file`

**Auth:** Admin  
**Body:** multipart — `file` required, `fileName` optional

**Response `200`:** full book with updated `file` / `hasFile: true`

### DELETE `/admin/knowledge-bank/books/:idOrSlug/file`

**Auth:** Admin  
Clears volume and forces **`status=draft`**.

**Response `200`:** `{ "success": true, "data": { "hasFile": false, "file": null, "status": "draft", … } }`

### GET `/admin/knowledge-bank/books/:idOrSlug/file`

**Auth:** Admin  
Streams binary (drafts ok). `?download=1` → attachment.

### GET `/knowledge-bank/books/:idOrSlug/file`

**Auth:** none  
**Published + has file only**; else **404**.  
`?download=1` → attachment; else `inline`.  
CORS `*` for browser preview.

---

## 5. Entity fields (delta)

| Field | Type | Notes |
|-------|------|-------|
| `hasFile` | boolean | true when volume stored |
| `file.url` | string | Absolute public URL (+ `?v=` cache-buster) |
| `file.fileName` | string | Original name |
| `file.mime` | string | `application/pdf` or DOCX mime |
| `file.sizeBytes` | number | Stored size |

Sample chapter text remains optional teaser — **uploaded file is the full volume**.

---

## 6. Master endpoints (Law Books + file)

| Method | Path | Auth |
|--------|------|------|
| GET | `/knowledge-bank/books` | Public |
| GET | `/knowledge-bank/books/:idOrSlug` | Public |
| GET | `/knowledge-bank/books/:idOrSlug/file` | Public |
| GET | `/admin/knowledge-bank/books` | Admin |
| GET | `/admin/knowledge-bank/books/:idOrSlug` | Admin |
| POST | `/admin/knowledge-bank/books` | Admin multipart |
| PUT/PATCH | `/admin/knowledge-bank/books/:idOrSlug` | Admin multipart |
| PATCH | `/admin/knowledge-bank/books/:idOrSlug/status` | Admin JSON |
| POST | `/admin/knowledge-bank/books/:idOrSlug/file` | Admin multipart |
| DELETE | `/admin/knowledge-bank/books/:idOrSlug/file` | Admin |
| GET | `/admin/knowledge-bank/books/:idOrSlug/file` | Admin |
| DELETE | `/admin/knowledge-bank/books/:idOrSlug` | Admin |

---

## 7. Acceptance

- [x] POST book + file → `hasFile`; public Open/Download works  
- [x] Publish without file rejected (`400`)  
- [x] Replace via `POST …/file`  
- [x] DELETE file → draft; publish blocked until re-upload  
- [x] PDF **and** DOCX within 25 MB (both accepted)  

---

*NL-FE-KB-BOOKS-FILE-001 v1.1 · Volume file contract for Frontend — PDF or DOCX*
