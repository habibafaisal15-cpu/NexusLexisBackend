"""Branded PDF: Admin Appointments API for frontend (NL-FE-ADMIN-APPT-001)."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "Admin_Appointments_API.pdf"

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


def register_fonts() -> tuple[str, str]:
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
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=26, leading=32, textColor=white, spaceAfter=8))
    ss.add(ParagraphStyle("CoverSub", fontName=BODY, fontSize=11.5, leading=16, textColor=HexColor("#D5DEEA")))
    ss.add(ParagraphStyle("CoverMeta", fontName=BODY, fontSize=9.5, leading=14, textColor=HexColor("#B7C3D4")))
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=14, leading=18, textColor=NAVY, spaceBefore=14, spaceAfter=8))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=11.5, leading=15, textColor=NAVY_MID, spaceBefore=10, spaceAfter=6))
    ss.add(ParagraphStyle("BodyText2", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=6))
    ss.add(ParagraphStyle("BulletBody", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=8.2, leading=11, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=8.2, leading=11.4, textColor=SLATE))
    ss.add(ParagraphStyle("TdBold", fontName=BOLD, fontSize=8.2, leading=11.4, textColor=NAVY))
    ss.add(ParagraphStyle("Callout", fontName=BODY, fontSize=9, leading=13, textColor=NAVY))
    ss.add(ParagraphStyle("TocItem", fontName=BODY, fontSize=10, leading=16, textColor=SLATE))
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
        style = ParagraphStyle("CodeLine", fontName="Courier", fontSize=7.6, leading=10.4, textColor=HexColor("#E4ECF6"))
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


def heading(text, level=1):
    return Paragraph(text, S["H1"] if level == 1 else S["H2"])


def body(text):
    return Paragraph(text, S["BodyText2"])


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(i, S["BulletBody"]), leftIndent=12, bulletColor=GOLD) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=10,
        spaceAfter=6,
    )


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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  ADMIN APPOINTMENTS")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-ADMIN-APPT-001")
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  11 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = []
    story.append(Spacer(1, 58 * mm))
    story.append(Paragraph("FRONTEND API CHANGELOG", S["CoverKicker"]))
    story.append(Paragraph("Admin Appointments", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "What was added for the Admin → Appointments tab: list every booking, "
        "update status, auth rules, and the product flow. No existing client/lawyer APIs were removed.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph(
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-ADMIN-APPT-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.0 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;11 August 2026<br/>"
        "<b>Demo</b>&nbsp;&nbsp;admin@nexuslexis.law / admin123",
        S["CoverMeta"],
    ))
    story.append(PageBreak())

    story.append(heading("Contents"))
    story.append(GoldRule())
    for item in [
        "1. Changelog — added / updated / deleted",
        "2. Product flow",
        "3. Auth",
        "4. GET /admin/appointments",
        "5. PATCH /admin/appointments/:id",
        "6. Frontend wiring & checklist",
    ]:
        story.append(Paragraph(item, S["TocItem"]))
    story.append(Spacer(1, 4 * mm))
    story.append(CalloutBox(
        "Admin must <b>not</b> call <font face='Courier'>GET /lawyer/appointments</font> "
        "or log in as the demo lawyer. Use the two admin routes below.",
        bg=OK_BG, accent=TEAL, icon="START HERE",
    ))

    story.append(heading("1. Changelog — added / updated / deleted"))
    story.append(Paragraph("Added", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Purpose"],
        [
            ["GET", "/admin/appointments", "List all lawyer bookings (every client × lawyer)"],
            ["PATCH", "/admin/appointments/:appointmentId", "Update status / note / slot on any booking"],
        ],
        [22 * mm, 62 * mm, usable - 84 * mm],
    ))
    story.append(Paragraph("Updated", S["H2"]))
    story.append(body("None. <font face='Courier'>POST/GET /appointments</font> and lawyer appointment routes are unchanged."))
    story.append(Paragraph("Deleted / stop using on Admin", S["H2"]))
    story.append(make_table(
        ["Stop", "Why"],
        [
            ["GET /lawyer/appointments from Admin tab", "Only that lawyer’s inbox — not platform-wide"],
            ["Demo lawyer login workaround", "Replaced by real admin JWT + admin routes"],
        ],
        [85 * mm, usable - 85 * mm],
    ))

    story.append(heading("2. Product flow"))
    story.append(CodeBlock(
        "Client books\n"
        "   POST /appointments\n"
        "   or POST /documents/custom-requests   (source=custom_docs)\n"
        "        │\n"
        "        ▼\n"
        "appointments row   status = pending\n"
        "        │\n"
        "        ├─ Lawyer inbox     GET / PATCH  /lawyer/appointments/:id\n"
        "        │\n"
        "        └─ Admin panel      GET / PATCH  /admin/appointments/:id\n"
        "                 │\n"
        "                 ├─ Accept      →  confirmed\n"
        "                 ├─ Reject      →  cancelled\n"
        "                 ├─ Complete    →  completed\n"
        "                 └─ No-show     →  no_show"
    ))
    story.append(body(
        "Admin sees <b>every</b> booking. Status rules match lawyer PATCH "
        "(same aliases, same 400 <font face='Courier'>allowed</font> list)."
    ))

    story.append(heading("3. Auth"))
    story.append(CodeBlock(
        "Authorization: Bearer <accessToken>\n"
        "X-Client-Role: Admin"
    ))
    story.append(make_table(
        ["Token", "How"],
        [
            ["Real JWT", "POST {VITE_AUTH_API_URL}/login as admin → accessToken. role must be admin."],
            ["Local mock UI", "mock-jwt-token-… plus header X-Client-Role: Admin"],
        ],
        [32 * mm, usable - 32 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(body("Not admin → <b>403</b>. Missing token → <b>401</b>."))

    story.append(heading("4. GET /admin/appointments"))
    story.append(CodeBlock(
        "GET /api/v2/admin/appointments\n"
        "GET /api/v2/admin/appointments?status=pending\n"
        "GET /api/v2/admin/appointments?source=custom_docs\n"
        "GET /api/v2/admin/appointments?lawyerProfileId=1"
    ))
    story.append(body("Optional filters: <font face='Courier'>status</font>, <font face='Courier'>source</font>, <font face='Courier'>lawyerProfileId</font>."))
    story.append(make_table(
        ["UI column", "JSON field"],
        [
            ["ID", "id"],
            ["Client", "clientName + clientEmail"],
            ["Lawyer", "lawyerName || professionalName"],
            ["Source", "source"],
            ["Subject / brief", "subject || brief.subject || notes"],
            ["When", "date + time / timeSlot"],
            ["Mode", "modeLabel || mode"],
            ["Status", "status  (use statusKey in logic)"],
        ],
        [45 * mm, usable - 45 * mm],
    ))

    story.append(heading("5. PATCH /admin/appointments/:id"))
    story.append(CodeBlock(
        "PATCH /api/v2/admin/appointments/3\n"
        '{ "status": "Accepted" }'
    ))
    story.append(make_table(
        ["Button", "Send status", "Stored statusKey"],
        [
            ["Accept", "Accepted", "confirmed"],
            ["Reject", "Rejected", "cancelled"],
            ["Complete", "Completed", "completed"],
            ["No-show", "no_show", "no_show"],
        ],
        [35 * mm, 50 * mm, usable - 85 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(body(
        "Also accepted: pending, confirmed, cancelled, rescheduled, plus "
        "<font face='Courier'>slot</font> / <font face='Courier'>date</font> / "
        "<font face='Courier'>responseNote</font>."
    ))
    story.append(make_table(
        ["Code", "When"],
        [
            ["200", "{ success, status, statusKey, appointment }"],
            ["400", "Invalid status — body includes allowed[]"],
            ["404", "Unknown appointment id"],
            ["409", "Reschedule slot already taken"],
        ],
        [22 * mm, usable - 22 * mm],
    ))

    story.append(heading("6. Frontend wiring & checklist"))
    story.append(CodeBlock(
        "const BASE = import.meta.env.VITE_API_BASE_URL;\n"
        "\n"
        "GET  `${BASE}/admin/appointments`\n"
        "PATCH `${BASE}/admin/appointments/${id}`  { status }\n"
        "\n"
        "Headers:\n"
        "  Authorization: Bearer <token>\n"
        "  X-Client-Role: Admin"
    ))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "Admin token or mock + X-Client-Role: Admin"],
            ["2", "Appointments tab lists all bookings"],
            ["3", "Accept / Reject / Complete / No-show → PATCH then refresh"],
            ["4", "Non-admin token → 403"],
            ["5", "VITE_API_BASE_URL = production Main API (cover URL)"],
        ],
        [14 * mm, usable - 14 * mm],
    ))
    story.append(Spacer(1, 6 * mm))
    story.append(CalloutBox(
        "Production: <font face='Courier'>https://nexus-lexis-backend-ql8w.vercel.app/api/v2</font>. "
        "Local Main API: <font face='Courier'>http://localhost:3000/api/v2</font>.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="DEPLOY",
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T + 4 * mm,
        bottomMargin=MARGIN_B + 4 * mm,
        title="NexusLexis — Admin Appointments API",
        author="NexusLexis Backend",
        subject="NL-FE-ADMIN-APPT-001",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
