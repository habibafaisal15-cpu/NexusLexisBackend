# NexusLexis — Knowledge Bank Calculators (Full API Contract)

**Document ID:** NL-FE-KB-CALC-001  
**Backend ticket:** NL-BE-KB-CALC-001  
**Version:** 2.0  
**Updated:** 13 September 2026  
**Base:** `https://nexus-lexis-backend-ql8w.vercel.app/api/v2`

Replaces FE `localStorage` (`nl.kb.calculatorSchedules`).  
**Hard rule:** every write is a **snapshot replace**. PUT 11 rows → store exactly 11. No merge-by-id.

---

## 0. Common headers & errors

### Headers

| Header | Required on | Value |
|--------|-------------|-------|
| `Authorization` | All `/admin/…` | `Bearer <admin JWT>` |
| `X-Client-Role` | All `/admin/…` | `Admin` |
| `Content-Type` | PUT / PATCH JSON | `application/json` |
| `Content-Type` | POST resource | `multipart/form-data` |

Public GET: **no auth**. Response header: `Cache-Control: no-store`.

### Error envelope

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
| 400 | Malformed JSON / missing file |
| 401 | Missing/invalid JWT (admin) |
| 403 | Authenticated but not admin |
| 404 | Unknown `:id` / `:groupId`, or public GET of draft |
| 413 | PDF > 10 MB |
| 415 | Resource not `application/pdf` |
| 422 | Invalid kind, missing item keys, id mismatch, empty live title |

---

## 1. Seeded catalogue (8 tools — not creatable)

| `:id` | Title | Groups (`groupId` → kind) |
|-------|-------|---------------------------|
| `court` | Court fee | `civil`→adValorem · `criminal`→fixed · `documents`→itemList · `family`→itemList |
| `wht` | Property withholding | `purchase`→whtBands · `sale`→whtBands |
| `stamp` | Stamp duty | `instruments`/`deeds`/`agri`/`other`→infoList |
| `tax` | Income tax (salary) | `salarySlabs`→slabList |
| `business` | Business tax | `businessSlabs`→slabList |
| `inherit` | Inheritance | `note`→note |
| `limit` | Limitation | `causes`→limitList |
| `secp` | SECP / FBR fees | `incorp`→incorpFee · `services`→serviceList |

Unknown `:id` → **404**. Do not invent a ninth calculator.

---

## 2. GET `/knowledge-bank/calculators` (public)

**Auth:** none  
**Query params:** none

**Response `200`**

```json
{
  "success": true,
  "data": {
    "schedules": [
      {
        "id": "court",
        "title": "Court fee",
        "subtitle": "Civil, criminal & document court fees",
        "status": "live",
        "hint": "Ad-valorem civil fees apply above the exemption threshold.",
        "note": null,
        "resource": null,
        "groups": [
          {
            "id": "civil",
            "title": "Civil (ad-valorem)",
            "kind": "adValorem",
            "hint": null,
            "fields": { "exemptUpto": 25000, "ratePercent": 7.5, "maxFee": 15000 },
            "items": []
          }
        ],
        "updatedAt": "2026-09-13T12:00:00.000Z",
        "updatedBy": null
      }
    ],
    "counts": { "live": 8, "draft": 0 }
  }
}
```

Only `status: "live"` tools. Drafts omitted.

---

## 3. GET `/knowledge-bank/calculators/:id` (public)

**Auth:** none

**Path params**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | One of the eight seeds |

**Response `200`:** `{ "success": true, "data": { /* one schedule */ } }`  
**Errors:** `404` if unknown id or tool is `draft`

---

## 4. GET `/knowledge-bank/calculators/:id/resource.pdf` (public)

**Auth:** none  
**Path:** `id` = `tax` or `business` (with uploaded PDF)

**Response `200`:** raw PDF bytes  
**Headers:** `Content-Type: application/pdf`, `Content-Disposition: inline; filename="…"`  
**Errors:** `404` if no uploaded file

---

## 5. GET `/admin/knowledge-bank/calculators`

**Auth:** Admin JWT + `X-Client-Role: Admin`  
**Query params:** none

**Response `200`** — same envelope as public list, but includes **draft + live** (all 8).

```json
{
  "success": true,
  "data": {
    "schedules": [ /* 8 tools */ ],
    "counts": { "live": 7, "draft": 1 }
  }
}
```

---

