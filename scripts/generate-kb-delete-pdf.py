"""Knowledge Bank Delete/Retire API PDF — NL-FE-KB-DELETE-001."""
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
OUT = ROOT / "docs" / "Knowledge_Bank_Delete_API.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Knowledge Bank — Delete / Retire")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "Hard DELETE entries + existing retire / file deletes")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-KB-DELETE-001  v1.0  ·  22 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "KB Delete API NL-FE-KB-DELETE-001")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Gap fixed", S["H1"]))
    story.append(Paragraph(
        "Articles/Summaries/Judgements previously had Retire only. "
        "Hard DELETE /admin/knowledge-bank/entries/:id is restored (library/books trash parity).",
        S["B"],
    ))
    story.append(tbl(["Header", "Value"], [
        ["Authorization", "Bearer &lt;admin JWT&gt;"],
        ["X-Client-Role", "Admin"],
        ["Content-Type (retire PATCH)", "application/json"],
    ], [50 * mm, u - 50 * mm]))

    story.append(Paragraph("1. Retire vs Delete", S["H1"]))
    story.append(tbl(["Action", "Public", "Admin"], [
        ["Retire (soft)", "Hidden", "Visible under Retired"],
        ["Hard delete", "Gone", "Gone"],
        ["Delete file only", "May force draft", "Entry remains"],
    ], [40 * mm, 50 * mm, u - 90 * mm]))
    story.append(PageBreak())

    story.append(Paragraph("2. NEW — Hard delete entry", S["H1"]))
    story.append(Paragraph("<b>DELETE</b>  /admin/knowledge-bank/entries/:id", S["H2"]))
    story.append(Paragraph("Auth: Admin JWT + X-Client-Role: Admin", S["B"]))
    story.append(tbl(["Query", "Default", "Meaning"], [
        ["hard", "true", "Permanent wipe row + PDF"],
        ["hard=false", "—", "Soft retire only (status=retired)"],
    ], [28 * mm, 22 * mm, u - 50 * mm]))
    story.append(Code('''DELETE /api/v2/admin/knowledge-bank/entries/12
DELETE /api/v2/admin/knowledge-bank/entries/12?hard=true
DELETE /api/v2/admin/knowledge-bank/entries/12?hard=false'''))
    story.append(Code('''Response 200 (hard):
{ "success": true, "data": { "id": "12", "deleted": true, "hardDeleted": true } }

Errors: 401 · 403 · 404'''))
    story.append(Paragraph(
        "Pillar-agnostic by id (articles, summaries, judgements). "
        "Removes DB row + stored PDF; public lists drop immediately; admin counts update.",
        S["B"],
    ))

    story.append(Paragraph("3. Existing — keep as-is", S["H1"]))
    story.append(Code('''PATCH /admin/knowledge-bank/entries/:id/status
{ "status": "retired" }   // also draft | published

DELETE /admin/knowledge-bank/entries/:id/file
→ hasFile=false, status=draft; row remains'''))
    story.append(PageBreak())

    story.append(Paragraph("4. All KB delete surfaces", S["H1"]))
    story.append(tbl(["Resource", "Method / Path"], [
        ["KB entry hard (NEW)", "DELETE /admin/knowledge-bank/entries/:id"],
        ["KB entry file", "DELETE /admin/knowledge-bank/entries/:id/file"],
        ["KB entry retire", "PATCH …/entries/:id/status { retired }"],
        ["Library template hard", "DELETE /admin/library/templates/:idOrSlug?hard=true"],
        ["Library draft", "DELETE /admin/library/drafts/:id"],
        ["Law book hard", "DELETE /admin/knowledge-bank/books/:idOrSlug?hard=true"],
        ["Law book file", "DELETE /admin/knowledge-bank/books/:idOrSlug/file"],
    ], [45 * mm, u - 45 * mm]))

    story.append(Paragraph("5. FE swap", S["H1"]))
    story.append(tbl(["UI", "API"], [
        ["Archive / Retire", "PATCH …/status { retired }"],
        ["Trash (confirm)", "DELETE …/entries/:id"],
        ["Remove PDF only", "DELETE …/entries/:id/file"],
    ], [40 * mm, u - 40 * mm]))

    story.append(Paragraph("6. Acceptance", S["H1"]))
    story.append(tbl(["Check", "Status"], [
        ["Hard DELETE published entry + PDF → public gone", "Shipped"],
        ["Retire independent of hard delete", "Shipped"],
        ["404 / 401 behaviour", "Shipped"],
        ["Same route for all three pillars", "Shipped"],
    ], [110 * mm, u - 110 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis KB Delete API")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
