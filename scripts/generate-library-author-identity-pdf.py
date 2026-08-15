"""Branded PDF: Library Author Identity API (NL-FE-LIB-AUTHOR-001)."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Library_Author_Identity_API.pdf"

NAVY = HexColor("#0B1F3A")
NAVY_MID = HexColor("#16375F")
GOLD = HexColor("#C9A227")
CREAM = HexColor("#F6F1E6")
SLATE = HexColor("#3A4658")
MUTED = HexColor("#6B7380")
TEAL = HexColor("#1F6F6A")
ROW_ALT = HexColor("#F4F7FB")
CODE_BG = HexColor("#0E243F")
WARN_BG = HexColor("#FDF2E9")
OK_BG = HexColor("#E8F4F1")
LINE = HexColor("#D5DCE6")

PAGE_W, PAGE_H = A4
MARGIN_L = 18 * mm
MARGIN_R = 18 * mm
MARGIN_T = 22 * mm
MARGIN_B = 18 * mm


def register_fonts():
    candidates = [
        (Path(r"C:\Windows\Fonts\calibri.ttf"), Path(r"C:\Windows\Fonts\calibrib.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Body", str(regular)))
            pdfmetrics.registerFont(TTFont("Body-Bold", str(bold)))
            return "Body", "Body-Bold"
    return "Helvetica", "Helvetica-Bold"


BODY, BOLD = register_fonts()


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("CoverKicker", fontName=BOLD, fontSize=9, textColor=GOLD, spaceAfter=8))
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=22, leading=28, textColor=white, spaceAfter=8))
    ss.add(ParagraphStyle("CoverSub", fontName=BODY, fontSize=11.5, leading=16, textColor=HexColor("#D5DEEA")))
    ss.add(ParagraphStyle("CoverMeta", fontName=BODY, fontSize=9.5, leading=14, textColor=HexColor("#B7C3D4")))
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=14, leading=18, textColor=NAVY, spaceBefore=14, spaceAfter=8))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=11.5, leading=15, textColor=NAVY_MID, spaceBefore=10, spaceAfter=6))
    ss.add(ParagraphStyle("BodyText2", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=6))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=8.2, leading=11, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=8.2, leading=11.4, textColor=SLATE))
    ss.add(ParagraphStyle("TdBold", fontName=BOLD, fontSize=8.2, leading=11.4, textColor=NAVY))
    ss.add(ParagraphStyle("Callout", fontName=BODY, fontSize=9, leading=13, textColor=NAVY))
    return ss


S = styles()


class GoldRule(Flowable):
    def wrap(self, aw, ah):
        self.width = aw
        self.height = 4
        return aw, 4

    def draw(self):
        self.canv.setStrokeColor(GOLD)
        self.canv.setLineWidth(1.6)
        self.canv.line(0, 1, self.width, 1)


class CalloutBox(Flowable):
    def __init__(self, text, bg=CREAM, accent=GOLD, icon="NOTE"):
        super().__init__()
        self.text, self.bg, self.accent, self.icon = text, bg, accent, icon

    def wrap(self, aw, ah):
        self.width = aw
        self._p = Paragraph(f"<b>{self.icon}</b> &nbsp; {self.text}", S["Callout"])
        _, h = self._p.wrap(aw - 16, ah)
        self._h = h + 14
        self.height = self._h
        return aw, self._h

    def draw(self):
        self.canv.setFillColor(self.bg)
        self.canv.roundRect(0, 0, self.width, self._h, 4, fill=1, stroke=0)
        self.canv.setFillColor(self.accent)
        self.canv.rect(0, 0, 3.2, self._h, fill=1, stroke=0)
        self._p.drawOn(self.canv, 10, 7)


class CodeBlock(Flowable):
    def __init__(self, text):
        super().__init__()
        self.raw = text.strip("\n")

    def wrap(self, aw, ah):
        self.width = aw
        style = ParagraphStyle("CodeLine", fontName="Courier", fontSize=7.4, leading=10.2, textColor=HexColor("#E4ECF6"))
        self._paras = []
        y = 0
        for line in self.raw.splitlines() or [""]:
            esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
            p = Paragraph(esc or "&nbsp;", style)
            _, h = p.wrap(aw - 16, ah)
            self._paras.append((p, h))
            y += h
        self._h = y + 14
        self.height = self._h
        return aw, self._h

    def draw(self):
        self.canv.setFillColor(CODE_BG)
        self.canv.roundRect(0, 0, self.width, self._h, 4, fill=1, stroke=0)
        y = self._h - 8
        for p, h in self._paras:
            y -= h
            p.drawOn(self.canv, 8, y)


def make_table(headers, rows, col_widths):
    data = [[Paragraph(h, S["Th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S["TdBold"] if i == 0 else S["Td"]) for i, c in enumerate(row)])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
    ]
    for i in range(1, len(data)):
        cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT if i % 2 == 0 else white))
    t.setStyle(TableStyle(cmds))
    return t


def heading(text):
    return Paragraph(text, S["H1"])


def body(text):
    return Paragraph(text, S["BodyText2"])


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(NAVY_MID)
    canvas.rect(0, PAGE_H - 42 * mm, PAGE_W, 42 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 43.4 * mm, PAGE_W, 2.2, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.setFont(BOLD, 9)
    canvas.drawString(MARGIN_L, PAGE_H - 18 * mm, "NEXUSLEXIS PLATFORM")
    canvas.setFillColor(white)
    canvas.setFont(BODY, 9)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 18 * mm, "INTERNAL  ·  FRONTEND TEAM")
    canvas.setFillColor(GOLD)
    canvas.rect(0, 38 * mm, 6, PAGE_H - 86 * mm, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#0A1930"))
    canvas.roundRect(MARGIN_L, 22 * mm, PAGE_W - MARGIN_L - MARGIN_R, 18 * mm, 4, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.setFont(BOLD, 8)
    canvas.drawString(MARGIN_L + 8, 32 * mm, "PRODUCTION BASE")
    canvas.setFillColor(HexColor("#D5DEEA"))
    canvas.setFont("Courier", 7.4)
    canvas.drawString(MARGIN_L + 8, 26 * mm, "https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    canvas.restoreState()


def on_page(canvas, doc):
    if doc.page == 1:
        return
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 12 * mm, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 12.6 * mm, PAGE_W, 1.6, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont(BOLD, 8)
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  LIBRARY AUTHOR IDENTITY")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-LIB-AUTHOR-001")
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  15 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = []
    story.append(Spacer(1, 58 * mm))
    story.append(Paragraph("FRONTEND API CHANGELOG", S["CoverKicker"]))
    story.append(Paragraph("Library Author Identity", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Persist lawyerProfileId on templates, echo id/email/picture on public directory and "
        "lawyer profile, honour isActive activate, and assign custom-docs by id only.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph(
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-LIB-AUTHOR-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.0 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;15 August 2026<br/>"
        "<b>Backend CR</b>&nbsp;&nbsp;NL-BE-LIB-AUTHOR-001",
        S["CoverMeta"],
    ))
    story.append(PageBreak())

    story.append(heading("1. Changelog"))
    story.append(GoldRule())
    story.append(make_table(
        ["Area", "What changed"],
        [
            ["GET /lawyers/public", "id, lawyerProfileId, email, image/photoUrl/profilePicture"],
            ["GET /cas/public", "id, caProfileId, email, picture fields"],
            ["GET /lawyer/profile", "id, lawyerProfileId, email, picture fields"],
            ["POST /lawyer/profile/photo", "Persists photo; returns photoUrl aliases"],
            ["Admin library templates", "Store + echo lawyerProfileId; PUT/PATCH isActive"],
            ["Custom-docs", "lawyerProfileId required — no name-only assign"],
        ],
        [52 * mm, usable - 52 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(CalloutBox(
        "Display names collide (two “Matti Ullah”). Always key off "
        "<font face='Courier'>lawyerProfileId</font> — never name alone.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="IDENTITY",
    ))

    story.append(heading("2. Public directory"))
    story.append(CodeBlock(
        "GET /api/v2/lawyers/public\n"
        "{\n"
        '  "id": "13",\n'
        '  "lawyerProfileId": "13",\n'
        '  "name": "Matti Ullah",\n'
        '  "email": "matti13@nexuslexis.law",\n'
        '  "image": "…", "photoUrl": "…", "profilePicture": "…"\n'
        "}"
    ))
    story.append(body("Null email → show “Email not listed”. Picture aliases are the same URL."))

    story.append(heading("3. Library template author"))
    story.append(body(
        "Create/update accept <font face='Courier'>lawyerProfileId</font> "
        "(aliases <font face='Courier'>lawyerId</font>, <font face='Courier'>authorProfileId</font>). "
        "Unknown verified id → 400. Catalog/detail echo all three id fields."
    ))
    story.append(CodeBlock(
        "{\n"
        '  "lawyer": "Matti Ullah",\n'
        '  "author": "Matti Ullah",\n'
        '  "lawyerProfileId": "13",\n'
        '  "lawyerId": "13",\n'
        '  "authorProfileId": "13",\n'
        '  "isActive": true\n'
        "}"
    ))
    story.append(body("Drop the temporary credit string <font face='Courier'>Name · #13</font> once this is live."))

    story.append(heading("4. Activate / deactivate"))
    story.append(make_table(
        ["Call", "Effect"],
        [
            ["DELETE /admin/library/templates/:id", "Soft deactivate (isActive false)"],
            ["PUT/PATCH … { isActive: true }", "Reactivate — appears in public catalog"],
        ],
        [70 * mm, usable - 70 * mm],
    ))

    story.append(heading("5. Custom docs"))
    story.append(CodeBlock(
        "POST /api/v2/documents/custom-requests\n"
        '{ "lawyerProfileId": 13, "lawyerName": "Matti Ullah", "source": "custom_docs" }\n'
        "// Missing/invalid id → 400. Name is label only."
    ))

    story.append(heading("6. Checklist"))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "Find a Lawyer shows id + email + picture"],
            ["2", "Publish template with lawyerProfileId — catalog echoes it"],
            ["3", "Custom Doc assigns that id (not another same-name lawyer)"],
            ["4", "Admin Activate via isActive true works"],
            ["5", "Photo upload persists and returns on profile GET"],
        ],
        [14 * mm, usable - 14 * mm],
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(CalloutBox(
        "Live: <font face='Courier'>https://nexus-lexis-backend-ql8w.vercel.app/api/v2</font>",
        bg=OK_BG, accent=TEAL, icon="LIVE",
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T + 4 * mm,
        bottomMargin=MARGIN_B + 4 * mm,
        title="NexusLexis — Library Author Identity API",
        author="NexusLexis Backend",
        subject="NL-FE-LIB-AUTHOR-001",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
