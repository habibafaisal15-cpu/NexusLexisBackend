# NexusLexis — Knowledge Bank Delete / Retire API

**Document ID:** NL-FE-KB-DELETE-001  
**Backend ticket:** NL-BE-KB-DELETE-001  
**Source brief:** `NL_Knowledge_Bank_Delete_API_Guidance.pdf`  
**Version:** 1.0  
**Updated:** 22 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Adds **hard DELETE** for Articles / Summaries / Judgements entries. Retire + file-delete stay as-is. Documents all KB delete surfaces for FE trash pattern.

---

## 0. Retire vs Delete

| Action | Meaning | Public KB | Admin list |
|--------|---------|-----------|------------|
| **Retire** | Soft take-down; keep row + PDF | Hidden | Visible under Retired |
| **Hard delete** | Permanent remove entry + PDF | Gone | Gone |
| **Delete file only** | Strip PDF; keep metadata | May force draft | Entry remains |

---

## 1. Headers

| Header | On | Value |
|--------|----|-------|
| `Authorization` | All admin deletes | `Bearer <admin JWT>` |
| `X-Client-Role` | All admin deletes | `Admin` |
| `Content-Type` | Retire PATCH only | `application/json` |

```json
{ "success": false, "error": "Entry not found", "message": "Entry not found" }
```

| HTTP | When |
|------|------|
| 401 | Missing/invalid JWT |
| 403 | Not Admin |
| 404 | Entry already gone / unknown id |

---

## 2. NEW — Hard delete entry

### DELETE `/admin/knowledge-bank/entries/:id`

**Auth:** Admin JWT + `X-Client-Role: Admin`

**Query**

| Name | Default | Description |
|------|---------|-------------|
| `hard` | `true` | `true` = permanent wipe (row + PDF). `false` = soft retire only |

**Examples**

```
DELETE /api/v2/admin/knowledge-bank/entries/12
DELETE /api/v2/admin/knowledge-bank/entries/12?hard=true
DELETE /api/v2/admin/knowledge-bank/entries/12?hard=false   → retire
```

**Response `200` (hard)**

```json
{
  "success": true,
  "data": {
    "id": "12",
    "deleted": true,
    "hardDeleted": true
  }
}
```

**Response `200` (hard=false / retire)** — full entry with `"status": "retired"`

**Errors:** `401` · `403` · `404`

**Side effects (hard)**
- Deletes `knowledge_reads` row (any pillar)
- Removes stored PDF blob with the row
- Immediately gone from public articles/summaries/judgements
- Admin KPI `counts` shrink on next list

Pillar-agnostic: same route for articles, summaries, judgements (by id).

---

## 3. Existing — Retire (unchanged)

### PATCH `/admin/knowledge-bank/entries/:id/status`

**Headers:** `Authorization`, `X-Client-Role: Admin`, `Content-Type: application/json`

```json
{ "status": "retired" }
```

Also accepts `draft` | `published` for restore.  
Retired never appear on public landing lists.

---

## 4. Existing — Delete entry file only (unchanged)

### DELETE `/admin/knowledge-bank/entries/:id/file`

Clears PDF → `hasFile: false`, `file: null`, forces `status: draft`. Entry row remains.

---

## 5. Already shipped deletes (parity)

| Resource | Method / Path |
|----------|----------------|
| Library template hard | `DELETE /admin/library/templates/:idOrSlug?hard=true` |
| Library template soft | `DELETE /admin/library/templates/:idOrSlug` |
| Library draft | `DELETE /admin/library/drafts/:id` |
| Law book hard | `DELETE /admin/knowledge-bank/books/:idOrSlug?hard=true` |
| Law book soft retire | `DELETE /admin/knowledge-bank/books/:idOrSlug` (no hard → retired) **or** `PATCH …/status` |
| Law book file | `DELETE /admin/knowledge-bank/books/:idOrSlug/file` |
| **KB entry hard (NEW)** | `DELETE /admin/knowledge-bank/entries/:id` |
| KB entry file | `DELETE /admin/knowledge-bank/entries/:id/file` |

---

## 6. FE swap

| UI | API |
|----|-----|
| Archive / Retire | `PATCH …/entries/:id/status { "status": "retired" }` |
| Trash (confirm) | `DELETE …/entries/:id` or `?hard=true` |
| Remove PDF only | `DELETE …/entries/:id/file` |
| On success | Reload list + KPI counts |

---

## 7. Acceptance

- [x] Published article + PDF → hard DELETE → public slug gone  
- [x] Retire still independent  
- [x] Missing id → 404  
- [x] No Admin JWT → 401  
- [x] Same route for summaries + judgements  
- [x] Admin counts update after delete  

---

*NL-FE-KB-DELETE-001 · Delete / Retire contract for Frontend*
