"""Knowledge Bank Reads API contract PDF — NL-FE-KB-READS-001."""
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
OUT = ROOT / "docs" / "Knowledge_Bank_Reads_API.pdf"
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
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=11, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=4))
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
        self._p, y = [], 0
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
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
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
    c.drawString(ML, PAGE_H - 55 * mm, "Knowledge Bank Reads")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 64 * mm, "Articles · Summaries · Judgements + PDF popup")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 78 * mm, "NL-FE-KB-READS-001  ·  NL-BE-KB-READS-001  ·  v1.0  ·  13 Sep 2026")
    c.drawString(ML, PAGE_H - 86 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "NexusLexis KB Reads API Contract")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 100 * mm), PageBreak()]

    story.append(Paragraph("0. Product rule", S["H1"]))
    story.append(Paragraph(
        "Card is JSON. Body is one application/pdf. Admin publish updates landing cards; "
        "click opens DocumentPreviewModal with file.url. Not Library templates, not calculators, not SEO CMS.",
        S["B"],
    ))

    story.append(Paragraph("1. Headers & errors", S["H1"]))
    story.append(tbl(["Header", "Value"], [
        ["Authorization + X-Client-Role", "Admin JWT + Admin"],
        ["Create / file upload", "multipart/form-data"],
        ["PATCH metadata", "application/json"],
        ["Public PDF", "no auth · CORS * · application/pdf"],
    ], [45 * mm, u - 45 * mm]))
    story.append(Code('422 publish without PDF · 409 slug taken / locked · 413 >15MB · 415 not PDF'))

    story.append(Paragraph("2. Endpoints", S["H1"]))
    story.append(tbl(["Method", "Path"], [
        ["GET", "/knowledge-bank/articles|summaries|judgements"],
        ["GET", "/knowledge-bank/{pillar}/:slug[+ /file]"],
        ["GET", "/admin/knowledge-bank/entries"],
        ["POST", "/admin/knowledge-bank/entries  (multipart + optional file)"],
        ["PATCH", "/admin/knowledge-bank/entries/:id"],
        ["PATCH", "/admin/knowledge-bank/entries/:id/status"],
        ["POST/DELETE/GET", "/admin/knowledge-bank/entries/:id/file"],
    ], [32 * mm, u - 32 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("3. Public articles layout", S["H1"]))
    story.append(Code('''{
  "success": true,
  "data": {
    "featured": { "placement": "featured", "title": "…", "file": { "url": "…" } },
    "stack": [ /* 0–2 */ ],
    "mini": [ /* rest */ ],
    "items": [ /* all */ ],
    "counts": { "published": 6 }
  }
}'''))
    story.append(Paragraph(
        "Extras: placement, kicker, band (seal|gold|navy), author, credit, readMins. "
        "Only one featured; at most two stack — else 422 reject.",
        S["B"],
    ))

    story.append(Paragraph("4. Summaries / judgements", S["H1"]))
    story.append(Code('''// summaries
{ "data": { "filters": ["All","Constitutional",…], "items": […], "counts": { "published": 9 } } }
// extras: tag, chapters, amended

// judgements
{ "data": { "items": […], "counts": { "published": 6 } } }
// extras: court, cite, holding, spine (sc|hc|lhc), tags, readMins'''))

    story.append(Paragraph("5. Admin create (multipart)", S["H1"]))
    story.append(Code('''POST /admin/knowledge-bank/entries
pillar=articles&title=…&slug=…&status=draft&excerpt=…
placement=stack&kicker=…&band=seal&readMins=5
file=<pdf>   # required if status=published'''))

    story.append(Paragraph("6. PDF popup", S["H1"]))
    story.append(Paragraph(
        "file.url → pdf.js getDocument. Public file route: inline PDF, HEAD ok, ?download=1 attachment, "
        "cache-buster ?v=updatedAt after replace. Draft/retired → 404.",
        S["B"],
    ))

    story.append(Paragraph("7. FE swap", S["H1"]))
    story.append(tbl(["Current", "API"], [
        ["Hardcoded articles JSX", "GET /knowledge-bank/articles"],
        ["STATUTES", "GET /knowledge-bank/summaries"],
        ["JUDGEMENTS", "GET /knowledge-bank/judgements"],
        ["Click no-op", "pdfUrl: entry.file.url"],
        ["Admin local SEED", "GET/POST/PATCH …/entries + /file"],
    ], [50 * mm, u - 50 * mm]))

    story.append(Paragraph("8. Delivery", S["H1"]))
    story.append(tbl(["P", "Item", "Status"], [
        ["P0", "CRUD + PDF + public layouts", "Shipped"],
        ["P1", "Featured/stack rules + search/pagination", "Shipped"],
        ["P2", "Hard delete / CDN / PDF search", "Deferred"],
    ], [12 * mm, 75 * mm, u - 87 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis Knowledge Bank Reads API")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
