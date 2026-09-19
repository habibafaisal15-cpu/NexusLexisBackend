"""NL-BE-KB-DYN-001 — Knowledge Bank dynamic API changes PDF (full endpoints)."""
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
OUT = ROOT / "docs" / "Knowledge_Bank_Dynamic_API_Changes.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Knowledge Bank — Dynamic APIs")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "Changes + full endpoints (verifiedAt · Law Books · expiry)")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-BE-KB-DYN-001  v1.0  ·  19 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "KB Dynamic API Changes NL-BE-KB-DYN-001")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Delta vs FE guidance", S["H1"]))
    story.append(Paragraph(
        "Implements Frontend brief NL_Knowledge_Bank_Backend_API_Guidance.pdf: "
        "persist verifiedAt, hide expired on public KB, build Law Books Admin+Public APIs. "
        "Calculators unchanged.",
        S["B"],
    ))
    story.append(tbl(["Area", "Change"], [
        ["Free templates", "verifiedAt/expiresAt/createdAt/updatedAt · public catalog hides expired"],
        ["Articles/Summaries", "verifiedAt on write · public hide expired"],
        ["Judgements", "optional judges/result/caseNo/year/citedBy/bodyText + verifiedAt"],
        ["Law Books", "NEW full CRUD admin + public list/detail"],
        ["Validity", "6 months from verifiedAt · re-verify via PATCH with new timestamp"],
    ], [35 * mm, u - 35 * mm]))

    story.append(Paragraph("1. Headers", S["H1"]))
    story.append(tbl(["Header", "On", "Value"], [
        ["Authorization", "Admin", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["Content-Type", "JSON writes", "application/json"],
        ["Content-Type", "Templates / Reads file", "multipart/form-data"],
    ], [32 * mm, 35 * mm, u - 67 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("2. Free Templates endpoints", S["H1"]))
    story.append(tbl(["Method", "Path", "Notes"], [
        ["GET", "/admin/library/catalog?accessType=public", "Admin · includes expired"],
        ["POST", "/admin/library/templates", "multipart · verifiedAt optional (stamp now)"],
        ["PUT/PATCH", "/admin/library/templates/:idOrSlug", "re-verify via verifiedAt"],
        ["DELETE", "/admin/library/templates/:idOrSlug?hard=true", "Hard delete"],
        ["GET", "/knowledge-bank/catalog", "Public · omits expired"],
        ["GET", "/knowledge-bank/templates/:slug", "404 if expired"],
        ["GET", "/knowledge-bank/templates/:slug/download", "404 if expired"],
    ], [22 * mm, 70 * mm, u - 92 * mm]))
    story.append(Paragraph("Create FormData (public)", S["H2"]))
    story.append(Code(
        "name=…&accessType=public&categorySlug=…&price=0&description=…\n"
        "code=…&block=…&lang=English&lawyer=…&version=1.0\n"
        "verifiedAt=2026-09-19T12:00:00.000Z&file=<docx|pdf>"
    ))

    story.append(Paragraph("3. Reads endpoints", S["H1"]))
    story.append(tbl(["Method", "Path", "Notes"], [
        ["GET", "/admin/knowledge-bank/entries", "pillar/status/search/page/limit"],
        ["GET", "/admin/knowledge-bank/entries/:id", "full + verifiedAt"],
        ["POST", "/admin/knowledge-bank/entries", "multipart/JSON · stamp verifiedAt on publish"],
        ["PATCH", "/admin/knowledge-bank/entries/:id", "JSON · may set verifiedAt"],
        ["PATCH", "/admin/knowledge-bank/entries/:id/status", '{ "status": "retired" }'],
        ["POST/DELETE/GET", "/admin/knowledge-bank/entries/:id/file", "PDF max 15MB"],
        ["GET", "/knowledge-bank/articles|summaries|judgements", "public · articles/summaries hide expired"],
        ["GET", "/knowledge-bank/{pillar}/:slug[+ /file]", "published PDF popup"],
    ], [28 * mm, 68 * mm, u - 96 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("4. Law Books — NEW", S["H1"]))
    story.append(tbl(["Method", "Path", "Auth"], [
        ["GET", "/admin/knowledge-bank/books", "Admin"],
        ["GET", "/admin/knowledge-bank/books/:idOrSlug", "Admin"],
        ["POST", "/admin/knowledge-bank/books", "Admin"],
        ["PUT/PATCH", "/admin/knowledge-bank/books/:idOrSlug", "Admin"],
        ["PATCH", "/admin/knowledge-bank/books/:idOrSlug/status", "Admin"],
        ["DELETE", "/admin/knowledge-bank/books/:idOrSlug[?hard=true]", "Admin soft/hard"],
        ["GET", "/knowledge-bank/books", "Public published"],
        ["GET", "/knowledge-bank/books/:idOrSlug", "Public published"],
    ], [28 * mm, 85 * mm, u - 113 * mm]))
    story.append(Paragraph("POST body example", S["H2"]))
    story.append(Code('''{
  "slug": "pakistan-penal-code-annotated",
  "status": "published",
  "kind": "annotated",
  "subject": "criminal",
  "title": "Pakistan Penal Code - annotated",
  "description": "Bare text with section notes...",
  "spineBand": "VOL. I", "spineCode": "PPC",
  "edition": "2026 ed.", "year": 2026, "pages": 1240,
  "languages": ["EN","UR"], "spineTone": "seal",
  "author": "Nexus Lexis Panel",
  "contents": [{ "title": "Preliminary", "page": 1 }],
  "sampleChapter": { "title": "Sample", "body": "..." }
}'''))
    story.append(Paragraph(
        "Publish requires title + description. kind ∈ annotated|constitution|reporter|practice|commentary. "
        "subject ∈ criminal|constitutional|procedure|family|tax|civil. Slug locked after publish. "
        "Public query: search, kind, subject, year, language=EN|UR|EN_UR.",
        S["B"],
    ))
    story.append(Paragraph("Admin list envelope", S["H2"]))
    story.append(Code('''{ "success": true, "data": {
  "items": [ /* LawBook */ ],
  "pagination": { "page":1,"limit":12,"totalItems":8,"totalPages":1,"hasNext":false,"hasPrev":false },
  "counts": { "books":8, "published":6, "draft":1, "retired":1 }
} }'''))
    story.append(Paragraph("Public list envelope", S["H2"]))
    story.append(Code('''{ "success": true, "data": {
  "items": [ /* published only */ ],
  "filters": { "kinds":[…], "subjects":[…], "languages":["EN","UR","EN_UR"], "years":[…] },
  "counts": { "published": 6 }
} }'''))
    story.append(PageBreak())

    story.append(Paragraph("5. Master endpoint index", S["H1"]))
    story.append(Paragraph("Public", S["H2"]))
    story.append(tbl(["Method", "Path"], [
        ["GET", "/knowledge-bank/catalog"],
        ["GET", "/knowledge-bank/templates/:slug[+ /download]"],
        ["GET", "/knowledge-bank/articles|summaries|judgements"],
        ["GET", "/knowledge-bank/{pillar}/:slug[+ /file]"],
        ["GET", "/knowledge-bank/books[/:idOrSlug]"],
        ["GET", "/knowledge-bank/calculators[/:id[/resource.pdf]]"],
    ], [22 * mm, u - 22 * mm]))
    story.append(Paragraph("Admin", S["H2"]))
    story.append(tbl(["Method", "Path"], [
        ["GET/POST/PUT/PATCH/DELETE", "/admin/library/catalog · /templates/:idOrSlug"],
        ["GET/POST/PATCH", "/admin/knowledge-bank/entries[/:id[/status|/file]]"],
        ["GET/POST/PUT/PATCH/DELETE", "/admin/knowledge-bank/books[/:idOrSlug[/status]]"],
        ["GET/PUT/PATCH/POST/DELETE", "/admin/knowledge-bank/calculators[/:id[…]]"],
    ], [45 * mm, u - 45 * mm]))

    story.append(Paragraph("6. Acceptance", S["H1"]))
    story.append(tbl(["Check", "Status"], [
        ["Public template expires after 6 months; re-verify restores", "Shipped"],
        ["Article/summary same validity behaviour", "Shipped"],
        ["Law book publish → public books + filters", "Shipped"],
        ["Draft book never on public", "Shipped"],
        ["Admin counts for books/reads", "Shipped"],
        ["No localStorage as catalogue source of truth", "Shipped"],
    ], [110 * mm, u - 110 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis KB Dynamic API Changes")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
