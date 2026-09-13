# NexusLexis — Knowledge Bank Calculators API Contract

**Document ID:** NL-FE-KB-CALC-001  
**Backend ticket:** NL-BE-KB-CALC-001  
**Version:** 1.0  
**Updated:** 13 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Replaces FE `localStorage` key `nl.kb.calculatorSchedules` with a server rate store.  
**Hard rule:** every write is a **snapshot replace**. PUT 11 rows → store exactly 11. No merge-by-id.

---

## 0. Headers

| Header | Routes | Value |
|--------|--------|-------|
| `Authorization` | Admin | `Bearer <admin JWT>` |
| `X-Client-Role` | Admin | `Admin` |
| `Content-Type` | JSON PUT/PATCH | `application/json` |
| `Content-Type` | PDF upload | `multipart/form-data` |

Public GET: no auth. `Cache-Control: no-store`.

**Error envelope**

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "items[3].up must be a number",
  "fields": { "items": "Snapshot rejected" }
}
```

| HTTP | When |
|------|------|
| 400 | Malformed body / missing file |
| 401 | Not authenticated (admin) |
| 403 | Not admin |
| 404 | Unknown calculator/group, or public GET of draft |
| 413 | PDF > 10 MB |
| 415 | Resource not `application/pdf` |
| 422 | Invalid kind / missing item keys / id mismatch / empty live title |

---

## 1. Catalogue (8 seeded tools — not creatable via API)

| id | Title | Groups |
|----|-------|--------|
| `court` | Court fee | `civil` adValorem · `criminal` fixed · `documents`/`family` itemList |
| `wht` | Property withholding | `purchase`/`sale` whtBands |
| `stamp` | Stamp duty | `instruments`/`deeds`/`agri`/`other` infoList |
| `tax` | Income tax (salary) | `salarySlabs` slabList |
| `business` | Business tax | `businessSlabs` slabList + surcharge fields |
| `inherit` | Inheritance | `note` (chrome only; engine on FE) |
| `limit` | Limitation | `causes` limitList |
| `secp` | SECP / FBR fees | `incorp` incorpFee · `services` serviceList |

Unknown `:id` → **404**. Do not invent a ninth calculator from PUT.

---

## 2. Endpoints

### Public

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/knowledge-bank/calculators` | All **live** schedules |
| GET | `/knowledge-bank/calculators/:id` | One live schedule (404 if draft/missing) |
| GET | `/knowledge-bank/calculators/:id/resource.pdf` | Uploaded further-info PDF |

### Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/knowledge-bank/calculators` | All eight (live + draft) |
| GET | `/admin/knowledge-bank/calculators/:id` | One tool including draft |
| PUT | `/admin/knowledge-bank/calculators/:id` | **Replace whole calculator snapshot** |
| PUT | `/admin/knowledge-bank/calculators/:id/groups/:groupId` | **Replace one group** (fields + items) |
| PATCH | `/admin/knowledge-bank/calculators/:id` | Chrome only: status/title/subtitle/hint/note |
| POST | `/admin/knowledge-bank/calculators/:id/resource` | Upload PDF (`tax` / `business`) |
| DELETE | `/admin/knowledge-bank/calculators/:id/resource` | Clear custom PDF |

---

## 3. Response envelopes

**List**

```json
{
  "success": true,
  "data": {
    "schedules": [ /* … */ ],
    "counts": { "live": 8, "draft": 0 }
  }
}
```

**One calculator**

```json
{ "success": true, "data": { /* schedule object */ } }
```

---

## 4. Schedule object (GET / PUT body)

```json
{
  "id": "limit",
  "title": "Limitation",
  "subtitle": "Filing deadlines under 1908 Act",
  "status": "live",
  "hint": "Quick reference…",
  "note": null,
  "resource": null,
  "groups": [
    {
      "id": "causes",
      "title": "Articles & Limitation Periods",
      "kind": "limitList",
      "hint": null,
      "fields": {},
      "items": [
        {
          "id": "art-2",
          "category": "TORT",
          "art": "Art. 2",
          "label": "For compensation for injury",
          "period": "1 year",
          "years": 1,
          "months": 0,
          "days": 0,
          "startFrom": "Date of injury"
        }
      ]
    }
  ],
  "updatedAt": "2026-09-12T10:00:00.000Z",
  "updatedBy": "1"
}
```

| Field | Rules |
|-------|-------|
| `id` | Must match URL `:id` |
| `status` | `live` \| `draft` — public hides draft |
| `groups` | Full array replace; order = display order |
| `groups[].kind` | Must match seed; change → 422 |
| `groups[].fields` | Object replace (not deep-merge) |
| `groups[].items` | Snapshot list — 10→11 stores 11 |

