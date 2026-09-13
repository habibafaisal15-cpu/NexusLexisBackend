"""Knowledge Bank Calculators API contract PDF — NL-FE-KB-CALC-001."""
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

NAVY = HexColor("#0B1F3A")
GOLD = HexColor("#C9A227")
SLATE = HexColor("#3A4658")
MUTED = HexColor("#6B7380")
ROW_ALT = HexColor("#F4F7FB")
CODE_BG = HexColor("#0E243F")
LINE = HexColor("#D5DCE6")
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
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=11, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=4))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=9, leading=12, textColor=HexColor("#16375F"), spaceBefore=5, spaceAfter=3))
    ss.add(ParagraphStyle("B", fontName=BODY, fontSize=8, leading=11, textColor=SLATE, spaceAfter=3))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=7, leading=9, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=7, leading=9.5, textColor=SLATE))
    return ss


S = styles()


class Code(Flowable):
    def __init__(self, text, fs=6.2):
        super().__init__()
        self.raw = text.strip("\n")
        self.fs = fs

    def wrap(self, aw, ah):
        self.width = aw
        style = ParagraphStyle("C", fontName="Courier", fontSize=self.fs, leading=self.fs + 2.2,
                               textColor=HexColor("#E4ECF6"))
        self._p = []
        y = 0
        for line in self.raw.splitlines() or [""]:
            esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
            p = Paragraph(esc or "&nbsp;", style)
            _, h = p.wrap(aw - 12, ah)
            self._p.append((p, h))
            y += h
        self._h = y + 10
        self.height = self._h
        return aw, self._h

    def draw(self):
        self.canv.setFillColor(CODE_BG)
        self.canv.roundRect(0, 0, self.width, self._h, 3, fill=1, stroke=0)
        y = self._h - 6
        for p, h in self._p:
            y -= h
            p.drawOn(self.canv, 6, y)


