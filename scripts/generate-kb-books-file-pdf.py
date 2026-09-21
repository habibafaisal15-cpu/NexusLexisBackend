"""Law Books volume file API PDF — NL-FE-KB-BOOKS-FILE-001."""
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
OUT = ROOT / "docs" / "Knowledge_Bank_Law_Books_File_API.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Law Books — Volume File APIs")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "PDF / DOCX upload · headers · endpoints · responses")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-KB-BOOKS-FILE-001  v1.0  ·  21 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "Law Books File API NL-FE-KB-BOOKS-FILE-001")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Delta", S["H1"]))
    story.append(Paragraph(
        "Extends Law Books CRUD: one PDF or DOCX volume per book (max 25 MB). "
        "Publish requires hasFile. Public Open/Download uses file.url.",
        S["B"],
    ))
    story.append(tbl(["Header", "On", "Value"], [
        ["Authorization", "Admin", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["Content-Type", "status PATCH", "application/json"],
        ["Content-Type", "create/update/file", "multipart/form-data"],
    ], [32 * mm, 32 * mm, u - 64 * mm]))
    story.append(tbl(["Rule", "Value"], [
        ["Types", "application/pdf (.pdf) or DOCX (.docx)"],
        ["Max size", "25 MB"],
        ["Field name", "file (+ optional fileName)"],
        ["Publish", "title + description + hasFile required"],
    ], [28 * mm, u - 28 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("1. Create / update (multipart)", S["H1"]))
    story.append(Paragraph("<b>POST</b> /admin/knowledge-bank/books", S["H2"]))
    story.append(Paragraph("<b>PUT/PATCH</b> /admin/knowledge-bank/books/:idOrSlug", S["H2"]))
    story.append(Code('''Content-Type: multipart/form-data

slug=pakistan-penal-code-annotated
status=published
kind=annotated&subject=criminal
title=Pakistan Penal Code - annotated
description=Bare text with section notes...
languages=["EN","UR"]
contents=[{"title":"Preliminary","page":1}]
file=<pdf|docx>
fileName=ppc-2026.pdf'''))
    story.append(Code('''Response 201/200:
{ "success": true, "data": {
  "id": "3", "slug": "pakistan-penal-code-annotated",
  "status": "published", "hasFile": true,
  "file": {
    "url": "https://…/knowledge-bank/books/…/file?v=…",
    "fileName": "ppc-2026.pdf",
    "mime": "application/pdf",
    "sizeBytes": 4821930
  }
} }'''))
    story.append(Paragraph("Publish without file → 400 { fields.file: required }. Draft may omit file.", S["B"]))

    story.append(Paragraph("2. Dedicated file routes", S["H1"]))
    story.append(tbl(["Method", "Path", "Auth / notes"], [
        ["POST", "/admin/knowledge-bank/books/:idOrSlug/file", "Admin · replace volume"],
        ["DELETE", "/admin/knowledge-bank/books/:idOrSlug/file", "Admin · clears file + forces draft"],
        ["GET", "/admin/knowledge-bank/books/:idOrSlug/file", "Admin · stream preview"],
        ["GET", "/knowledge-bank/books/:idOrSlug/file", "Public · published only; ?download=1"],
    ], [22 * mm, 78 * mm, u - 100 * mm]))
    story.append(Code('''POST …/file
Content-Type: multipart/form-data
file=<binary>&fileName=optional.pdf'''))
    story.append(PageBreak())

    story.append(Paragraph("3. Full endpoint index", S["H1"]))
    story.append(tbl(["Method", "Path"], [
        ["GET", "/knowledge-bank/books[/:idOrSlug[/file]]"],
        ["GET", "/admin/knowledge-bank/books[/:idOrSlug[/file]]"],
        ["POST", "/admin/knowledge-bank/books  (multipart + optional file)"],
        ["PUT/PATCH", "/admin/knowledge-bank/books/:idOrSlug  (multipart)"],
        ["PATCH", "/admin/knowledge-bank/books/:idOrSlug/status"],
        ["POST/DELETE", "/admin/knowledge-bank/books/:idOrSlug/file"],
        ["DELETE", "/admin/knowledge-bank/books/:idOrSlug"],
    ], [32 * mm, u - 32 * mm]))

    story.append(Paragraph("4. Acceptance", S["H1"]))
    story.append(tbl(["Check", "Status"], [
        ["POST book+file → hasFile; public Open/Download", "Shipped"],
        ["Publish without file rejected 400", "Shipped"],
        ["Replace via POST …/file", "Shipped"],
        ["DELETE file → draft; re-publish needs file", "Shipped"],
        ["PDF and DOCX ≤ 25 MB", "Shipped"],
    ], [110 * mm, u - 110 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis Law Books File API")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
