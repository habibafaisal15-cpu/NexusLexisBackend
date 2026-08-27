"""Branded PDF: Admin Portal API + flows (NL-FE-ADMIN-PORTAL-001)."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Admin_Portal_Drafting_Knowledge_LEX_API.pdf"

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
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=20, leading=26, textColor=white, spaceAfter=8))
    ss.add(ParagraphStyle("CoverSub", fontName=BODY, fontSize=11.5, leading=16, textColor=HexColor("#D5DEEA")))
    ss.add(ParagraphStyle("CoverMeta", fontName=BODY, fontSize=9.5, leading=14, textColor=HexColor("#B7C3D4")))
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=13.5, leading=17, textColor=NAVY, spaceBefore=12, spaceAfter=7))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=11, leading=14, textColor=NAVY_MID, spaceBefore=8, spaceAfter=5))
    ss.add(ParagraphStyle("BodyText2", fontName=BODY, fontSize=9.3, leading=13.2, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=5))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=8, leading=10.5, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=8, leading=11, textColor=SLATE))
    ss.add(ParagraphStyle("TdBold", fontName=BOLD, fontSize=8, leading=11, textColor=NAVY))
    ss.add(ParagraphStyle("Callout", fontName=BODY, fontSize=8.8, leading=12.5, textColor=NAVY))
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
        style = ParagraphStyle("CodeLine", fontName="Courier", fontSize=7.2, leading=9.8, textColor=HexColor("#E4ECF6"))
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
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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
    canvas.drawString(MARGIN_L + 8, 26 * mm, "https://nexus-lexis-backend-ql8w.vercel.app")
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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  ADMIN PORTAL API + FLOWS")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-ADMIN-PORTAL-001")
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  25 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = []
    story.append(Spacer(1, 56 * mm))
    story.append(Paragraph("FRONTEND INTEGRATION", S["CoverKicker"]))
    story.append(Paragraph("Admin Portal<br/>Drafting · Knowledge · LEX", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "API contracts and start→end flows for Drafting Desk, Knowledge CMS, and LEX Console.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(
        "Document ID: NL-FE-ADMIN-PORTAL-001<br/>Version 1.0 · 25 August 2026<br/>Auth: JWT + X-Client-Role: Admin",
        S["CoverMeta"],
    ))
    story.append(Paragraph("<pagebreak/>", ParagraphStyle("pb", fontSize=1)))

    from reportlab.platypus import PageBreak
    story = story[:-1]
    story.append(PageBreak())

    story.append(heading("1. What shipped"))
    story.append(make_table(
        ["Room", "Purpose"],
        [
            ["Drafting Desk", "Queue + assign custom_docs + drafting orders; 24h SLA"],
            ["Knowledge content", "SEO CMS — 4 pillars (not file downloads)"],
            ["LEX Console", "Client/public LEX oversight + reload Q&A sheet"],
        ],
        [42 * mm, usable - 42 * mm],
    ))
    story.append(CalloutBox(
        "Free template <b>files</b> stay at <font face='Courier'>/knowledge-bank/*</font>. "
        "Knowledge <b>articles</b> are CMS pages at <font face='Courier'>/knowledge/articles</font>. "
        "Do not put lawyer LEX in the LEX Console UI.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="SCOPE",
    ))

    story.append(heading("2. Flow A — Drafting Desk"))
    story.append(CodeBlock(
        "Client pays / submits custom draft\n"
        "  → GET /admin/drafting-desk/orders (+ /stats)\n"
        "  → POST /admin/drafting-desk/orders/assign\n"
        "       { kind, appointmentId|orderNumber, lawyerProfileId|caProfileId }\n"
        "  → 24h SLA + professional notification\n"
        "  → Lawyer/CA /orders → deliver\n"
        "  → Client My Documents"
    ))
    story.append(body(
        "Assignable list: <font face='Courier'>GET /api/v2/admin/assignable-professionals</font>. "
        "Execution still uses existing lawyer/CA order + appointment deliver APIs."
    ))

    story.append(heading("3. Flow B — Knowledge CMS"))
    story.append(CodeBlock(
        "POST /admin/knowledge/articles   (draft)\n"
        "PATCH …/:idOrSlug  { status: published }\n"
        "Public: GET /knowledge/articles?pillar=\n"
        "        GET /knowledge/articles/:slug"
    ))
    story.append(make_table(
        ["pillar", "Use"],
        [
            ["legal_articles", "Long-form legal explainers"],
            ["law_summaries", "Short law / ordinance summaries"],
            ["free_templates", "Content pages linking relatedServiceSlugs"],
            ["legal_calculators", "Calculator landing / SEO pages"],
        ],
        [40 * mm, usable - 40 * mm],
    ))

    story.append(heading("4. Flow C — LEX Console"))
    story.append(CodeBlock(
        "Client/guest → POST /api/v1/lex/chat/\n"
        "Admin → GET /admin/lex/stats · /sessions · /sessions/:key\n"
        "      → POST /admin/lex/turns/:id/flag\n"
        "      → DELETE /admin/lex/sessions/:key\n"
        "      → POST /admin/lex/question-bank/reload"
    ))
    story.append(CalloutBox(
        "Guests: max 4 prompts then 401 LEX_LOGIN_REQUIRED. Logged-in clients: unlimited.",
        bg=OK_BG, accent=TEAL, icon="GUEST LIMIT",
    ))

    story.append(heading("5. Endpoint cheat-sheet"))
    story.append(make_table(
        ["Method", "Path"],
        [
            ["GET", "/api/v2/admin/drafting-desk/stats"],
            ["GET", "/api/v2/admin/drafting-desk/orders"],
            ["POST", "/api/v2/admin/drafting-desk/orders/assign"],
            ["CRUD", "/api/v2/admin/knowledge/articles[/:idOrSlug]"],
            ["GET", "/api/v2/knowledge/articles[/:slug]  (public)"],
            ["GET", "/api/v2/admin/lex/stats | /sessions"],
            ["GET/DEL", "/api/v2/admin/lex/sessions/:sessionKey"],
            ["POST", "/api/v2/admin/lex/turns/:turnId/flag"],
            ["POST", "/api/v2/admin/lex/question-bank/reload"],
        ],
        [28 * mm, usable - 28 * mm],
    ))

    story.append(heading("6. FE checklist"))
    story.append(make_table(
        ["#", "Build"],
        [
            ["1", "Admin nav: Drafting Desk, Knowledge CMS, LEX Console"],
            ["2", "Desk table + Assign drawer (lawyer/CA picker)"],
            ["3", "Knowledge editor + public /knowledge pages"],
            ["4", "LEX stats, transcripts, flag/delete, Reload Q&A"],
            ["5", "Reuse lawyer/CA deliver — no new deliver API"],
        ],
        [12 * mm, usable - 12 * mm],
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title="NexusLexis Admin Portal API — NL-FE-ADMIN-PORTAL-001",
        author="NexusLexis Backend",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
