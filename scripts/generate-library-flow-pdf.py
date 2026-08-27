"""Branded PDF: Document Library end-to-end flow (NL-FE-LIB-FLOW-001)."""
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
OUT = ROOT / "docs" / "Document_Library_End_to_End_Flow.pdf"

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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  DOCUMENT LIBRARY FLOW")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-LIB-FLOW-001")
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  22 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = []
    story.append(Spacer(1, 56 * mm))
    story.append(Paragraph("FRONTEND PRODUCT FLOW", S["CoverKicker"]))
    story.append(Paragraph("Document Library<br/>Start → End", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "How Admin publishing, Knowledge Bank, Paid Library, My Documents, "
        "author identity, and Custom Drafts connect as one module.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph(
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-LIB-FLOW-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.0 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;22 August 2026<br/>"
        "<b>Companions</b>&nbsp;&nbsp;NL-DOC-LIB-002 · NL-FE-LIB-AUTHOR-001 · NL-DOC-APPT-001",
        S["CoverMeta"],
    ))
    story.append(PageBreak())

    story.append(heading("1. Four tracks, one module"))
    story.append(GoldRule())
    story.append(make_table(
        ["Track", "Who", "Outcome"],
        [
            ["A. Admin publishing", "Admin", "Templates live as paid or public"],
            ["B. Knowledge Bank", "Anyone", "Free device download (not My Documents)"],
            ["C. Paid Library", "Client", "Buy → pay → unlock in My Documents"],
            ["D. Custom draft", "Client + lawyer", "Request → deliver → My Documents"],
        ],
        [42 * mm, 28 * mm, usable - 70 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(CalloutBox(
        "Author identity is always <font face='Courier'>lawyerProfileId</font>. "
        "Display names can collide — never assign by name alone.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="IDENTITY",
    ))

    story.append(heading("2. Component map"))
    story.append(CodeBlock(
        "Admin Publishing ──► services (templates + lawyerProfileId)\n"
        "        │                    │                    │\n"
        "        ▼                    ▼                    ▼\n"
        " Knowledge Bank        Paid Library          Custom Doc path\n"
        " (public, free)        (paid, buy/pay)       (author id)\n"
        "        │                    │                    │\n"
        "   Device download     My Documents         Appointments\n"
        "   (not My Docs)       + download           → Lawyer deliver\n"
        "                                                  │\n"
        "                                            My Documents"
    ))
    story.append(make_table(
        ["Component", "Role"],
        [
            ["Admin Library", "Categories + template CRUD; soft activate"],
            ["Find a Lawyer", "Verified lawyerProfileId + email + photo"],
            ["Knowledge Bank", "Public free catalog + device download"],
            ["Client Library", "Paid catalog, sample, purchase + complete"],
            ["My Documents", "Paid unlocks + custom-draft delivers"],
            ["Custom requests", "Book drafting on author id"],
            ["Lawyer deliver", "Upload finished draft into My Documents"],
        ],
        [40 * mm, usable - 40 * mm],
    ))

    story.append(heading("3. Track A — Admin publish"))
    story.append(CodeBlock(
        "1. Login Admin\n"
        "2. GET /admin/library/categories\n"
        "3. GET /lawyers/public  → pick lawyerProfileId\n"
        "4. POST /admin/library/templates  (file + accessType + lawyerProfileId)\n"
        "5. paid → Library catalog · public → Knowledge Bank\n"
        "6. PUT/PATCH { isActive } or DELETE (soft deactivate)"
    ))

    story.append(heading("4. Track B — Knowledge Bank (free)"))
    story.append(CodeBlock(
        "GET /knowledge-bank/catalog\n"
        "GET /knowledge-bank/templates/:slug\n"
        "GET /knowledge-bank/templates/:slug/download\n"
        "→ file to device only · never My Documents · no login"
    ))

    story.append(heading("5. Track C — Paid Library → My Documents"))
    story.append(CodeBlock(
        "GET /library/catalog?page=&limit=\n"
        "GET /library/templates/:slug\n"
        "  optional sample: GET …/sample\n"
        "POST /library/templates/:slug/purchase   { couponCode? }\n"
        "POST /library/purchases/:orderNumber/complete\n"
        "GET /documents\n"
        "GET /documents/:orderNumber/download"
    ))
    story.append(body(
        "Unpaid download → <b>402</b>. Old "
        "<font face='Courier'>POST …/templates/:slug/download</font> → <b>410 Gone</b>."
    ))

    story.append(heading("6. Track D — Custom draft"))
    story.append(CodeBlock(
        "Template card → lawyerProfileId\n"
        "POST /documents/custom-requests\n"
        "  { lawyerProfileId, source: custom_docs, mode: document, … }\n"
        "→ Lawyer GET /lawyer/appointments (assignee only)\n"
        "→ PATCH status · POST …/deliver (file)\n"
        "→ Client My Documents download"
    ))
    story.append(CalloutBox(
        "Missing/invalid <font face='Courier'>lawyerProfileId</font> → 400. "
        "Do not fall back to another lawyer with the same name.",
        bg=OK_BG, accent=TEAL, icon="CUSTOM DOC",
    ))

    story.append(heading("7. My Documents sources"))
    story.append(make_table(
        ["source", "How it arrives"],
        [
            ["library_purchase", "Paid buy + complete"],
            ["custom_docs", "Lawyer deliver on drafting appointment"],
            ["other orders", "Classic service order flow"],
        ],
        [40 * mm, usable - 40 * mm],
    ))

    story.append(heading("8. Decision cheat-sheet"))
    story.append(make_table(
        ["Question", "Answer"],
        [
            ["Free vs paid?", "accessType public → KB · paid → Library"],
            ["Where free file?", "Device only"],
            ["Where paid file?", "My Documents after complete"],
            ["Who is author?", "lawyerProfileId on template"],
            ["Custom assignee?", "Same lawyerProfileId on request"],
            ["Reactivate template?", "PUT/PATCH { isActive: true }"],
        ],
        [42 * mm, usable - 42 * mm],
    ))

    story.append(heading("9. Frontend checklist"))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "Admin publish sends lawyerProfileId; catalog echoes it"],
            ["2", "Knowledge Bank never writes My Documents"],
            ["3", "Paid: catalog → purchase → complete → documents → download"],
            ["4", "Handle owned / alreadyOwned on cards"],
            ["5", "Custom Doc locks assignee from template lawyerProfileId"],
            ["6", "Shared pagination for Library + My Documents + Admin"],
            ["7", "Do not call removed POST /library/templates/:slug/download"],
        ],
        [12 * mm, usable - 12 * mm],
    ))
    story.append(Spacer(1, 4 * mm))
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
        title="NexusLexis — Document Library End-to-End Flow",
        author="NexusLexis Backend",
        subject="NL-FE-LIB-FLOW-001",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
