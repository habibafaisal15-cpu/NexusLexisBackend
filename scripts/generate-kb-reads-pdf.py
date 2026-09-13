"""Full Knowledge Bank Reads API contract PDF v2.0 — headers, params, bodies, responses."""
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
OUT = ROOT / "docs" / "Knowledge_Bank_Reads_API.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Knowledge Bank Reads")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "Full API contract — headers · params · bodies · responses")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-KB-READS-001  v2.0  ·  13 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "KB Reads API Contract v2.0")
    c.drawRightString(PAGE_W - MR, 8 * mm, f"Page {doc.page - 1}")
    c.restoreState()


def ep(story, method, path, auth, notes=None, params=None, body=None, response=None, errors=None, resp_label="Response 200"):
    u = PAGE_W - ML - MR
    story.append(Paragraph(f"<b>{method}</b>  {path}", S["H1"]))
    story.append(Paragraph(f"Auth: {auth}", S["B"]))
    if notes:
        story.append(Paragraph(notes, S["B"]))
    if params:
        story.append(Paragraph("Params", S["H2"]))
        story.append(tbl(["Name", "Type", "Req", "Description"], params, [28 * mm, 16 * mm, 10 * mm, u - 54 * mm]))
        story.append(Spacer(1, 2))
    if body:
        story.append(Paragraph("Request body", S["H2"]))
        story.append(Code(body))
        story.append(Spacer(1, 2))
    if response:
        story.append(Paragraph(resp_label, S["H2"]))
        story.append(Code(response))
        story.append(Spacer(1, 2))
    if errors:
        story.append(Paragraph(f"Errors: {errors}", S["B"]))
    story.append(Spacer(1, 4))