## 6. GET `/admin/knowledge-bank/calculators/:id`

**Auth:** Admin  
**Path:** `id` — calculator id (includes draft)

**Response `200`:** `{ "success": true, "data": { /* full schedule */ } }`  
**Errors:** `404`

---

## 7. PUT `/admin/knowledge-bank/calculators/:id`

Replace the **entire** calculator snapshot. Must include **all seeded groups**.

**Auth:** Admin  
**Headers:** `Content-Type: application/json`

**Path params:** `id` — must match `body.id`

**Request body**

```json
{
  "id": "court",
  "title": "Court fee",
  "subtitle": "Civil, criminal & document court fees",
  "status": "live",
  "hint": "Ad-valorem civil fees apply above the exemption threshold.",
  "note": null,
  "resource": null,
  "groups": [
    {
      "id": "civil",
      "title": "Civil (ad-valorem)",
      "kind": "adValorem",
      "hint": null,
      "fields": { "exemptUpto": 25000, "ratePercent": 7.5, "maxFee": 15000 },
      "items": []
    },
    {
      "id": "criminal",
      "title": "Criminal (fixed)",
      "kind": "fixed",
      "fields": { "fee": 0 },
      "items": []
    },
    {
      "id": "documents",
      "title": "Documents",
      "kind": "itemList",
      "itemFeeKey": "fee",
      "fields": {},
      "items": [
        { "id": "civilVakalatnama", "label": "Civil Vakalatnama", "fee": 100 }
      ]
    },
    {
      "id": "family",
      "title": "Family",
      "kind": "itemList",
      "itemFeeKey": "fee",
      "fields": {},
      "items": []
    }
  ]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | string | Yes | Must equal URL `:id` |
| `title` | string | Yes if `live` | Empty live title → 422 |
| `subtitle` | string\|null | No | |
| `status` | `live`\|`draft` | Yes | |
| `hint` | string\|null | No | |
| `note` | string\|null | No | Stamp warning; others usually null |
| `resource` | object\|null | No | `{ heading, fileName, url }` chrome only; file via POST resource |
| `groups` | array | Yes | Full snapshot; all seeded group ids required |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "court",
    "title": "Court fee",
    "status": "live",
    "groups": [ /* stored snapshot */ ],
    "updatedAt": "2026-09-13T12:05:00.000Z",
    "updatedBy": "1"
  }
}
```

**Errors:** `404` unknown id · `422` validation · missing group · kind mismatch

---

## 8. PUT `/admin/knowledge-bank/calculators/:id/groups/:groupId`

Replace **one group** only (typical table Save). Rest of calculator untouched.

**Auth:** Admin  
**Headers:** `Content-Type: application/json`

**Path params**

| Name | Example |
|------|---------|
| `id` | `limit` |
| `groupId` | `causes` |

**Request body**

```json
{
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
      "startFrom": "Date of injury",
      "notes": ""
    }
  ]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `kind` | string | Yes | Must match seeded kind for this group |
| `title` | string | No | |
| `hint` | string\|null | No | |
| `fields` | object | Depends on kind | Replace object — no deep-merge |
| `items` | array | List kinds | **Full list**. 10→11 stores 11. `[]` allowed (empty public table) |

**WHT band example** (`up: 0` = open-ended):

```json
{ "id": "p100plus", "label": "Above 100M", "from": 100000000, "up": 0, "filer": 1.25, "non": 18.5 }
```

**Business surcharge** lives on group `fields`, not each row:

```json
{
  "id": "businessSlabs",
  "kind": "slabList",
  "fields": { "surchargeFrom": 10000000, "surchargePercent": 10 },
  "items": [
    { "id": "by1", "label": "Nil band", "from": 0, "up": 600000, "ratePercent": 0, "base": 0 }
  ]
}
```

**Response `200`:** full calculator after replace — `{ "success": true, "data": { /* schedule */ } }`  
**Errors:** `404` unknown calculator/group · `422` kind/item validation

---

## 9. PATCH `/admin/knowledge-bank/calculators/:id`

Chrome only. Arrays / `groups` / `items` **ignored**.

**Auth:** Admin  
**Headers:** `Content-Type: application/json`

**Request body** (any subset)

```json
{
  "status": "draft",
  "title": "Stamp duty",
  "subtitle": "…",
  "hint": "Hold public card until Punjab notifies 2026-27 rates.",
  "note": "Confirm e-stamp before relying on these rates."
}
```

| Field | Type | Allowed |
|-------|------|---------|
| `status` | string | `live` \| `draft` |
| `title` | string | Required non-empty if setting `live` |
| `subtitle` | string\|null | |
| `hint` | string\|null | |
| `note` | string\|null | |

**Response `200`:** `{ "success": true, "data": { /* schedule */ } }`

---

## 10. POST `/admin/knowledge-bank/calculators/:id/resource`

Upload further-information PDF. Only **`tax`** and **`business`**.

**Auth:** Admin  
**Headers:** `Content-Type: multipart/form-data`

**Path:** `id` = `tax` \| `business`

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | **Yes** | PDF bytes, max 10 MB |
| `heading` | string | No | Default `For further information` |
| `fileName` | string | No | Display name |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "tax",
    "resource": {
      "heading": "For further information",
      "fileName": "WithholdingTaxRatesCard2027.pdf",
      "url": "https://nexus-lexis-backend-ql8w.vercel.app/api/v2/knowledge-bank/calculators/tax/resource.pdf"
    },
    "updatedAt": "…",
    "updatedBy": "1"
  }
}
```

