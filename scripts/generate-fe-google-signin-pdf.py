"""Generate FE Google Sign-In Netlify update PDF."""
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
OUT = ROOT / "docs" / "Frontend_Google_SignIn_Netlify_Update.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Frontend — Google Sign-In Update")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "New Client ID · Netlify env · redeploy checklist")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-GGL-002  ·  5 October 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Live FE: nexuslexis.netlify.app · nexuslexis.law")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "NL-FE-GGL-002 Google Sign-In Netlify Update")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("1. Why this doc", S["H1"]))
    story.append(Paragraph(
        "Backend rotated Google OAuth to a new Cloud project. Frontend must switch "
        "<b>VITE_GOOGLE_CLIENT_ID</b> and redeploy Netlify. Old Client ID "
        "(540754283524-…) must be removed.",
        S["B"],
    ))

    story.append(Paragraph("2. Required Netlify env", S["H1"]))
    story.append(Code('''VITE_GOOGLE_CLIENT_ID=925512874310-duojhjmbplliooe0mqlgm532fogmq40g.apps.googleusercontent.com
VITE_AUTH_API_URL=https://nexus-lexis-backend-45v4.vercel.app/api/auth
VITE_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v2
VITE_LEX_API_BASE_URL=https://nexus-lexis-backend-ql8w.vercel.app/api/v1/lex'''))
    story.append(Paragraph("After saving env → <b>Redeploy</b> Netlify. No Client Secret on frontend.", S["B"]))

    story.append(Paragraph("3. API (usually no code change)", S["H1"]))
    story.append(Code('''POST {VITE_AUTH_API_URL}/google/token
Content-Type: application/json

{ "idToken": "<Google credential>", "role": "client" }
// role: client | lawyer | ca
// "credential" also accepted instead of idToken'''))
    story.append(Paragraph("Store accessToken + refreshToken → open dashboard.", S["B"]))

    story.append(Paragraph("4. Errors", S["H1"]))
    story.append(tbl(["Error", "Fix"], [
        ["origin_mismatch", "Add https://nexuslexis.netlify.app AND https://nexuslexis.law to Google JS origins (no /)"],
        ["API fail after Google popup", "FE still on old Client ID — update env + redeploy"],
        ["Google sign-in is not configured", "Auth Vercel missing GOOGLE_CLIENT_ID"],
    ], [50 * mm, u - 50 * mm]))

    story.append(Paragraph("5. Checklist", S["H1"]))
    story.append(tbl(["Check", "Owner"], [
        ["New VITE_GOOGLE_CLIENT_ID on Netlify", "Frontend"],
        ["Netlify redeploy after env change", "Frontend"],
        ["Login Google works on netlify.app", "Frontend"],
        ["Auth Vercel has matching Client ID/Secret", "Backend (done)"],
    ], [100 * mm, u - 100 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis FE Google Sign-In Update")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