def build():
    u = PAGE_W - ML - MR
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Product rule + headers", S["H1"]))
    story.append(Paragraph(
        "Card is JSON. Body is one application/pdf. Admin publish → public cards; click opens "
        "DocumentPreviewModal via file.url. Not Library templates, not calculators, not SEO CMS.",
        S["B"],
    ))
    story.append(tbl(["Header", "On", "Value"], [
        ["Authorization", "Admin", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["Content-Type", "PATCH", "application/json"],
        ["Content-Type", "POST create / file", "multipart/form-data"],
        ["Public PDF", "file routes", "no auth · CORS * · application/pdf"],
    ], [32 * mm, 32 * mm, u - 64 * mm]))
    story.append(Code(
        'Error: { "success": false, "error": "…", "message": "…", "fields": { … } }\n'
        '400 / 401 / 403 / 404 / 409 / 413 / 415 / 422'
    ))

    story.append(Paragraph("1. Pillars & publish rules", S["H1"]))
    story.append(tbl(["pillar", "Layout / extras"], [
        ["articles", "featured + stack[0–2] + mini · placement, kicker, band, author, credit, readMins"],
        ["summaries", "filters + grid · tag (req on publish), chapters, amended"],
        ["judgements", "digest cards · court, cite (req), holding, spine, tags[], readMins"],
    ], [28 * mm, u - 28 * mm]))
    story.append(Paragraph(
        "Statuses: published|draft|retired. Publish without PDF → 422. One featured; ≤2 stack. "
        "related ∈ drafting|consultation|vlo. DELETE file → forces draft.",
        S["B"],
    ))
    story.append(PageBreak())

    ep(story, "GET", "/knowledge-bank/articles", "Public — no auth",
       notes="Cache-Control: no-store. Empty list → 200 with null/[] (never 404).",
       params=[["search", "query", "No", "title / excerpt / keyword ILIKE"]],
       response='''{
  "success": true,
  "data": {
    "featured": { /* entry or null */ },
    "stack": [ /* 0–2 */ ],
    "mini": [ /* rest */ ],
    "items": [ /* all published */ ],
    "counts": { "published": 6 }
  }
}''')

    ep(story, "GET", "/knowledge-bank/summaries", "Public",
       params=[["tag", "query", "No", "Constitutional…Tax or All"]],
       response='''{
  "success": true,
  "data": {
    "filters": ["All","Constitutional","Criminal","Civil","Family","Property","Tax"],
    "items": [ /* … */ ],
    "counts": { "published": 9 }
  }
}''',
       errors="422 unknown tag")

    ep(story, "GET", "/knowledge-bank/judgements", "Public",
       response='''{
  "success": true,
  "data": { "items": [ /* … */ ], "counts": { "published": 6 } }
}''')

    ep(story, "GET", "/knowledge-bank/reads", "Public (optional alias)",
       params=[
           ["pillar", "query", "Yes", "articles|summaries|judgements"],
           ["tag", "query", "No", "when pillar=summaries"],
       ],
       response="Same envelope as the matching pillar landing.",
       errors="422 if pillar missing/invalid")
    story.append(PageBreak())

    ep(story, "GET", "/knowledge-bank/{pillar}/:slug", "Public",
       params=[
           ["pillar", "path", "Yes", "articles|summaries|judgements"],
           ["slug", "path", "Yes", "published slug only"],
       ],
       response='{ "success": true, "data": { /* full entry + file.url */ } }',
       errors="404 draft/retired/unknown")

    ep(story, "GET / HEAD / OPTIONS", "/knowledge-bank/{pillar}/:slug/file", "Public — no auth",
       notes="Raw PDF. OPTIONS → 204 CORS. HEAD → Content-Length, no body. "
             "file.url includes ?v=updatedAt ms cache-buster.",
       params=[
           ["pillar", "path", "Yes", "articles|summaries|judgements"],
           ["slug", "path", "Yes", "published"],
           ["download", "query", "No", "1 → attachment; else inline"],
       ],
       response="Raw PDF bytes\n"
                "Content-Type: application/pdf\n"
                "Content-Disposition: inline|attachment; filename=\"…\"\n"
                "Cache-Control: public, max-age=300\n"
                "Access-Control-Allow-Origin: *",
       errors="404 if draft/retired or no PDF")

    ep(story, "GET", "/admin/knowledge-bank/entries",
       "Admin JWT + X-Client-Role: Admin",
       notes="counts are GLOBAL KPIs (ignore filters). Items are compact rows.",
       params=[
           ["pillar", "query", "No", "articles|summaries|judgements"],
           ["status", "query", "No", "published|draft|retired"],
           ["search", "query", "No", "title/slug/keyword/category/cite/court"],
           ["page", "query", "No", "default 1"],
           ["limit", "query", "No", "12|24|48 (nearest). default 12"],
       ],
       response='''{
  "success": true,
  "data": {
    "items": [{
      "id": "12", "pillar": "articles", "slug": "…", "title": "…",
      "status": "published", "hasFile": true, "displayOrder": 20,
      "placement": "stack", "updatedAt": "…"
    }],
    "pagination": {
      "page": 1, "limit": 12, "totalItems": 18,
      "totalPages": 2, "hasNext": true, "hasPrev": false
    },
    "counts": {
      "articles": 8, "summaries": 9, "judgements": 6,
      "published": 19, "draft": 3, "retired": 1
    }
  }
}''')
    story.append(PageBreak())

    ep(story, "GET", "/admin/knowledge-bank/entries/:id", "Admin",
       params=[["id", "path", "Yes", "Entry id"]],
       response='{ "success": true, "data": { /* full entry */ } }',
       errors="404")

    ep(story, "POST", "/admin/knowledge-bank/entries", "Admin",
       notes="multipart/form-data. Field name for PDF must be file. Max 15 MB.",
       body='''Content-Type: multipart/form-data

pillar=articles                    // required
title=Cheque bounce under 489-F    // required, max 140
slug=cheque-bounce-section-489f    // optional; 4–72 kebab
status=draft                       // default draft
excerpt=…                          // or body=… (max 400)
category=Criminal Law
keyword=cheque bounce pakistan
schema=true
related=drafting,consultation
displayOrder=20
placement=stack                    // req if published article
kicker=Criminal Law
band=seal                          // seal|gold|navy
readMins=5                         // 1–60
// summaries: tag, chapters, amended
// judgements: court, cite, holding, spine, tags
file=<pdf>                         // required if status=published''',
       response='''{ "success": true, "data": { /* full entry */ } }''',
       resp_label="Response 201",
       errors="400 · 409 slug taken · 413 · 415 · 422 publish/placement")

    ep(story, "PATCH", "/admin/knowledge-bank/entries/:id", "Admin",
       notes="JSON metadata only — PDF untouched. Unknown keys ignored. "
             "Pillar/slug locked after publish → 409.",
       body='''{
  "title": "Cheque bounce (updated)",
  "excerpt": "…",
  "status": "published",
  "placement": "featured",
  "band": "gold",
  "readMins": 6,
  "metaTitle": "…",
  "metaDesc": "…"
}''',
       response='{ "success": true, "data": { /* full entry */ } }',
       errors="404 · 409 locked · 422")
    story.append(PageBreak())

    ep(story, "PATCH", "/admin/knowledge-bank/entries/:id/status", "Admin",
       notes="Publishing still requires existing PDF + pillar extras.",
       body='{ "status": "retired" }',
       response='{ "success": true, "data": { /* full entry */ } }',
       errors="404 · 422")

    ep(story, "POST", "/admin/knowledge-bank/entries/:id/file", "Admin",
       notes="Atomic replace. Field name must be file.",
       body='''Content-Type: multipart/form-data

file=<pdf bytes>          // required, max 15 MB
fileName=optional-name.pdf''',
       response='''{ "success": true, "data": {
  "id": "12", "hasFile": true,
  "file": { "url": "https://…/file?v=…", "fileName": "…",
            "mime": "application/pdf", "sizeBytes": 482113 }
} }''',
       errors="400 missing file · 404 · 413 · 415")

    ep(story, "DELETE", "/admin/knowledge-bank/entries/:id/file", "Admin — no body",
       notes="Clears PDF and forces status=draft.",
       response='{ "success": true, "data": { "file": null, "status": "draft", … } }',
       errors="404")

    ep(story, "GET", "/admin/knowledge-bank/entries/:id/file", "Admin",
       notes="Raw PDF (drafts ok). ?download=1 → attachment.",
       errors="404 if no file")

    story.append(Paragraph("2. FE swap", S["H1"]))
    story.append(tbl(["Current", "API"], [
        ["Hardcoded articles JSX", "GET /knowledge-bank/articles"],
        ["STATUTES", "GET /knowledge-bank/summaries"],
        ["JUDGEMENTS", "GET /knowledge-bank/judgements"],
        ["Click no-op", "pdfUrl: entry.file.url"],
        ["Admin local SEED", "GET/POST/PATCH …/entries + /file"],
    ], [45 * mm, u - 45 * mm]))

    story.append(Paragraph("3. Delivery", S["H1"]))
    story.append(tbl(["P", "Item", "Status"], [
        ["P0", "CRUD + PDF + public layouts", "Shipped"],
        ["P1", "Featured/stack rules + search/pagination", "Shipped"],
        ["P2", "Hard delete / CDN / PDF search", "Deferred"],
    ], [12 * mm, 75 * mm, u - 87 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis KB Reads API Contract v2.0")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