**Errors:** `400` missing file · `413` too large · `415` not PDF · `422` wrong calculator id

---

## 11. DELETE `/admin/knowledge-bank/calculators/:id/resource`

**Auth:** Admin · no body

Clears stored PDF. `resource.url` becomes `""` so FE falls back to bundled card.

**Response `200`:** `{ "success": true, "data": { /* schedule with resource.url "" */ } }`

---

## 12. Schedule object field reference

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | One of eight seeds |
| `title` | string | Admin + public chrome |
| `subtitle` | string\|null | |
| `status` | `live`\|`draft` | Public hides draft |
| `hint` | string\|null | |
| `note` | string\|null | |
| `resource` | object\|null | `{ heading, fileName, url }` |
| `groups` | array | Display order = array order |
| `groups[].id` | string | Stable per tool |
| `groups[].kind` | enum | Seeded; change → 422 |
| `groups[].fields` | object | Snapshot replace |
| `groups[].items` | array | Snapshot replace |
| `groups[].itemFeeKey` | string | Optional; court itemList uses `"fee"` |
| `updatedAt` | ISO string | Set on every successful write |
| `updatedBy` | string\|null | Admin user id |

---

## 13. Group kinds → required shapes

| kind | `fields` required | each `items[]` required |
|------|-------------------|-------------------------|
| `adValorem` | `exemptUpto`, `ratePercent`, `maxFee` | — (no items) |
| `fixed` | `fee` | — |
| `percent` | `ratePercent` | — |
| `filerRates` | `filer`, `non` | — |
| `note` | — | — |
| `itemList` | — | `id`, `label`, `fee` |
| `whtBands` | — | `id`, `label`, `from`, `up`, `filer`, `non` |
| `infoList` | — | `id`, `article`, `label`, `rate` (text) |
| `slabList` | optional `surchargeFrom`, `surchargePercent` | `id`, `label`, `from`, `up`, `ratePercent`, `base` |
| `limitList` | — | `id`, `category`, `art`, `label`, `period`, `years`, `months`, `days`, `startFrom` (+ optional `notes`) |
| `incorpFee` | `lotSize`, `firstOnline`, `firstOffline`, `extraOnline`, `extraOffline` | — |
| `serviceList` | — | `id`, `label`, `govt` (+ optional `calc: "incorp"`) |

Extra keys on items may be stored. Missing required keys → **422**.

---

## 14. FE swap

| Current (localStorage) | API |
|------------------------|-----|
| `loadCalculatorSchedules()` admin | `GET /admin/knowledge-bank/calculators` |
| `loadCalculatorSchedules()` public | `GET /knowledge-bank/calculators` |
| Save active tool | `PUT /admin/…/calculators/:id` |
| Save one table | `PUT /admin/…/calculators/:id/groups/:groupId` |
| Toggle draft | `PATCH …/:id` `{ "status": "draft" }` |
| PDF card | `resource.url` from GET when non-empty |

If public GET fails, FE may fall back to `DEFAULT_CALCULATOR_SCHEDULES`.

**Not in MVP:** server-side fee math, optimistic lock, `POST …/:id/reset`.

---

*NL-FE-KB-CALC-001 v2.0 — Full request/response contract for frontend*
