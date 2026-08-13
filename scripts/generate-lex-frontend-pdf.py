"""Branded PDF: NexusLexis LEX AI Frontend Integration (NL-FE-LEX-001)."""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    Flowable,
    KeepTogether,
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
OUT = ROOT / "docs" / "LEX_AI_Frontend_API.pdf"

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
    ss.add(ParagraphStyle(
        "CoverKicker", fontName=BOLD, fontSize=9, textColor=GOLD,
        alignment=TA_LEFT, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "CoverTitle", fontName=BOLD, fontSize=28, leading=34, textColor=white,
        spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "CoverSub", fontName=BODY, fontSize=12, leading=17, textColor=HexColor("#D5DEEA"),
        spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        "CoverMeta", fontName=BODY, fontSize=9.5, leading=14, textColor=HexColor("#B7C3D4"),
    ))
    ss.add(ParagraphStyle(
        "H1", fontName=BOLD, fontSize=14, leading=18, textColor=NAVY,
        spaceBefore=14, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "H2", fontName=BOLD, fontSize=11.5, leading=15, textColor=NAVY_MID,
        spaceBefore=10, spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        "BodyText2", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE,
        alignment=TA_JUSTIFY, spaceAfter=6,
    ))
    ss.add(ParagraphStyle(
        "BulletBody", fontName=BODY, fontSize=9.5, leading=13.5, textColor=SLATE,
        leftIndent=2, spaceAfter=2,
    ))
    ss.add(ParagraphStyle(
        "Small", fontName=BODY, fontSize=8.5, leading=12, textColor=MUTED,
    ))
    ss.add(ParagraphStyle(
        "Th", fontName=BOLD, fontSize=8.2, leading=11, textColor=white,
    ))
    ss.add(ParagraphStyle(
        "Td", fontName=BODY, fontSize=8.2, leading=11.4, textColor=SLATE,
    ))
    ss.add(ParagraphStyle(
        "TdBold", fontName=BOLD, fontSize=8.2, leading=11.4, textColor=NAVY,
    ))
    ss.add(ParagraphStyle(
        "CodeBox", fontName="Courier", fontSize=8, leading=11.2, textColor=HexColor("#E8EEF7"),
        backColor=CODE_BG, leftIndent=6, rightIndent=6, spaceBefore=4, spaceAfter=8,
    ))
    ss.add(ParagraphStyle(
        "Callout", fontName=BODY, fontSize=9, leading=13, textColor=NAVY,
    ))
    ss.add(ParagraphStyle(
        "TocItem", fontName=BODY, fontSize=10, leading=16, textColor=SLATE,
    ))
    ss.add(ParagraphStyle(
        "Footer", fontName=BODY, fontSize=8, textColor=MUTED, alignment=TA_CENTER,
    ))
    ss.add(ParagraphStyle(
        "CenterWhite", fontName=BODY, fontSize=9, textColor=HexColor("#C5D0DE"),
        alignment=TA_CENTER,
    ))
    return ss


S = styles()


class GoldRule(Flowable):
    def __init__(self, width=None, color=GOLD, thickness=1.6):
        super().__init__()
        self.rule_width = width
        self.color = color
        self.thickness = thickness
        self.height = thickness + 2

    def wrap(self, aw, ah):
        self.width = self.rule_width or aw
        return self.width, self.height

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 1, self.width, 1)


class CalloutBox(Flowable):
    def __init__(self, text: str, bg=CREAM, accent=GOLD, icon="NOTE"):
        super().__init__()
        self.text = text
        self.bg = bg
        self.accent = accent
        self.icon = icon
        self._p = None
        self._h = 0

    def wrap(self, aw, ah):
        self.width = aw
        inner = aw - 16
        self._p = Paragraph(
            f"<b>{self.icon}</b> &nbsp; {self.text}",
            S["Callout"],
        )
        w, h = self._p.wrap(inner, ah)
        self._h = h + 14
        self.height = self._h
        return aw, self._h

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg)
        c.roundRect(0, 0, self.width, self._h, 4, fill=1, stroke=0)
        c.setFillColor(self.accent)
        c.rect(0, 0, 3.2, self._h, fill=1, stroke=0)
        self._p.drawOn(c, 10, 7)


