"""Full calculator API contract PDF v2.0 — headers, params, bodies, responses."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Knowledge_Bank_Calculator_API.pdf"
NAVY, GOLD = HexColor("#0B1F3A"), HexColor("#C9A227")
SLATE, MUTED = HexColor("#3A4658"), HexColor("#6B7380")
ROW_ALT, CODE_BG, LINE = HexColor("#F4F7FB"), HexColor("#0E243F"), HexColor("#D5DCE6")
PAGE_W, PAGE_H = A4
ML, MR, MT, MB = 14 * mm, 14 * mm, 18 * mm, 14 * mm


def fonts():
    for r, b in [
        (Path(r"C:\Windows\Fonts\calibri.ttf"), Path(r"C:\Windows\Fonts\calibrib.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]:
        if r.exists() and b.exists():
            pdfmetrics.registerFont(TTFont("Body", str(r)))
            pdfmetrics.registerFont(TTFont("Body-Bold", str(b)))
            return "Body", "Body-Bold"
    return "Helvetica", "Helvetica-Bold"


BODY, BOLD = fonts()


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=10.5, leading=13, textColor=NAVY, spaceBefore=7, spaceAfter=3))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=8.5, leading=11, textColor=HexColor("#16375F"), spaceBefore=4, spaceAfter=2))
    ss.add(ParagraphStyle("B", fontName=BODY, fontSize=7.5, leading=10, textColor=SLATE, spaceAfter=2))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=6.5, leading=8.5, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=6.5, leading=8.5, textColor=SLATE))
    return ss


S = styles()


class Code(Flowable):
    def __init__(self, text, fs=5.8):
        super().__init__()
        self.raw = text.strip("\n")
        self.fs = fs

    def wrap(self, aw, ah):
        self.width = aw
        style = ParagraphStyle("C", fontName="Courier", fontSize=self.fs, leading=self.fs + 2,
                               textColor=HexColor("#E4ECF6"))
        self._p, y = [], 0
        for line in self.raw.splitlines() or [""]:
            esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
            p = Paragraph(esc or "&nbsp;", style)
            _, h = p.wrap(aw - 10, ah)
            self._p.append((p, h))
            y += h
        self._h = y + 8
        self.height = self._h
        return aw, self._h

    def draw(self):
        self.canv.setFillColor(CODE_BG)
        self.canv.roundRect(0, 0, self.width, self._h, 3, fill=1, stroke=0)
        y = self._h - 5
        for p, h in self._p:
            y -= h
            p.drawOn(self.canv, 5, y)


def tbl(headers, rows, widths):
    data = [[Paragraph(h, S["Th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S["Td"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for i in range(1, len(data)):
        cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT if i % 2 == 0 else white))
    t.setStyle(TableStyle(cmds))
    return t


def cover(c, doc):
    c.saveState()
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, PAGE_H - 36 * mm, PAGE_W, 2, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(BOLD, 15)
    c.drawString(ML, PAGE_H - 52 * mm, "Knowledge Bank Calculators")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "Full API contract — headers · params · bodies · responses")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-KB-CALC-001  v2.0  ·  13 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "KB Calculators API Contract v2.0")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def ep(story, method, path, auth, notes=None, params=None, body=None, response=None, errors=None):
    u = PAGE_W - ML - MR
    story.append(Paragraph(f"<b>{method}</b>  {path}", S["H1"]))
    story.append(Paragraph(f"Auth: {auth}", S["B"]))
    if notes:
        story.append(Paragraph(notes, S["B"]))
    if params:
        story.append(Paragraph("Params", S["H2"]))
        story.append(tbl(["Name", "Type", "Req", "Description"], params, [28 * mm, 16 * mm, 10 * mm, u - 54 * mm]))
        story.append(Spacer(1, 2))
    if body:
        story.append(Paragraph("Request body", S["H2"]))
        story.append(Code(body))
        story.append(Spacer(1, 2))
    if response:
        story.append(Paragraph("Response 200", S["H2"]))
        story.append(Code(response))
        story.append(Spacer(1, 2))
    if errors:
        story.append(Paragraph(f"Errors: {errors}", S["B"]))
    story.append(Spacer(1, 4))


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Hard rule + headers", S["H1"]))
    story.append(Paragraph(
        "Snapshot replace only: PUT 11 items → store 11. No merge-by-id. Atomic validate-then-swap.",
        S["B"],
    ))
    story.append(tbl(["Header", "On", "Value"], [
        ["Authorization", "Admin", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["Content-Type", "PUT/PATCH", "application/json"],
        ["Content-Type", "POST resource", "multipart/form-data"],
    ], [32 * mm, 28 * mm, u - 60 * mm]))
    story.append(Code('Error: { "success": false, "error": "…", "message": "…", "fields": { … } }\n'
                      '400 / 401 / 403 / 404 / 413 / 415 / 422'))

    story.append(Paragraph("1. Seeded ids (8)", S["H1"]))
    story.append(tbl(["id", "Groups"], [
        ["court", "civil adValorem · criminal fixed · documents/family itemList"],
        ["wht", "purchase / sale whtBands"],
        ["stamp", "instruments / deeds / agri / other infoList"],
        ["tax", "salarySlabs slabList"],
        ["business", "businessSlabs slabList + surcharge fields"],
        ["inherit", "note"],
        ["limit", "causes limitList"],
        ["secp", "incorp incorpFee · services serviceList"],
    ], [22 * mm, u - 22 * mm]))
    story.append(PageBreak())

    ep(story, "GET", "/knowledge-bank/calculators", "Public — no auth",
       notes="Live tools only. Cache-Control: no-store.",
       response='''{
  "success": true,
  "data": {
    "schedules": [{
      "id": "court", "title": "Court fee", "status": "live",
      "hint": "…", "note": null, "resource": null,
      "groups": [{ "id": "civil", "kind": "adValorem",
        "fields": { "exemptUpto": 25000, "ratePercent": 7.5, "maxFee": 15000 },
        "items": [] }],
      "updatedAt": "…", "updatedBy": null
    }],
    "counts": { "live": 8, "draft": 0 }
  }
}''')

    ep(story, "GET", "/knowledge-bank/calculators/:id", "Public",
       params=[["id", "path", "Yes", "One of eight seeds"]],
       response='{ "success": true, "data": { /* one live schedule */ } }',
       errors="404 if missing or draft")

    ep(story, "GET", "/knowledge-bank/calculators/:id/resource.pdf", "Public",
       notes="Raw PDF. Content-Type: application/pdf.",
       errors="404 if no uploaded file")

    ep(story, "GET", "/admin/knowledge-bank/calculators",
       "Admin JWT + X-Client-Role: Admin",
       notes="All eight (live + draft).",
       response='''{ "success": true, "data": {
  "schedules": [ /* 8 */ ],
  "counts": { "live": 7, "draft": 1 }
} }''')

    ep(story, "GET", "/admin/knowledge-bank/calculators/:id", "Admin",
       response='{ "success": true, "data": { /* schedule incl. draft */ } }')
    story.append(PageBreak())

    ep(story, "PUT", "/admin/knowledge-bank/calculators/:id", "Admin",
       notes="Full snapshot. Must include ALL seeded groups. body.id must match URL.",
       params=[["id", "path", "Yes", "Calculator id"]],
       body='''{
  "id": "court",
  "title": "Court fee",
  "subtitle": "…",
  "status": "live",
  "hint": "…",
  "note": null,
  "resource": null,
  "groups": [
    { "id": "civil", "kind": "adValorem",
      "fields": { "exemptUpto": 25000, "ratePercent": 7.5, "maxFee": 15000 },
      "items": [] },
    { "id": "criminal", "kind": "fixed", "fields": { "fee": 0 }, "items": [] },
    { "id": "documents", "kind": "itemList", "itemFeeKey": "fee",
      "fields": {},
      "items": [{ "id": "civilVakalatnama", "label": "Civil Vakalatnama", "fee": 100 }] },
    { "id": "family", "kind": "itemList", "itemFeeKey": "fee",
      "fields": {}, "items": [] }
  ]
}''',
       response='''{ "success": true, "data": {
  "id": "court", "status": "live", "groups": […],
  "updatedAt": "…", "updatedBy": "1"
} }''',
       errors="404 · 422 validation / missing group / kind mismatch")

    ep(story, "PUT", "/admin/…/calculators/:id/groups/:groupId", "Admin",
       notes="Table Save — replace ONE group. 10→11 stores exactly 11.",
       params=[
           ["id", "path", "Yes", "e.g. limit"],
           ["groupId", "path", "Yes", "e.g. causes"],
       ],
       body='''{
  "title": "Articles & Limitation Periods",
  "kind": "limitList",
  "hint": null,
  "fields": {},
  "items": [ /* FULL list */ ]
}

// WHT: up=0 means open-ended
{ "id": "p100plus", "label": "Above 100M",
  "from": 100000000, "up": 0, "filer": 1.25, "non": 18.5 }

// Business surcharge on fields
{ "kind": "slabList",
  "fields": { "surchargeFrom": 10000000, "surchargePercent": 10 },
  "items": [{ "id": "by1", "label": "Nil", "from": 0, "up": 600000,
              "ratePercent": 0, "base": 0 }] }''',
       response='{ "success": true, "data": { /* FULL calculator after replace */ } }',
       errors="404 unknown group · 422 kind/item keys")
    story.append(PageBreak())

    ep(story, "PATCH", "/admin/knowledge-bank/calculators/:id", "Admin",
       notes="Chrome only. groups/items arrays ignored.",
       body='''{ "status": "draft",
  "hint": "Hold until rates notified.",
  "title": "Stamp duty",
  "subtitle": "…",
  "note": "…" }''',
       response='{ "success": true, "data": { /* schedule */ } }')

    ep(story, "POST", "/admin/…/calculators/:id/resource", "Admin",
       notes="Only tax | business. Max 10 MB PDF.",
       params=[["id", "path", "Yes", "tax or business"]],
       body='''Content-Type: multipart/form-data

file=<pdf bytes>          // required
heading=For further information
fileName=WithholdingTaxRatesCard2027.pdf''',
       response='''{ "success": true, "data": {
  "id": "tax",
  "resource": {
    "heading": "For further information",
    "fileName": "WithholdingTaxRatesCard2027.pdf",
    "url": "https://…/knowledge-bank/calculators/tax/resource.pdf"
  }
} }''',
       errors="400 missing file · 413 · 415 · 422 wrong id")

    ep(story, "DELETE", "/admin/…/calculators/:id/resource", "Admin — no body",
       notes='Clears PDF; resource.url becomes "". FE uses bundled card.',
       response='{ "success": true, "data": { "resource": { "url": "", … } } }')

    story.append(Paragraph("2. Kind → required shapes", S["H1"]))
    story.append(tbl(["kind", "fields", "items[]"], [
        ["adValorem", "exemptUpto, ratePercent, maxFee", "—"],
        ["fixed", "fee", "—"],
        ["itemList", "—", "id, label, fee"],
        ["whtBands", "—", "id, label, from, up, filer, non"],
        ["infoList", "—", "id, article, label, rate"],
        ["slabList", "optional surcharge*", "id, label, from, up, ratePercent, base"],
        ["limitList", "—", "id, category, art, label, period, years, months, days, startFrom"],
        ["incorpFee", "lotSize, first/extra Online/Offline", "—"],
        ["serviceList", "—", "id, label, govt"],
        ["note", "—", "—"],
    ], [24 * mm, 55 * mm, u - 79 * mm]))

    story.append(Paragraph("3. FE swap", S["H1"]))
    story.append(tbl(["localStorage", "API"], [
        ["load (admin)", "GET /admin/knowledge-bank/calculators"],
        ["load (public)", "GET /knowledge-bank/calculators"],
        ["Save tool", "PUT …/calculators/:id"],
        ["Save table", "PUT …/calculators/:id/groups/:groupId"],
        ["Toggle draft", "PATCH …/:id { status }"],
        ["PDF card", "resource.url from GET"],
    ], [40 * mm, u - 40 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis KB Calculator API Contract v2.0")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
