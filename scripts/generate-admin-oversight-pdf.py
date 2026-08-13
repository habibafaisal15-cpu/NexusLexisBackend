"""Branded PDF: Admin Appointment Oversight API (NL-FE-ADMIN-OVERSIGHT-001)."""
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
OUT = ROOT / "docs" / "Admin_Appointment_Oversight_API.pdf"

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
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=24, leading=30, textColor=white, spaceAfter=8))
    ss.add(ParagraphStyle("CoverSub", fontName=BODY, fontSize=11.5, leading=16, textColor=HexColor("#D5DEEA")))
    ss.add(ParagraphStyle("CoverMeta", fontName=BODY, fontSize=9.5, leading=14, textColor=HexColor("#B7C3D4")))
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=14, leading=18, textColor=NAVY, spaceBefore=14, spaceAfter=8))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=11.5, leading=15, textColor=NAVY_MID, spaceBefore=10, spaceAfter=6))
    ss.add(ParagraphStyle("BodyText2", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE, alignment=TA_JUSTIFY, spaceAfter=6))
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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  ADMIN APPOINTMENT OVERSIGHT")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-ADMIN-OVERSIGHT-001")
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  13 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = []
    story.append(Spacer(1, 58 * mm))
    story.append(Paragraph("FRONTEND API CHANGELOG", S["CoverKicker"]))
    story.append(Paragraph("Admin Appointment Oversight", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Extend Admin → Appointment Oversight: paginated list, stat cards, detail drawer, "
        "reassign, assignable professionals. Same appointment rows as Client/Lawyer.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph(
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-ADMIN-OVERSIGHT-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.0 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;13 August 2026<br/>"
        "<b>Extends</b>&nbsp;&nbsp;NL-FE-ADMIN-APPT-001 &nbsp;·&nbsp; <b>Demo</b>&nbsp;&nbsp;admin@nexuslexis.law / admin123",
        S["CoverMeta"],
    ))
    story.append(PageBreak())

    story.append(heading("1. Changelog"))
    story.append(GoldRule())
    story.append(Paragraph("Added", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Purpose"],
        [
            ["GET", "/admin/appointments/stats", "Stat cards"],
            ["GET", "/admin/appointments/:id", "Detail drawer (timeline + audit)"],
            ["POST", "/admin/appointments/:id/reassign", "Assign another professional"],
            ["GET", "/admin/assignable-professionals", "Assign Lawyer modal list"],
        ],
        [22 * mm, 58 * mm, usable - 80 * mm],
    ))
    story.append(Paragraph("Updated", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Change"],
        [["GET", "/admin/appointments", "Paginated + filters + nested payment/assignment/meeting"]],
        [22 * mm, 48 * mm, usable - 70 * mm],
    ))
    story.append(Paragraph("Unchanged", S["H2"]))
    story.append(body(
        "Client <font face='Courier'>POST/GET /appointments</font>, Lawyer inbox, custom-docs deliver, "
        "and <font face='Courier'>PATCH /admin/appointments/:id</font> status aliases."
    ))

    story.append(heading("2. Auth"))
    story.append(CodeBlock(
        "Authorization: Bearer <adminJWT>\n"
        "X-Client-Role: Admin\n"
        "// RegistryStaff also accepted with mock JWT"
    ))

    story.append(heading("3. GET /admin/appointments — paginated list"))
    story.append(make_table(
        ["Param", "Notes"],
        [
            ["page, limit", "limit: 10 | 20 | 50 (default 20)"],
            ["search", "id, client name/email, professional name"],
            ["status", "pending, confirmed, completed, cancelled, …"],
            ["paymentStatus", "paid, pending, failed, refunded"],
            ["assignmentStatus", "assigned, reassignment_required, …"],
            ["mode", "video, in_person, phone, document"],
            ["attentionOnly", "true → attentionFlags.length > 0"],
            ["source", "consultation | custom_docs"],
        ],
        [38 * mm, usable - 38 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(CodeBlock(
        "{\n"
        '  "success": true,\n'
        '  "appointments": [ /* oversight item */ ],\n'
        '  "pagination": {\n'
        '    "page": 1, "limit": 20, "totalItems": 137,\n'
        '    "totalPages": 7, "hasNext": true, "hasPrev": false\n'
        "  }\n"
        "}"
    ))
    story.append(body("Reuse Library <font face='Courier'>CatalogPagination</font> — same shape."))

    story.append(heading("4. Oversight appointment object"))
    story.append(body(
        "Nested: <font face='Courier'>client</font>, <font face='Courier'>professional</font>, "
        "<font face='Courier'>payment</font>, <font face='Courier'>assignment</font>, "
        "<font face='Courier'>meeting</font>, <font face='Courier'>attentionFlags</font>, "
        "<font face='Courier'>acceptanceDeadline</font>, <font face='Courier'>acceptanceExpired</font>."
    ))
    story.append(body(
        "Flat aliases kept: <font face='Courier'>clientName</font>, <font face='Courier'>professionalName</font>, "
        "<font face='Courier'>lawyerName</font>, <font face='Courier'>timeSlot</font>, <font face='Courier'>brief</font>."
    ))
    story.append(make_table(
        ["Field", "Values"],
        [
            ["statusKey", "pending, confirmed, in_progress, completed, cancelled, rescheduled, no_show"],
            ["payment.status", "paid, pending, failed, refunded"],
            ["assignment.status", "assigned, pending_assignment, reassignment_required"],
            ["attentionFlags[]", "payment_issue, pending_confirmation, reassignment_required, acceptance_expired, …"],
        ],
        [42 * mm, usable - 42 * mm],
    ))

    story.append(heading("5. GET /admin/appointments/stats"))
    story.append(CodeBlock(
        '{\n'
        '  "success": true,\n'
        '  "stats": {\n'
        '    "total": 137, "pending": 42, "confirmed": 31, "today": 5,\n'
        '    "completed": 48, "cancelled": 11,\n'
        '    "needsReassignment": 3, "revenue": 1250000\n'
        "  }\n"
        "}"
    ))

    story.append(heading("6. GET /admin/appointments/:id"))
    story.append(body("Full object with <font face='Courier'>timeline[]</font> and <font face='Courier'>audit[]</font> for the drawer. 404 if unknown."))

    story.append(heading("7. PATCH /admin/appointments/:id"))
    story.append(make_table(
        ["UI", "PATCH body", "statusKey"],
        [
            ["Accept", "Accepted", "confirmed"],
            ["Reject", "Rejected", "cancelled"],
            ["Complete", "Completed", "completed"],
            ["No-show", "no_show", "no_show"],
            ["Reschedule", "rescheduled + slot/date", "rescheduled"],
        ],
        [28 * mm, 52 * mm, usable - 80 * mm],
    ))

    story.append(heading("8. POST /admin/appointments/:id/reassign"))
    story.append(CodeBlock(
        "POST /admin/appointments/14/reassign\n"
        "{\n"
        '  "professionalProfileId": "11",\n'
        '  "professionalType": "lawyer",\n'
        '  "note": "Acceptance window expired"\n'
        "}"
    ))
    story.append(body(
        "Resets status to <font face='Courier'>pending</font>, restarts acceptance window, "
        "updates lawyer inbox (old drops, new sees it). 400 invalid · 409 slot clash · 404 unknown."
    ))

    story.append(heading("9. GET /admin/assignable-professionals"))
    story.append(body(
        "Query: <font face='Courier'>professionalType</font>, <font face='Courier'>practiceArea</font>, "
        "<font face='Courier'>city</font>, <font face='Courier'>excludeProfileId</font>, <font face='Courier'>search</font>."
    ))

    story.append(heading("10. Frontend checklist"))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "Replace adminAppointmentsMock with GET /admin/appointments"],
            ["2", "Stat cards → GET /admin/appointments/stats"],
            ["3", "Drawer → GET /admin/appointments/:id"],
            ["4", "Assign modal → assignable-professionals + POST …/reassign"],
            ["5", "Status buttons → PATCH /admin/appointments/:id"],
            ["6", "Same pagination component as Library"],
            ["7", "Do not call GET /lawyer/appointments from Admin"],
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
        title="NexusLexis — Admin Appointment Oversight API",
        author="NexusLexis Backend",
        subject="NL-FE-ADMIN-OVERSIGHT-001",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
