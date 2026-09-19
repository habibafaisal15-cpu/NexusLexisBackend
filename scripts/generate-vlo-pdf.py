"""VLO API contract PDF — NL-FE-VLO-001 full headers/params/bodies/responses."""
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
OUT = ROOT / "docs" / "VLO_API.pdf"
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
    c.drawString(ML, PAGE_H - 52 * mm, "Virtual Legal Office (VLO)")
    c.setFont(BODY, 10)
    c.drawString(ML, PAGE_H - 62 * mm, "Full API contract — headers · params · bodies · responses")
    c.setFillColor(HexColor("#B7C3D4"))
    c.setFont(BODY, 8)
    c.drawString(ML, PAGE_H - 76 * mm, "NL-FE-VLO-001  v1.0  ·  20 September 2026")
    c.drawString(ML, PAGE_H - 84 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    c.restoreState()


def foot(c, doc):
    if doc.page == 1:
        return
    c.saveState()
    c.setFillColor(MUTED)
    c.setFont(BODY, 7)
    c.drawString(ML, 8 * mm, "VLO API Contract NL-FE-VLO-001")
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

    story.append(Paragraph("0. Scope + headers", S["H1"]))
    story.append(Paragraph(
        "VLO retainers: Starter PKR 15,000 · Growth 30,000 · Enterprise 60,000. "
        "Subscribe creates active sub with paymentStatus=manual_pending until JazzCash/Stripe land.",
        S["B"],
    ))
    story.append(tbl(["Header", "On", "Value"], [
        ["Authorization", "All except plans", "Bearer &lt;JWT&gt;"],
        ["X-Client-Role", "Admin", "Admin"],
        ["X-Client-Role", "Lawyer", "LegalAdvocate"],
        ["Content-Type", "JSON", "application/json"],
        ["Content-Type", "Matter / upload", "multipart/form-data"],
    ], [32 * mm, 28 * mm, u - 60 * mm]))
    story.append(Code('Error: { "success": false, "error": "…", "message": "…", "fields": { … } }\n'
                      '400 / 401 / 403 / 404 / 409 / 422'))
    story.append(PageBreak())

    ep(story, "GET", "/vlo/plans", "Public — no auth",
       response='''{ "success": true, "data": {
  "plans": [
    { "id":"1", "name":"Starter", "monthlyFee":15000,
      "documentReviewsPerMonth":5, "consultationsPerMonth":2,
      "supportChannel":"email", "hasDedicatedLawyer":false },
    { "id":"2", "name":"Growth", "monthlyFee":30000, "…":"…" },
    { "id":"3", "name":"Enterprise", "monthlyFee":60000,
      "documentReviewsPerMonth":"Unlimited", "…":"…" }
  ],
  "counts": { "plans": 3 }
} }''')

    ep(story, "GET", "/vlo/subscription", "Client JWT",
       notes="Alias: GET /subscription. data=null when not subscribed.",
       response='''{ "success": true, "data": {
  "id":"12", "status":"active", "paymentStatus":"manual_pending",
  "plan": { "name":"Growth", "monthlyFee":30000 },
  "planName":"Growth Retainer Plan", "price":"Rs. 30,000",
  "nextBillingDate":"2026-10-20",
  "assignedLawyer": { "id":"44", "name":"…", "profileId":"7" },
  "usage": { "reviewsUsed":0, "reviewsLimit":15, "reviewsRemaining":15,
             "consultationsUsed":0, "mattersSubmittedThisMonth":1 }
} }''')

    ep(story, "POST", "/vlo/subscribe", "Client JWT",
       body='{ "planId": "2" }\n// or { "planName": "Growth" }',
       response='{ "success": true, "data": { /* subscription */ } }',
       resp_label="Response 201",
       errors="404 unknown plan · 409 already active · 422")

    ep(story, "POST", "/vlo/subscription/cancel", "Client JWT — no body",
       notes="Alias: POST /subscription/cancel",
       response='{ "success": true, "data": { "status":"cancelled", … } }',
       errors="404")
    story.append(PageBreak())

    ep(story, "GET", "/vlo/matters", "Client JWT",
       response='''{ "success": true, "data": {
  "items": [{
    "id":"101", "legacyId":"m-101", "title":"…",
    "status":"received", "statusLabel":"Awaiting Counsel Vetting",
    "file": { "url":"…/file?kind=intake", "fileName":"…", "hasFile":true },
    "completedFile": null
  }],
  "counts": { "total": 1 }
}, "matters": [ /* legacy */ ] }''')

    ep(story, "GET", "/vlo/matters/:id", "Client JWT",
       params=[["id", "path", "Yes", "numeric or m-101"]],
       response='{ "success": true, "data": { /* matter */ } }')

    ep(story, "POST", "/vlo/matters", "Client JWT",
       notes="multipart. Field file or files[] (first used).",
       body='''Content-Type: multipart/form-data

title=Employment contract review
description=Please review clause 9…
file=<pdf|docx>''',
       response='{ "success": true, "data": { /* matter */ } }',
       resp_label="Response 201",
       errors="403 no active sub · 422")

    ep(story, "GET", "/vlo/matters/:id/file|download", "Client JWT",
       params=[["kind", "query", "No", "intake | completed (file route)"]],
       notes="download prefers completed binary; else text opinion fallback.")
    story.append(PageBreak())

    story.append(Paragraph("Lawyer desk — /lawyer/vlo/*", S["H1"]))
    story.append(tbl(["Method", "Path", "Notes"], [
        ["GET", "/lawyer/vlo/subscribers", "Assigned clients only"],
        ["GET", "/lawyer/vlo/subscribers/:id/matters", "Client matters"],
        ["PATCH", "/lawyer/vlo/matters/:id", "JSON status + lawyerNotes"],
        ["POST", "/lawyer/vlo/matters/:id/notes", '{ "note": "…" }'],
        ["POST", "/lawyer/vlo/matters/:id/upload", "multipart file = opinion PDF"],
        ["GET", "/lawyer/vlo/matters/:id/file", "kind=intake|completed"],
    ], [22 * mm, 70 * mm, u - 92 * mm]))
    story.append(Code('''PATCH body:
{ "status": "completed",
  "lawyerNotes": "Opinion: the clause is enforceable…" }

Statuses: received | under_review | completed'''))

    story.append(Paragraph("Admin — /admin/vlo/*", S["H1"]))
    ep(story, "GET", "/admin/vlo/stats", "Admin JWT + X-Client-Role: Admin",
       response='''{ "success": true, "data": {
  "subscriptions": { "total":10, "active":7, "unassigned":2 },
  "matters": { "total":22, "received":5, "under_review":4, "completed":13 },
  "byPlan": [{ "plan":"Growth", "activeSubscribers":3 }]
} }''')

    ep(story, "GET", "/admin/vlo/subscriptions", "Admin",
       params=[
           ["status", "query", "No", "active|cancelled|paused|expired"],
           ["plan", "query", "No", "Starter|Growth|Enterprise"],
           ["search", "query", "No", "name/email/plan"],
           ["page/limit", "query", "No", "12|24|48"],
       ],
       response='''{ "success": true, "data": {
  "items": [{ "id":"12", "client":{…}, "assignedLawyer":null, "usage":{…} }],
  "pagination": { "page":1, "limit":12, "totalItems":10, … },
  "counts": { "total":10, "active":7, "unassigned":2, … }
} }''')

    ep(story, "POST", "/admin/vlo/subscriptions/:id/assign-lawyer", "Admin",
       body='{ "lawyerUserId": "44" }\n// or { "lawyerProfileId": "7" }',
       response='{ "success": true, "data": { /* sub with assignedLawyer */ } }',
       errors="404 · 422 invalid lawyer")
    story.append(PageBreak())

    story.append(Paragraph("FE swap", S["H1"]))
    story.append(tbl(["Screen", "API"], [
        ["/vlo plans", "GET /vlo/plans"],
        ["Subscribe", "POST /vlo/subscribe"],
        ["/account/vlo", "GET /vlo/subscription + matters"],
        ["Submit matter", "POST /vlo/matters"],
        ["Lawyer desk", "/lawyer/vlo/subscribers + PATCH/upload"],
        ["Admin VLO panel", "GET /admin/vlo/subscriptions + assign-lawyer"],
    ], [40 * mm, u - 40 * mm]))

    story.append(Paragraph("Delivery", S["H1"]))
    story.append(tbl(["Item", "Status"], [
        ["Plans + subscribe/cancel + usage", "Shipped"],
        ["Client matters + files", "Shipped"],
        ["Lawyer update/notes/upload", "Shipped"],
        ["Admin list/assign/stats", "Shipped"],
        ["Stripe/JazzCash recurring", "Deferred"],
    ], [90 * mm, u - 90 * mm]))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=ML, rightMargin=MR,
                            topMargin=MT, bottomMargin=MB,
                            title="NexusLexis VLO API Contract")
    doc.build(story, onFirstPage=cover, onLaterPages=foot)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
