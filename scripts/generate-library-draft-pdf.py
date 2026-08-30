"""Full API contract PDF — Library Template Drafts NL-FE-LIB-DRAFT-001."""
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
OUT = ROOT / "docs" / "Library_Template_Draft_API.pdf"

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
    c.setFont(BOLD, 16)
    c.drawString(ML, PAGE_H - 55 * mm, "Admin Library — Template Draft APIs")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 65 * mm, "Full contract: headers · params · bodies · responses")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 78 * mm, "NL-FE-LIB-DRAFT-001  ·  NL-BE-LIB-DRAFT-001  ·  v1.0  ·  30 Aug 2026")
    c.drawString(ML, PAGE_H - 86 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2/admin/library")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "NexusLexis Library Draft API Contract")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 100 * mm), PageBreak()]

    story.append(Paragraph("0. Headers & errors", S["H1"]))
    story.append(tbl(["Header", "Required", "Value"], [
        ["Authorization", "Yes", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Yes", "Admin"],
        ["Content-Type", "POST/PUT file", "multipart/form-data"],
    ], [32 * mm, 22 * mm, u - 54 * mm]))
    story.append(Spacer(1, 4))
    story.append(Code('{ "error": "message" }\n// publish: { "error": "Validation failed", "message": "...", "fields": {} }\n// 400 / 401 / 403 / 404 / 409 / 422'))

    story.append(Paragraph("1. Why + architecture", S["H1"]))
    story.append(Paragraph(
        "Admin can save incomplete publish forms as drafts (replaces localStorage). "
        "Drafts are a separate table — never shown in Client Library or Knowledge Bank. "
        "Publish = POST /templates then DELETE /drafts/:id.",
        S["B"],
    ))

    story.append(Paragraph("2. Endpoint map", S["H1"]))
    story.append(tbl(["Method", "Path", "Purpose"], [
        ["POST", "/drafts", "Create draft (partial OK)"],
        ["PUT", "/drafts/:id", "Update draft (partial OK)"],
        ["GET", "/drafts/:id", "Resume one draft"],
        ["DELETE", "/drafts/:id", "Delete draft"],
        ["GET", "/catalog?status=draft", "Drafts tab + counts.draft"],
        ["POST", "/templates", "Publish live template"],
    ], [22 * mm, 55 * mm, u - 77 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("3. POST /drafts", S["H1"]))
    story.append(Paragraph("multipart/form-data · at least one field or file required", S["B"]))
    story.append(tbl(["Field", "Type", "Draft", "Notes"], [
        ["name", "string", "optional*", ""],
        ["code", "string", "optional*", "no uniqueness on draft"],
        ["accessType", "paid|public", "optional*", ""],
        ["categorySlug", "string", "optional*", ""],
        ["block", "string", "optional*", ""],
        ["lang", "string", "optional*", "alias: language"],
        ["price", "number", "optional", ""],
        ["version", "string", "optional*", ""],
        ["lawyer", "string", "optional*", "alias: author"],
        ["lawyerProfileId", "string", "optional*", "aliases: lawyerId, authorProfileId"],
        ["description", "string", "optional*", ""],
        ["file", "File", "optional", "stored server-side"],
    ], [32 * mm, 28 * mm, 22 * mm, u - 82 * mm]))
    story.append(Paragraph("Response 201", S["H2"]))
    story.append(Code('''{
  "id": "draft-550e8400-e29b-41d4-a716-446655440000",
  "status": "draft",
  "name": "Power of Attorney",
  "code": "NL FAM 001",
  "accessType": "paid",
  "categorySlug": "corporate-business",
  "block": "Petitions",
  "lang": "English / Urdu",
  "price": 2500,
  "version": "v1.0",
  "lawyer": "Matti Ullah",
  "lawyerProfileId": "5",
  "description": "...",
  "hasTemplateFile": false,
  "templateFileName": null,
  "isActive": false,
  "createdBy": "1",
  "createdAt": "2026-08-30T12:00:00.000Z",
  "updatedAt": "2026-08-30T12:00:00.000Z"
}'''))

    story.append(Paragraph("4. PUT /drafts/:id", S["H1"]))
    story.append(Paragraph(
        "Same fields as POST (partial). Optional clearFile=true. New file replaces previous. "
        "Response 200 = same draft shape. Errors: 404 / 400 empty result.",
        S["B"],
    ))

    story.append(Paragraph("5. GET /drafts/:id", S["H1"]))
    story.append(Paragraph("Resume form. Response 200 = draft shape. 404 if missing.", S["B"]))

    story.append(Paragraph("6. DELETE /drafts/:id", S["H1"]))
    story.append(Code('{ "ok": true, "id": "draft-…" }'))
    story.append(PageBreak())

    story.append(Paragraph("7. GET /catalog?status=…", S["H1"]))
    story.append(tbl(["Param", "Values"], [
        ["status", "active | paid | public | inactive | draft"],
        ["search / category / block / lang", "optional filters"],
        ["page / limit", "pagination"],
    ], [45 * mm, u - 45 * mm]))
    story.append(Paragraph("Response when status=draft", S["H2"]))
    story.append(Code('''{
  "status": "draft",
  "documents": [{ "id": "draft-…", "status": "draft", "isActive": false, ... }],
  "templates": [ /* same */ ],
  "counts": { "paid": 16, "public": 3, "inactive": 0, "draft": 2 },
  "pagination": { "page": 1, "limit": 12, "totalItems": 2, ... }
}'''))
    story.append(Paragraph(
        "Each draft item includes status:\"draft\" for the Draft badge. "
        "counts.draft appears on all admin catalog responses.",
        S["B"],
    ))

    story.append(Paragraph("8. Publish flow (MVP)", S["H1"]))
    story.append(Code('''1. POST /drafts  →  { id }
2. PUT /drafts/:id  (auto-save)
3. POST /templates  (full validated multipart + file)
   optional body field: draftId
4. DELETE /drafts/:id  (or skip if draftId sent)'''))
    story.append(Paragraph(
        "Publish required: name, accessType, categorySlug, block, lang, version, description, "
        "lawyerProfileId, file; price required if paid. 422 validation · 409 duplicate.",
        S["B"],
    ))

    story.append(Paragraph("9. Business rules", S["H1"]))
    story.append(tbl(["Rule", "Behaviour"], [
        ["Admin-only", "Never in /library or /knowledge-bank"],
        ["Draft ≠ inactive", "Inactive = published then deactivated"],
        ["Uniqueness", "Slug/code checked on publish only"],
        ["Empty save", "400 — need ≥1 field or file"],
        ["createdBy", "Stored; all admins can access drafts"],
    ], [35 * mm, u - 35 * mm]))

    story.append(Paragraph("10. FE swap", S["H1"]))
    story.append(tbl(["localStorage helper", "API"], [
        ["saveLibraryPublishingDraft()", "POST or PUT /drafts"],
        ["loadLibraryPublishingDrafts()", "GET /catalog?status=draft"],
        ["deleteLibraryPublishingDraft()", "DELETE /drafts/:id"],
        ["Publish + clear", "POST /templates + DELETE /drafts/:id"],
    ], [55 * mm, u - 55 * mm]))

    story.append(Paragraph("11. Delivery", S["H1"]))
    story.append(tbl(["P", "Item", "Status"], [
        ["P0", "POST+PUT+DELETE /drafts", "Shipped"],
        ["P0", "catalog?status=draft + counts.draft", "Shipped"],
        ["P1", "GET /drafts/:id", "Shipped"],
        ["P2", "Atomic /drafts/:id/publish", "Deferred"],
    ], [12 * mm, 70 * mm, u - 82 * mm]))

    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
        title="NexusLexis Library Template Draft API",
    )
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