def tbl(headers, rows, widths):
    data = [[Paragraph(h, S["Th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S["Td"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
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
    c.drawString(ML, PAGE_H - 55 * mm, "Knowledge Bank Calculators")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 64 * mm, "Dynamic rate APIs — snapshot replace contract")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 78 * mm, "NL-FE-KB-CALC-001  ·  NL-BE-KB-CALC-001  ·  v1.0  ·  13 Sep 2026")
    c.drawString(ML, PAGE_H - 86 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "NexusLexis KB Calculator API Contract")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 100 * mm), PageBreak()]

    story.append(Paragraph("0. Hard rule — snapshot replace", S["H1"]))
    story.append(Paragraph(
        "Every write replaces the stored array wholesale. Upload 11 limitation articles → store exactly 11. "
        "Previous 10 are deleted. Do not merge-by-id. Do not keep leftovers. Atomic validate-then-swap.",
        S["B"],
    ))

    story.append(Paragraph("1. Headers", S["H1"]))
    story.append(tbl(["Header", "Routes", "Value"], [
        ["Authorization", "Admin", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["Content-Type", "JSON", "application/json"],
        ["Content-Type", "PDF upload", "multipart/form-data"],
    ], [32 * mm, 28 * mm, u - 60 * mm]))
    story.append(Spacer(1, 3))
    story.append(Code('Error: { "success": false, "error": "…", "message": "…", "fields": { … } }\n'
                      '400 / 401 / 403 / 404 / 413 / 415 / 422'))

    story.append(Paragraph("2. Endpoints", S["H1"]))
    story.append(tbl(["Method", "Path", "Auth"], [
        ["GET", "/knowledge-bank/calculators", "Public (live only)"],
        ["GET", "/knowledge-bank/calculators/:id", "Public (404 if draft)"],
        ["GET", "/knowledge-bank/calculators/:id/resource.pdf", "Public"],
        ["GET", "/admin/knowledge-bank/calculators", "Admin"],
        ["GET", "/admin/knowledge-bank/calculators/:id", "Admin"],
        ["PUT", "/admin/knowledge-bank/calculators/:id", "Admin — full snapshot"],
        ["PUT", "/admin/…/calculators/:id/groups/:groupId", "Admin — group snapshot"],
        ["PATCH", "/admin/knowledge-bank/calculators/:id", "Admin — chrome only"],
        ["POST", "/admin/…/calculators/:id/resource", "Admin — PDF"],
        ["DELETE", "/admin/…/calculators/:id/resource", "Admin"],
    ], [18 * mm, 78 * mm, u - 96 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("3. Seeded catalogue (8 ids)", S["H1"]))
    story.append(tbl(["id", "Groups"], [
        ["court", "civil adValorem · criminal fixed · documents/family itemList"],
        ["wht", "purchase / sale whtBands"],
        ["stamp", "instruments / deeds / agri / other infoList"],
        ["tax", "salarySlabs slabList"],
        ["business", "businessSlabs slabList + surcharge fields"],
        ["inherit", "note (FE rule engine)"],
        ["limit", "causes limitList"],
        ["secp", "incorp incorpFee · services serviceList"],
    ], [28 * mm, u - 28 * mm]))

    story.append(Paragraph("4. List / detail envelope", S["H1"]))
    story.append(Code('''// GET list
{ "success": true, "data": { "schedules": [ … ], "counts": { "live": 8, "draft": 0 } } }

// GET one / PUT response
{ "success": true, "data": { "id": "limit", "title": "…", "status": "live",
  "groups": [ … ], "updatedAt": "…", "updatedBy": "1" } }'''))

    story.append(Paragraph("5. PUT group (table save)", S["H1"]))
    story.append(Code('''PUT /admin/knowledge-bank/calculators/limit/groups/causes
{
  "title": "Articles & Limitation Periods",
  "kind": "limitList",
  "fields": {},
  "items": [ /* FULL list — 11 replaces 10 */ ]
}'''))

    story.append(Paragraph("6. PATCH chrome", S["H1"]))
    story.append(Code('{ "status": "draft", "hint": "Hold until rates notified." }\n'
                      '// Allowed: status, title, subtitle, hint, note — arrays ignored'))

    story.append(Paragraph("7. Resource PDF", S["H1"]))
    story.append(Code('''POST …/tax/resource  multipart: heading, fileName?, file=<pdf>
→ resource.url = https://…/knowledge-bank/calculators/tax/resource.pdf
DELETE …/resource → url "" (FE bundled fallback)'''))
    story.append(PageBreak())

    story.append(Paragraph("8. Kind → item shapes", S["H1"]))
    story.append(tbl(["kind", "Required"], [
        ["adValorem", "fields: exemptUpto, ratePercent, maxFee"],
        ["fixed", "fields: fee"],
        ["itemList", "items: id, label, fee"],
        ["whtBands", "items: id, label, from, up, filer, non (up=0 open)"],
        ["infoList", "items: id, article, label, rate"],
        ["slabList", "items: id, label, from, up, ratePercent, base"],
        ["limitList", "items: id, category, art, label, period, years, months, days, startFrom"],
        ["incorpFee", "fields: lotSize, firstOnline/Offline, extraOnline/Offline"],
        ["serviceList", "items: id, label, govt"],
        ["note", "no items"],
    ], [28 * mm, u - 28 * mm]))

    story.append(Paragraph("9. FE swap", S["H1"]))
    story.append(tbl(["localStorage", "API"], [
        ["load… (admin)", "GET /admin/knowledge-bank/calculators"],
        ["load… (public)", "GET /knowledge-bank/calculators"],
        ["persist / Save", "PUT …/:id or PUT …/groups/:groupId"],
        ["PDF card", "resource.url from GET"],
    ], [45 * mm, u - 45 * mm]))

    story.append(Paragraph("10. Delivery", S["H1"]))
    story.append(tbl(["P", "Item", "Status"], [
        ["P0", "Seed 8 + GET public/admin", "Shipped"],
        ["P0", "PUT full + group snapshot replace", "Shipped"],
        ["P1", "PATCH + PDF resource", "Shipped"],
        ["P2", "Optimistic lock", "Deferred"],
    ], [12 * mm, 70 * mm, u - 82 * mm]))

    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
        title="NexusLexis Knowledge Bank Calculator API",
    )
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