class CodeBlock(Flowable):
    def __init__(self, text: str):
        super().__init__()
        self.raw = text.strip("\n")
        self._paras = []
        self._h = 0

    def wrap(self, aw, ah):
        self.width = aw
        style = ParagraphStyle(
            "CodeLine", fontName="Courier", fontSize=7.6, leading=10.4,
            textColor=HexColor("#E4ECF6"),
        )
        y = 0
        self._paras = []
        for line in self.raw.splitlines() or [""]:
            esc = (
                line.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace(" ", "&nbsp;")
            )
            p = Paragraph(esc or "&nbsp;", style)
            w, h = p.wrap(aw - 16, ah)
            self._paras.append((p, h))
            y += h
        self._h = y + 14
        self.height = self._h
        return aw, self._h

    def draw(self):
        c = self.canv
        c.setFillColor(CODE_BG)
        c.roundRect(0, 0, self.width, self._h, 4, fill=1, stroke=0)
        y = self._h - 8
        for p, h in self._paras:
            y -= h
            p.drawOn(c, 8, y)


class FlowDiagram(Flowable):
    """Horizontal 4-step pipeline for cover/body."""

    STEPS = [
        ("1", "Intro?", "Canned reply"),
        ("2", "Law?", "Else refuse"),
        ("3", "Bank", "TF-IDF + embed"),
        ("4", "LLM", "Rewrite or direct"),
    ]

    def wrap(self, aw, ah):
        self.width = aw
        self.height = 52
        return aw, self.height

    def draw(self):
        c = self.canv
        n = len(self.STEPS)
        gap = 10
        box_w = (self.width - gap * (n - 1)) / n
        h = 48
        for i, (num, title, sub) in enumerate(self.STEPS):
            x = i * (box_w + gap)
            c.setFillColor(NAVY if i == n - 1 else NAVY_MID)
            c.roundRect(x, 0, box_w, h, 5, fill=1, stroke=0)
            c.setFillColor(GOLD)
            c.circle(x + 12, h - 14, 7, fill=1, stroke=0)
            c.setFillColor(NAVY)
            c.setFont(BOLD, 8)
            c.drawCentredString(x + 12, h - 17, num)
            c.setFillColor(white)
            c.setFont(BOLD, 9)
            c.drawString(x + 24, h - 18, title)
            c.setFillColor(HexColor("#C9D4E4"))
            c.setFont(BODY, 7.4)
            c.drawString(x + 24, 10, sub)
            if i < n - 1:
                c.setFillColor(GOLD)
                c.rect(x + box_w + 2, h / 2 - 1, gap - 4, 2, fill=1, stroke=0)


