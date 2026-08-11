"""Branded PDF: LEX Chat History API (NL-FE-LEX-HIST-001)."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "LEX_Chat_History_API.pdf"

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
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=26, leading=32, textColor=white, spaceAfter=8))
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
    canvas.drawString(MARGIN_L + 8, 32 * mm, "LEX BASE")
    canvas.setFillColor(HexColor("#D5DEEA"))
    canvas.setFont("Courier", 7.4)
    canvas.drawString(MARGIN_L + 8, 26 * mm, "https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex")
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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  LEX CHAT HISTORY")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-LEX-HIST-001")
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
    story.append(Paragraph("FRONTEND API CONTRACT", S["CoverKicker"]))
    story.append(Paragraph("LEX Chat History", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "New chat, sidebar history, open thread, delete, and persisted POST /chat/. "
        "History lives on the Main API (Postgres). REST only — no sockets.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 14 * mm))
    story.append(Paragraph(
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-LEX-HIST-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.0 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;11 August 2026",
        S["CoverMeta"],
    ))
    story.append(PageBreak())

    story.append(heading("1. Changelog"))
    story.append(GoldRule())
    story.append(Paragraph("Added", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Purpose"],
        [
            ["POST", "/sessions/", "New chat — empty thread + session_key"],
            ["GET", "/sessions/", "History sidebar — this owner’s threads"],
            ["GET", "/sessions/:session_key/", "Open one thread (user + LEX turns)"],
            ["DELETE", "/sessions/:session_key/", "Delete a thread"],
        ],
        [24 * mm, 58 * mm, usable - 82 * mm],
    ))
    story.append(Paragraph("Updated", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Change"],
        [["POST", "/chat/", "Saves every turn. Returns session_key, owner_key, title. Last 5 turns → LLM."]],
        [24 * mm, 28 * mm, usable - 52 * mm],
    ))
    story.append(Paragraph("Deleted", S["H2"]))
    story.append(body("None. <font face='Courier'>GET /sessions/</font> is no longer an empty stub."))

    story.append(heading("2. Product flow"))
    story.append(CodeBlock(
        "Open LEX\n"
        "  mint owner_key = guest_ + uuid   (localStorage)\n"
        "  GET /sessions/?owner_key=…       → sidebar\n"
        "\n"
        "New chat\n"
        "  POST /sessions/  { owner_key }\n"
        "  → session_key, title \"New chat\"\n"
        "  POST /chat/  { message, session_key, owner_key }\n"
        "  → response; server stores both turns; title = first message\n"
        "\n"
        "Open old thread\n"
        "  GET /sessions/:session_key/?owner_key=…\n"
        "  → messages[]   sender user | lex"
    ))
    story.append(CalloutBox(
        "Logged-in: send <font face='Courier'>Authorization: Bearer</font>. "
        "Owner becomes <font face='Courier'>user:&lt;id&gt;</font>. Do not mix guest and user owners.",
        bg=OK_BG, accent=TEAL, icon="AUTH",
    ))

    story.append(heading("3. Owner (required for history)"))
    story.append(make_table(
        ["Who", "How"],
        [
            ["Guest", "JSON owner_key or header X-Lex-Owner"],
            ["Logged in", "JWT only — backend sets user:&lt;id&gt;"],
        ],
        [35 * mm, usable - 35 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(body(
        "No owner → <font face='Courier'>GET /sessions/</font> is <b>[]</b>. "
        "Chat still works; if the server returns <font face='Courier'>owner_key</font>, save it."
    ))

    story.append(heading("4. New chat"))
    story.append(CodeBlock(
        "POST /api/v1/lex/sessions/\n"
        "X-Lex-Owner: guest_8f3a…\n"
        '{ "owner_key": "guest_8f3a…", "title": "New chat" }\n'
        "\n"
        "201 { session_key, owner_key, title: \"New chat\", messages: [] }"
    ))

    story.append(heading("5. Send a message (saved)"))
    story.append(CodeBlock(
        "POST /api/v1/lex/chat/\n"
        "{\n"
        '  "message": "What is an FIR?",\n'
        '  "session_key": "session_1786457021479_0678f44a",\n'
        '  "owner_key": "guest_8f3a…"\n'
        "}\n"
        "\n"
        "200 adds: session_key, owner_key, title\n"
        "Omit session_key → server creates one and returns it."
    ))

    story.append(heading("6. List / open / delete"))
    story.append(make_table(
        ["Call", "Use"],
        [
            ["GET /sessions/?owner_key=", "Sidebar. messages always []. turnCount on each row."],
            ["GET /sessions/:key/", "Bubbles: sender user|lex, text, showReferral, referralLabel"],
            ["DELETE /sessions/:key/", "Remove thread. Wrong owner → 404."],
        ],
        [52 * mm, usable - 52 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(body(
        "List item title = first user message (max 50 chars). "
        "Urdu bubble: <font face='Courier'>language === \"UR\"</font> → RTL. "
        "<font face='Courier'>showReferral</font> / chat <font face='Courier'>show_lawyer</font> → Find a Lawyer."
    ))

    story.append(heading("7. Checklist"))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "Persist owner_key (guest uuid) or send JWT"],
            ["2", "New chat = POST /sessions/"],
            ["3", "Sidebar = GET /sessions/"],
            ["4", "Open = GET /sessions/:key/"],
            ["5", "Send = POST /chat/ with same session_key"],
            ["6", "No WebSocket in production"],
        ],
        [14 * mm, usable - 14 * mm],
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(CalloutBox(
        "Client widget only. Local: <font face='Courier'>http://localhost:3000/api/v1/lex</font>.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="DEPLOY",
    ))

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T + 4 * mm,
        bottomMargin=MARGIN_B + 4 * mm,
        title="NexusLexis — LEX Chat History API",
        author="NexusLexis Backend",
        subject="NL-FE-LEX-HIST-001",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