---

## 5. PUT whole calculator

`PUT /api/v2/admin/knowledge-bank/calculators/court`

Must include **all seeded groups** for that tool. Atomic validate-then-swap.

```json
{
  "id": "court",
  "title": "Court fee",
  "status": "live",
  "groups": [
    {
      "id": "civil",
      "kind": "adValorem",
      "fields": { "exemptUpto": 25000, "ratePercent": 7.5, "maxFee": 15000 },
      "items": []
    },
    { "id": "criminal", "kind": "fixed", "fields": { "fee": 0 }, "items": [] },
    {
      "id": "documents",
      "kind": "itemList",
      "itemFeeKey": "fee",
      "fields": {},
      "items": [{ "id": "civilVakalatnama", "label": "Civil Vakalatnama", "fee": 100 }]
    },
    { "id": "family", "kind": "itemList", "itemFeeKey": "fee", "fields": {}, "items": [] }
  ]
}
```

**Response `200`:** `{ "success": true, "data": { /* full schedule */ } }`

---

## 6. PUT one group (table save)

`PUT /api/v2/admin/knowledge-bank/calculators/limit/groups/causes`

```json
{
  "title": "Articles & Limitation Periods",
  "kind": "limitList",
  "hint": null,
  "fields": {},
  "items": [ /* FULL list — 11 objects replaces 10 */ ]
}
```

- `kind` must match seeded kind.
- `items: []` on a list kind stores an empty public table (allowed).
- Response = **full calculator** after replace.

---

## 7. PATCH chrome only

`PATCH /api/v2/admin/knowledge-bank/calculators/stamp`

```json
{
  "status": "draft",
  "hint": "Hold public card until rates are notified."
}
```

Allowed keys: `status`, `title`, `subtitle`, `hint`, `note`.  
Arrays/`groups`/`items` ignored — never replace tables via PATCH.

---

## 8. Resource PDF (tax & business)

**Upload**

```
POST /api/v2/admin/knowledge-bank/calculators/tax/resource
Content-Type: multipart/form-data

heading=For further information
fileName=WithholdingTaxRatesCard2027.pdf
file=<pdf bytes>
```

**Response includes**

```json
"resource": {
  "heading": "For further information",
  "fileName": "WithholdingTaxRatesCard2027.pdf",
  "url": "https://…/api/v2/knowledge-bank/calculators/tax/resource.pdf"
}
```

**DELETE** `/admin/knowledge-bank/calculators/:id/resource` → clears file; `url` becomes `""` so FE falls back to bundled card.

---

## 9. Group kinds → item shapes

| kind | fields | each item |
|------|--------|-----------|
| `adValorem` | exemptUpto, ratePercent, maxFee | — |
| `fixed` | fee | — |
| `itemList` | — | id, label, fee |
| `whtBands` | — | id, label, from, up, filer, non (`up=0` = no cap) |
| `infoList` | — | id, article, label, rate (text) |
| `slabList` | optional surchargeFrom, surchargePercent | id, label, from, up, ratePercent, base |
| `limitList` | — | id, category, art, label, period, years, months, days, startFrom, notes? |
| `incorpFee` | lotSize, firstOnline, firstOffline, extraOnline, extraOffline | — |
| `serviceList` | — | id, label, govt · optional `calc: "incorp"` |
| `note` | — | — |

---

## 10. FE swap

| Current (localStorage) | API |
|------------------------|-----|
| `loadCalculatorSchedules()` admin | `GET /admin/knowledge-bank/calculators` |
| `loadCalculatorSchedules()` public | `GET /knowledge-bank/calculators` |
| `persistCalculatorSchedules` / Save | `PUT …/calculators/:id` or `PUT …/groups/:groupId` |
| add/remove row then Save | same PUT — body.items is the new full list |
| `resolveSalaryTaxPdf` | use `resource.url` when https / absolute |

If public GET fails, FE may fall back to `DEFAULT_CALCULATOR_SCHEDULES`.

**Not in MVP:** server-side fee computation, optimistic lock (P2), `POST …/:id/reset`.

---

## 11. Delivery status

| Priority | Item | Status |
|----------|------|--------|
| P0 | Seed eight calculators | **Shipped** |
| P0 | Public + admin GET list/detail | **Shipped** |
| P0 | PUT full snapshot replace | **Shipped** |
| P0 | PUT group snapshot replace | **Shipped** |
| P1 | PATCH status/chrome | **Shipped** |
| P1 | POST/DELETE resource PDF | **Shipped** |
| P2 | Optimistic lock + audit | Deferred |

---

*NL-FE-KB-CALC-001 · Full request/response contract for frontend*