def make_table(headers, rows, col_widths):
    head = [Paragraph(h, S["Th"]) for h in headers]
    data = [head]
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            style = S["TdBold"] if i == 0 else S["Td"]
            cells.append(Paragraph(str(cell), style))
        data.append(cells)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
        ("ROUNDEDCORNERS", [2, 2, 2, 2]),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
        else:
            cmds.append(("BACKGROUND", (0, i), (-1, i), white))
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
        bulletFontName=BOLD,
        bulletFontSize=9,
        spaceBefore=2,
        spaceAfter=6,
    )


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
    canvas.drawString(MARGIN_L, PAGE_H - 8.2 * mm, "NEXUSLEXIS  ·  LEX AI")
    canvas.setFont(BODY, 8)
    canvas.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 8.2 * mm, "NL-FE-LEX-001  ·  Frontend")

    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 12 * mm, PAGE_W, 1.1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 8)
    canvas.drawString(MARGIN_L, 5 * mm, "Internal  ·  nexuslexis.law  ·  13 August 2026")
    canvas.drawRightString(PAGE_W - MARGIN_R, 5 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


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

    # gold accent bar left
    canvas.setFillColor(GOLD)
    canvas.rect(0, 38 * mm, 6, PAGE_H - 86 * mm, fill=1, stroke=0)

    canvas.setFillColor(HexColor("#0A1930"))
    canvas.roundRect(MARGIN_L, 22 * mm, PAGE_W - MARGIN_L - MARGIN_R, 18 * mm, 4, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.setFont(BOLD, 8)
    canvas.drawString(MARGIN_L + 8, 32 * mm, "PRODUCTION BASE")
    canvas.setFillColor(HexColor("#D5DEEA"))
    canvas.setFont("Courier", 8)
    canvas.drawString(MARGIN_L + 8, 26 * mm, "https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex")
    canvas.restoreState()


def build():
    story = []
    usable = PAGE_W - MARGIN_L - MARGIN_R

    # —— COVER content (drawn over navy via afterFlowable spacer) ——
    story.append(Spacer(1, 58 * mm))
    story.append(Paragraph("FRONTEND INTEGRATION GUIDE", S["CoverKicker"]))
    story.append(Paragraph("LEX AI Chat APIs", S["CoverTitle"]))
    story.append(GoldRule())
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Working contract, request/response shapes, chat widget flow, lawyer metering, "
        "timeouts, and UI rules for the NexusLexis legal assistant.",
        S["CoverSub"],
    ))
    story.append(Spacer(1, 10 * mm))
    story.append(FlowDiagram())
    story.append(Spacer(1, 14 * mm))
    meta = (
        "<b>Document ID</b>&nbsp;&nbsp;NL-FE-LEX-001<br/>"
        "<b>Version</b>&nbsp;&nbsp;1.6 &nbsp;&nbsp;·&nbsp;&nbsp; <b>Date</b>&nbsp;&nbsp;13 August 2026<br/>"
        "<b>Owner</b>&nbsp;&nbsp;NexusLexis Backend<br/>"
        "<b>Applies to</b>&nbsp;&nbsp;Client chat widget only"
    )
    story.append(Paragraph(meta, S["CoverMeta"]))
    story.append(PageBreak())

    # —— TOC ——
    story.append(heading("Contents"))
    story.append(GoldRule())
    toc = [
        "1. Purpose & environment",
        "2. Architecture — REST only in production",
        "3. Client chat widget flow",
        "4. POST /chat/ contract",
        "5. Reply decision flow",
        "6. Length, timing & timeouts",
        "7. Chat history — New chat + sidebar (server)",
        "8. UI contract & errors",
        "9. Sample TypeScript",
        "10. Smoke test & acceptance checklist",
        "11. API index",
    ]
    for item in toc:
        story.append(Paragraph(item, S["TocItem"]))
    story.append(Spacer(1, 4 * mm))
    story.append(CalloutBox(
        "Production chat is <b>REST JSON</b>. Do not open WebSockets. "
        "Guests get <b>4 free prompts</b>; the 5th returns <font face='Courier'>401 LEX_LOGIN_REQUIRED</font>. "
        "Logged-in clients are unlimited. History: <font face='Courier'>POST/GET/DELETE /sessions/</font>.",
        bg=OK_BG, accent=TEAL, icon="START HERE",
    ))

    # —— 1 ——
    story.append(heading("1. Purpose & environment"))
    story.append(body(
        "LEX is the NexusLexis legal assistant. It answers Pakistani law questions in English, "
        "Urdu, or Roman Urdu. It is <b>not a licensed advocate</b> — the widget must always show a disclaimer. "
        "This document is the frontend working contract."
    ))
    story.append(CodeBlock(
        "VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex\n"
        "VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2"
    ))
    story.append(make_table(
        ["Who", "Call"],
        [
            ["Public / client widget", "{VITE_LEX_API_BASE_URL}/chat/"],
        ],
        [55 * mm, usable - 55 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(CalloutBox(
        "Do <b>not</b> set VITE_LEX_WS_URL for production. "
        "ws://…/api/lex/ws exists only on local Main API. Vercel serverless has no sockets.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="DO NOT",
    ))

    # —— 2 ——
    story.append(heading("2. Architecture — REST only in production"))
    story.append(body(
        "The browser always talks to the <b>Main API on Vercel</b>. Production is <b>Vercel only</b> — "
        "Main + Auth. LEX chat runs <b>inline</b> on that same Main API (Node + Gemini)."
    ))
    story.append(CodeBlock(
        "Frontend\n"
        "   POST /api/v1/lex/chat/   { message, session_key }\n"
        "        │\n"
        "        ▼\n"
        "Main API  (Vercel)\n"
        "   nexus-lexis-backend-ql8w.vercel.app\n"
        "   LEX_MODE=inline  →  Node + Gemini + question bank\n"
        "\n"
        "Auth API  (Vercel)\n"
        "   nexus-lexis-backend-45v4.vercel.app"
    ))
    story.append(make_table(
        ["Service", "Production URL"],
        [
            ["Main API + LEX", "https://nexus-lexis-backend-ql8w.vercel.app"],
            ["Auth API", "https://nexus-lexis-backend-45v4.vercel.app"],
        ],
        [50 * mm, usable - 50 * mm],
    ))

    # —— 3 ——
    story.append(heading("3. Client chat widget flow"))
    story.append(bullets([
        "On open: show a local greeting, or send <font face='Courier'>Hello</font>.",
        "Create <b>one</b> <font face='Courier'>session_key</font> per thread: <font face='Courier'>session_${Date.now()}_${rand}</font>.",
        "Optimistic user bubble → typing indicator → POST /chat/.",
        "Render <font face='Courier'>response</font>. If <font face='Courier'>language === \"UR\"</font>, set <font face='Courier'>dir=\"rtl\"</font>.",
        "If <font face='Courier'>show_lawyer === true</font>, show CTA → <font face='Courier'>/find-a-lawyer</font>.",
        "Track <font face='Courier'>guestPromptsRemaining</font>; at 0 show login before next send.",
        "Persist <font face='Courier'>owner_key</font> (guest uuid) so the 4-prompt counter stays accurate.",
    ]))
    story.append(body(
        "<b>Auth:</b> guests may chat without JWT (max 4 prompts). After login, send "
        "<font face='Courier'>Authorization: Bearer</font> — unlimited."
    ))

    # —— 4 ——
    story.append(heading("4. POST /chat/ contract"))
    story.append(Paragraph("4.1 Request", S["H2"]))
    story.append(CodeBlock(
        "POST https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex/chat/\n"
        "Content-Type: application/json\n"
        "X-Lex-Owner: guest_8f3a…          // guests — keep stable\n"
        "// Authorization: Bearer <token>  // logged-in — unlimited\n"
        "\n"
        "{\n"
        '  "message": "How do I register a company in Pakistan?",\n'
        '  "session_key": "session_1723280000000_ab12",\n'
        '  "owner_key": "guest_8f3a…"\n'
        "}"
    ))
    story.append(make_table(
        ["Field", "Required", "Notes"],
        [
            ["message", "Yes", "Non-empty. Empty → 400 { \"error\": \"Message is required\" }"],
            ["session_key", "Recommended", "Stable id for this conversation thread"],
            ["owner_key", "Guest", "Or header X-Lex-Owner. Logged-in users: JWT sets user:&lt;id&gt;"],
        ],
        [32 * mm, 28 * mm, usable - 60 * mm],
    ))
    story.append(Paragraph("4.2 Success (200)", S["H2"]))
    story.append(CodeBlock(
        "{\n"
        '  "response": "To register a private limited company in Pakistan…",\n'
        '  "language": "EN",\n'
        '  "register": "PLAIN",\n'
        '  "show_lawyer": false,\n'
        '  "guestPromptLimit": 4,\n'
        '  "guestPromptsUsed": 1,\n'
        '  "guestPromptsRemaining": 3,\n'
        '  "loginRequired": false\n'
        "}"
    ))
    story.append(make_table(
        ["Field", "Type", "Frontend use"],
        [
            ["response", "string", "Bot bubble. Wrap as paragraphs; no HTML from server."],
            ["language", "EN | UR", "UR → RTL + Urdu-capable font on that bubble"],
            ["register", "PLAIN | LEGAL", "Optional “Legal terms” badge"],
            ["show_lawyer", "boolean", "true → Find a Lawyer CTA"],
            ["guestPromptsRemaining", "number", "Guests only. Show “N free left”. Logged-in: omitted"],
            ["loginRequired", "boolean", "true only on 401 (limit hit)"],
        ],
        [42 * mm, 28 * mm, usable - 70 * mm],
    ))
    story.append(Paragraph("4.3 Guest limit (401)", S["H2"]))
    story.append(CalloutBox(
        "Without login, max <b>4</b> prompts per <font face='Courier'>owner_key</font>. "
        "5th POST returns <font face='Courier'>401</font> — open login/signup. After JWT, unlimited.",
        bg=WARN_BG, accent=HexColor("#C0392B"), icon="GUEST LIMIT",
    ))
    story.append(CodeBlock(
        "{\n"
        '  "error": "Login required to continue using LEX",\n'
        '  "code": "LEX_LOGIN_REQUIRED",\n'
        '  "loginRequired": true,\n'
        '  "guestPromptLimit": 4,\n'
        '  "guestPromptsUsed": 4,\n'
        '  "guestPromptsRemaining": 0\n'
        "}"
    ))

    # —— 5 ——
    story.append(heading("5. Reply decision flow"))
    story.append(body(
        "Same <font face='Courier'>POST /chat/</font> for every message. LEX decides internally — "
        "the frontend always renders <font face='Courier'>response</font>."
    ))
    story.append(CodeBlock(
        "User asks a question\n"
        "        │\n"
        "        ▼\n"
        "1. Introductory?  (Hi / Salam / Who are you / What is LEX?)\n"
        "        │ yes → canned intro reply. STOP.  No LLM. No bank.\n"
        "        │ no\n"
        "        ▼\n"
        "2. Law-related?\n"
        "        │ no  → “I can only answer law-related questions.” STOP.\n"
        "        │        No LLM. No bank.\n"
        "        │ yes\n"
        "        ▼\n"
        "3. Search Question Bank\n"
        "        • TF-IDF on the verified sheet (fast)\n"
        "        • Embeddings of bank questions (when background index is ready)\n"
        "        Match user question ↔ bank Q&A\n"
        "        │\n"
        "        ├─ HIT  → 4a. Pass verified Q+A into LLM.\n"
        "        │           LLM only forms sentence structure —\n"
        "        │           does not invent facts beyond the sheet.\n"
        "        │\n"
        "        └─ MISS → 4b. Connect to LLM (Gemini) directly\n"
        "                    for general Pakistani law."
    ))
    story.append(make_table(
        ["Step", "Condition", "What LEX returns", "LLM?"],
        [
            ["1 Intro", "Greeting / who-is-LEX", "Fixed intro text", "No"],
            ["2 Refuse", "Neither intro nor law", "Polite “I can’t answer — ask a law question.”", "No"],
            ["3+4a Bank hit", "Law + match in question bank", "LLM rewrite of the verified sheet answer", "Yes — structure only"],
            ["4b Bank miss", "Law + nothing in the bank", "LLM from general Pakistani legal knowledge", "Yes — direct"],
        ],
        [32 * mm, 48 * mm, 62 * mm, usable - 142 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(body(
        "Urgency words (<font face='Courier'>FIR</font>, court, sue, police, عدالت…) set "
        "<font face='Courier'>show_lawyer: true</font> on law answers."
    ))
    story.append(CalloutBox(
        "LEX will <b>not</b> quote exact SECP / FBR filing fees. It tells the user to use the "
        "platform <b>Fee Calculator</b>. Wire that CTA if the route exists.",
        bg=CREAM, accent=GOLD, icon="PRODUCT",
    ))

    # —— 6 ——
    story.append(heading("6. Length, timing & timeouts"))
    story.append(body(
        "There is <b>one</b> generation cap: <font face='Courier'>LLM_MAX_TOKENS = 400</font> "
        "(about 1,200–1,800 English characters). There is no separate short/long API. "
        "Replies are <b>not streamed</b> — one JSON body when ready."
    ))
    story.append(make_table(
        ["Reply type", "Typical length", "Typical time (production)"],
        [
            ["Short — hello / off-topic", "150–350 characters", "0.3–0.8 seconds"],
            ["Long — legal question", "800–2,000 characters", "2–6 seconds (measured ~2.8s)"],
        ],
        [55 * mm, 50 * mm, usable - 105 * mm],
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(make_table(
        ["Timeout", "Value"],
        [
            ["Frontend abort (recommended)", "45–60 seconds"],
            ["Backend LLM generation", "60 seconds"],
            ["Vercel Hobby hard stop", "~10 seconds if the isolate is slow — show Retry"],
        ],
        [70 * mm, usable - 70 * mm],
    ))

    # —— 7 ——
    story.append(heading("7. Chat history — session_key + localStorage"))
    story.append(body(
        "On <b>live Vercel</b>, LEX does <b>not</b> persist threads on the server. "
        "Keep history in <font face='Courier'>localStorage</font>. Still send one "
        "<font face='Courier'>session_key</font> per thread:"
    ))
    story.append(bullets([
        "Same <font face='Courier'>session_key</font> for the whole conversation.",
        "Append the user bubble + <font face='Courier'>response</font> locally after each 200.",
        "Title the thread from the first message (trim to ~50 characters).",
    ]))
    story.append(body(
        "Use the <b>same</b> <font face='Courier'>session_key</font> for the whole thread. "
        "A new key = a new conversation (blank memory + new sidebar item)."
    ))
    story.append(Paragraph("7.1 List threads (sidebar)", S["H2"]))
    story.append(CodeBlock("GET {VITE_LEX_API_BASE_URL}/sessions/"))
    story.append(CodeBlock(
        "[\n"
        "  {\n"
        '    "id": 1723280000000,\n'
        '    "session_key": "session_1723280000000_ab12",\n'
        '    "title": "How do I register a company…",\n'
        '    "created_at": "2026-08-10T11:02:01.123456+00:00",\n'
        '    "messages": []\n'
        "  }\n"
        "]"
    ))
    story.append(body(
        "List items always have <font face='Courier'>messages: []</font>. Load the thread with the detail call. "
        "<b>Privacy:</b> the list is <b>not filtered by logged-in user</b>. Do not render the full array as "
        "“My chats”. Keep keys this browser created and only fetch those."
    ))
    story.append(Paragraph("7.2 Load one thread", S["H2"]))
    story.append(CodeBlock("GET {VITE_LEX_API_BASE_URL}/sessions/:session_key/"))
    story.append(CodeBlock(
        "{\n"
        '  "session_key": "session_1723280000000_ab12",\n'
        '  "title": "How do I register a company…",\n'
        '  "messages": [\n'
        '    { "id": "u_12", "sender": "user", "text": "How do I register a company in Pakistan?" },\n'
        "    {\n"
        '      "id": "l_12", "sender": "lex",\n'
        '      "text": "To register a private limited company…",\n'
        '      "showReferral": false,\n'
        '      "referralLabel": "Find a Lawyer →",\n'
        '      "referralType": "lawyer"\n'
        "    }\n"
        "  ]\n"
        "}"
    ))
    story.append(make_table(
        ["Field", "Frontend use"],
        [
            ["sender", "user | lex"],
            ["text", "Bubble copy"],
            ["showReferral", "Same as chat show_lawyer"],
            ["referralLabel", "Ready-made CTA (EN / UR)"],
            ["referralType", "lawyer → /find-a-lawyer"],
        ],
        [40 * mm, usable - 40 * mm],
    ))
    story.append(Spacer(1, 2 * mm))
    story.append(body("Unknown key → <b>404</b> <font face='Courier'>{ \"error\": \"Session not found\" }</font>."))
    story.append(Paragraph("7.3 Suggested UI flow", S["H2"]))
    story.append(CodeBlock(
        "Open LEX\n"
        "  ├─ Read localStorage.lexSessionKeys[]\n"
        "  ├─ For each key → GET /sessions/:key/   (skip 404s)\n"
        "  └─ Sidebar = titles; click = render messages[]\n"
        "\n"
        "Send message\n"
        "  ├─ POST /chat/ { message, session_key }\n"
        "  ├─ Append user + lex bubbles from the 200 body\n"
        "  └─ Save the updated thread in localStorage\n"
        "\n"
        "New chat → mint a new session_key"
    ))
    story.append(CalloutBox(
        "<b>Client widget only.</b> New chat = <font face='Courier'>POST /sessions/</font>. "
        "Sidebar = <font face='Courier'>GET /sessions/</font>. Persist <font face='Courier'>owner_key</font> or send a client JWT.",
        bg=OK_BG, accent=TEAL, icon="HISTORY",
    ))

    # —— 8 ——
    story.append(heading("8. UI contract & errors"))
    story.append(bullets([
        "<b>Disclaimer (always):</b> “LEX provides general legal information for Pakistan. It is not a substitute for a licensed advocate.”",
        "<b>RTL:</b> <font face='Courier'>language === \"UR\"</font> on that bubble only (user EN + bot UR can mix).",
        "<b>Find a Lawyer labels:</b> EN “Find a Lawyer →” · UR “وکیل تلاش کریں ←”.",
        "<b>Off-topic:</b> render <font face='Courier'>response</font> as-is. Do not auto-retry.",
        "<b>400</b> empty message · <b>502</b> LEX down · abort/timeout → “LEX is temporarily unavailable. Try again.”",
        "Always use the Vercel Main URL above. Do not call any other LEX host.",
    ]))

    # —— 10 ——
    story.append(heading("9. Sample TypeScript"))
    story.append(CodeBlock(
        "const LEX = import.meta.env.VITE_LEX_API_BASE_URL;\n"
        "\n"
        "export async function askLex(message: string, sessionKey: string, signal?: AbortSignal) {\n"
        "  const res = await fetch(`${LEX}/chat/`, {\n"
        "    method: 'POST',\n"
        "    headers: { 'Content-Type': 'application/json' },\n"
        "    body: JSON.stringify({ message, session_key: sessionKey }),\n"
        "    signal,\n"
        "  });\n"
        "  if (!res.ok) {\n"
        "    const err = await res.json().catch(() => ({}));\n"
        "    throw new Error(err.error || `LEX HTTP ${res.status}`);\n"
        "  }\n"
        "  return res.json();\n"
        "}\n"
        "\n"
        "const ctrl = new AbortController();\n"
        "const t = setTimeout(() => ctrl.abort(), 45_000);\n"
        "try { await askLex(text, sessionKey, ctrl.signal); }\n"
        "finally { clearTimeout(t); }"
    ))

    # —— 11 ——
    story.append(heading("10. Smoke test & acceptance checklist"))
    story.append(Paragraph("Guest: 4 free prompts, then login:", S["H2"]))
    story.append(CodeBlock(
        "curl -s https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex/chat/ \\\n"
        "  -H \"Content-Type: application/json\" \\\n"
        "  -H \"X-Lex-Owner: guest_smoke_1\" \\\n"
        "  -d \"{\\\"message\\\":\\\"Hello\\\",\\\"session_key\\\":\\\"fe_smoke_1\\\",\\\"owner_key\\\":\\\"guest_smoke_1\\\"}\""
    ))
    story.append(body(
        "Expect a greeting + <font face='Courier'>guestPromptsRemaining</font>. "
        "After 4 sends, 5th → <font face='Courier'>401 LEX_LOGIN_REQUIRED</font>. "
        "With Bearer token, unlimited."
    ))
    story.append(make_table(
        ["#", "Check"],
        [
            ["1", "VITE_LEX_API_BASE_URL set (path already includes /api/v1/lex)"],
            ["2", "Widget POSTs …/chat/ with { message, session_key, owner_key }"],
            ["3", "Guest: show remaining; 401 → login modal"],
            ["4", "After login, send Bearer — unlimited prompts"],
            ["5", "Typing indicator 0.3–6s; abort ~45s"],
            ["6", "Urdu bubbles RTL; show_lawyer → Find a Lawyer"],
            ["7", "Disclaimer visible under the widget"],
            ["8", "Sidebar = GET /sessions/ with owner_key or client JWT"],
            ["9", "New chat = POST /sessions/"],
            ["10", "No WebSocket in the production build"],
        ],
        [14 * mm, usable - 14 * mm],
    ))

    # —— 12 ——
    story.append(heading("11. API index"))
    story.append(make_table(
        ["Method", "Path", "Auth", "Notes"],
        [
            ["POST", "/api/v1/lex/chat/", "Public (4) / JWT", "Guest limit 4; JWT unlimited"],
            ["POST", "/api/v1/lex/sessions/", "Public / client JWT", "New chat"],
            ["GET", "/api/v1/lex/sessions/", "Public / client JWT", "History sidebar"],
            ["GET", "/api/v1/lex/sessions/:key/", "Public / client JWT", "Open thread"],
            ["DELETE", "/api/v1/lex/sessions/:key/", "Public / client JWT", "Delete thread"],
        ],
        [22 * mm, 62 * mm, 38 * mm, usable - 122 * mm],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph("Deleted / do not use", S["H2"]))
    story.append(make_table(
        ["Method", "Path", "Why"],
        [["WS", "/api/lex/ws", "Local dev only — Vercel has no WebSockets"]],
        [22 * mm, 45 * mm, usable - 67 * mm],
    ))
    story.append(Spacer(1, 8 * mm))
    story.append(CalloutBox(
        "Questions: backend repo NexusLexisBackend · contact@nexuslexis.law. "
        "Companion docs: Frontend_Production_Handoff · Frontend_Google_and_MainAPI_Flow.",
        bg=OK_BG, accent=TEAL, icon="HANDOFF",
    ))

    def first_page(canvas, doc):
        cover_page(canvas, doc)

    def later_pages(canvas, doc):
        on_page(canvas, doc)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T + 4 * mm,
        bottomMargin=MARGIN_B + 4 * mm,
        title="NexusLexis — LEX AI Frontend Integration",
        author="NexusLexis Backend",
        subject="NL-FE-LEX-001 v1.6",
    )
    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
