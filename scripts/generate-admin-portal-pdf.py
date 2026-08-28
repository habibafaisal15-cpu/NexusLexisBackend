"""Full API contract PDF — NL-FE-ADMIN-PORTAL-001 v2.0 (headers, params, bodies, responses)."""
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
OUT = ROOT / "docs" / "Admin_Portal_Drafting_Knowledge_LEX_API.pdf"

NAVY = HexColor("#0B1F3A")
NAVY_MID = HexColor("#16375F")
GOLD = HexColor("#C9A227")
CREAM = HexColor("#F6F1E6")
SLATE = HexColor("#3A4658")
MUTED = HexColor("#6B7380")
ROW_ALT = HexColor("#F4F7FB")
CODE_BG = HexColor("#0E243F")
LINE = HexColor("#D5DCE6")

PAGE_W, PAGE_H = A4
MARGIN_L = 14 * mm
MARGIN_R = 14 * mm
MARGIN_T = 18 * mm
MARGIN_B = 14 * mm


def register_fonts():
    for regular, bold in [
        (Path(r"C:\Windows\Fonts\calibri.ttf"), Path(r"C:\Windows\Fonts\calibrib.ttf")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Body", str(regular)))
            pdfmetrics.registerFont(TTFont("Body-Bold", str(bold)))
            return "Body", "Body-Bold"
    return "Helvetica", "Helvetica-Bold"


BODY, BOLD = register_fonts()


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("CoverTitle", fontName=BOLD, fontSize=18, leading=24, textColor=white, spaceAfter=6))
    ss.add(ParagraphStyle("CoverSub", fontName=BODY, fontSize=10, leading=14, textColor=HexColor("#D5DEEA")))
    ss.add(ParagraphStyle("CoverMeta", fontName=BODY, fontSize=8.5, leading=12, textColor=HexColor("#B7C3D4")))
    ss.add(ParagraphStyle("H1", fontName=BOLD, fontSize=11, leading=14, textColor=NAVY, spaceBefore=10, spaceAfter=5))
    ss.add(ParagraphStyle("H2", fontName=BOLD, fontSize=9.5, leading=12, textColor=NAVY_MID, spaceBefore=6, spaceAfter=3))
    ss.add(ParagraphStyle("Body", fontName=BODY, fontSize=8, leading=11, textColor=SLATE, spaceAfter=3))
    ss.add(ParagraphStyle("Th", fontName=BOLD, fontSize=7, leading=9, textColor=white))
    ss.add(ParagraphStyle("Td", fontName=BODY, fontSize=7, leading=9.5, textColor=SLATE))
    return ss


S = styles()


class CodeBlock(Flowable):
    def __init__(self, text, font_size=6.2):
        super().__init__()
        self.raw = text.strip("\n")
        self.font_size = font_size

    def wrap(self, aw, ah):
        self.width = aw
        style = ParagraphStyle("C", fontName="Courier", fontSize=self.font_size, leading=self.font_size + 2.2,
                               textColor=HexColor("#E4ECF6"))
        self._paras = []
        y = 0
        for line in self.raw.splitlines() or [""]:
            esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
            p = Paragraph(esc or "&nbsp;", style)
            _, h = p.wrap(aw - 12, ah)
            self._paras.append((p, h))
            y += h
        self._h = y + 10
        self.height = self._h
        return aw, self._h

    def draw(self):
        self.canv.setFillColor(CODE_BG)
        self.canv.roundRect(0, 0, self.width, self._h, 3, fill=1, stroke=0)
        y = self._h - 6
        for p, h in self._paras:
            y -= h
            p.drawOn(self.canv, 6, y)


def tbl(headers, rows, widths):
    data = [[Paragraph(h, S["Th"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), S["Td"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(data)):
        cmds.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT if i % 2 == 0 else white))
    t.setStyle(TableStyle(cmds))
    return t


def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, PAGE_H - 38 * mm, PAGE_W, 2, fill=1, stroke=0)
    canvas.setFillColor(white)
    canvas.setFont(BOLD, 18)
    canvas.drawString(MARGIN_L, PAGE_H - 55 * mm, "Admin Portal API Contract")
    canvas.setFont(BODY, 10)
    canvas.drawString(MARGIN_L, PAGE_H - 65 * mm, "Headers · Params · Request Bodies · Responses")
    canvas.setFillColor(HexColor("#B7C3D4"))
    canvas.setFont(BODY, 8.5)
    canvas.drawString(MARGIN_L, PAGE_H - 78 * mm, "NL-FE-ADMIN-PORTAL-001  v2.0  ·  28 August 2026")
    canvas.drawString(MARGIN_L, PAGE_H - 86 * mm, "Base: https://nexus-lexis-backend-ql8w.vercel.app")
    canvas.restoreState()


def footer(canvas, doc):
    if doc.page == 1:
        return
    canvas.saveState()
    canvas.setFillColor(MUTED)
    canvas.setFont(BODY, 7)
    canvas.drawString(MARGIN_L, 8 * mm, "NexusLexis Admin Portal API Contract v2.0")
    canvas.drawRightString(PAGE_W - MARGIN_R, 8 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


def endpoint(story, usable, title, method, path, auth, params=None, body=None, response=None, errors=None, notes=None):
    story.append(Paragraph(f"<b>{method}</b> {path}", S["H1"]))
    story.append(Paragraph(f"Auth: {auth}", S["Body"]))
    if notes:
        story.append(Paragraph(notes, S["Body"]))
    if params:
        story.append(Paragraph("Query / path params", S["H2"]))
        story.append(tbl(["Name", "Type", "Req", "Description"], params, [28 * mm, 18 * mm, 12 * mm, usable - 58 * mm]))
        story.append(Spacer(1, 4))
    if body:
        story.append(Paragraph("Request body", S["H2"]))
        story.append(CodeBlock(body))
        story.append(Spacer(1, 4))
    if response:
        story.append(Paragraph("Response 200", S["H2"]))
        story.append(CodeBlock(response))
        story.append(Spacer(1, 4))
    if errors:
        story.append(Paragraph(f"Errors: {errors}", S["Body"]))
    story.append(Spacer(1, 6))


def build():
    usable = PAGE_W - MARGIN_L - MARGIN_R
    story = [Spacer(1, 95 * mm), PageBreak()]

    story.append(Paragraph("0. Common headers", S["H1"]))
    story.append(tbl(
        ["Header", "Required", "Value"],
        [
            ["Authorization", "Yes", "Bearer &lt;JWT&gt;"],
            ["X-Client-Role", "Yes", "Admin or RegistryStaff"],
            ["Content-Type", "JSON POST/PATCH", "application/json"],
        ],
        [35 * mm, 18 * mm, usable - 53 * mm],
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Error shape: { \"error\": \"message\" } — 400/401/403/404/409", S["Body"]))
    story.append(PageBreak())

    story.append(Paragraph("1. Drafting Desk", S["H1"]))

    endpoint(story, usable, "stats", "GET", "/api/v2/admin/drafting-desk/stats",
             "Admin | RegistryStaff", response='''{
  "success": true,
  "stats": {
    "total": 18, "pending": 4, "inProgress": 6,
    "completed": 8, "slaBreached": 1, "unassigned": 2,
    "pendingSettlement": 3, "customDocs": 10,
    "serviceOrders": 8, "slaHours": 24
  }
}''')

    endpoint(story, usable, "orders", "GET", "/api/v2/admin/drafting-desk/orders",
             "Admin | RegistryStaff",
             notes="Aliases: /api/v2/admin-panel/orders · /admin-panel/orders",
             params=[
                ["page", "number", "No", "Default 1"],
                ["limit", "number", "No", "10 | 20 | 50 (default 20)"],
                ["status", "string", "No", "Status key filter"],
                ["dateFrom", "date", "No", "YYYY-MM-DD"],
                ["dateTo", "date", "No", "YYYY-MM-DD"],
                ["search", "string", "No", "Client/lawyer/subject"],
                ["paymentConfirmed", "bool", "No", "true | false"],
                ["unassignedOnly", "bool", "No", "true | false"],
                ["clientProfileId", "string", "No", "Client user id"],
             ],
             response='''{
  "success": true, "room": "drafting_desk",
  "orders": [{
    "id": "appt_123", "kind": "custom_docs",
    "appointmentId": "123", "orderNumber": null,
    "client": { "id": "5", "name": "...", "email": "..." },
    "subject": "...", "description": "...",
    "status": "pending", "statusKey": "pending",
    "paymentConfirmed": true, "paymentStatus": "paid",
    "assignedProfessional": {
      "id": "45", "userId": "12", "name": "...", "type": "lawyer"
    },
    "assignedAt": "...", "acceptanceDeadline": "...",
    "acceptanceExpired": false, "slaHours": 24,
    "createdAt": "...", "source": "custom_docs"
  }, {
    "id": "order_88", "kind": "service_order",
    "orderNumber": "ORD-...", "orderId": "88",
    "intakeSchema": {}, "intakeForm": {},
    "source": "service_order"
  }],
  "pagination": { "page": 1, "limit": 20,
    "totalItems": 2, "totalPages": 1,
    "hasNext": false, "hasPrev": false }
}''')
    story.append(PageBreak())

    endpoint(story, usable, "assign", "POST", "/api/v2/admin/drafting-desk/orders/assign",
             "Admin | RegistryStaff",
             body='''// Service order — lawyer
{
  "kind": "service_order",
  "orderNumber": "ORD-2026-0088",
  "assigned_to_lawyer_id": "45",
  "note": "Priority"
}

// Service order — CA
{
  "kind": "service_order",
  "orderNumber": "ORD-2026-0088",
  "assigned_to_ca_id": "12"
}

// Custom docs (lawyer only)
{
  "kind": "custom_docs",
  "appointmentId": "123",
  "assigned_to_lawyer_id": "45"
}

// Field aliases: lawyerProfileId, caProfileId''',
             response='''// service_order response
{
  "success": true,
  "order": {
    "id": "order_88",
    "orderNumber": "ORD-2026-0088",
    "status": "processing",
    "assignedProfessional": {
      "id": "45", "userId": "12",
      "name": "...", "type": "lawyer"
    },
    "assignedAt": "...",
    "acceptanceDeadline": "...",
    "slaHours": 24
  }
}

// custom_docs → full appointment oversight object''',
             errors="400 missing assignee · 404 not found · 409 slot conflict")

    endpoint(story, usable, "settlements", "GET", "/api/v2/admin/drafting-desk/settlements",
             "Admin | RegistryStaff",
             params=[["status", "string", "No", "Default pending_payout"]],
             response='''{
  "success": true,
  "settlements": [{
    "id": "88", "orderNumber": "ORD-...",
    "orderStatus": "completed",
    "remittanceStatus": "pending_payout",
    "settledAt": null, "settlementNote": null,
    "subject": "...", "client": { "name": "...", "email": "..." },
    "professional": { "name": "...", "type": "lawyer" }
  }]
}''')

    endpoint(story, usable, "remit", "POST",
             "/api/v2/admin/drafting-desk/settlements/:orderNumber/remit",
             "Admin | RegistryStaff",
             params=[["orderNumber", "path", "Yes", "Order number or id"]],
             body='{ "note": "Fee remitted REF-9921" }',
             response='''{
  "success": true,
  "settlement": {
    "orderNumber": "ORD-...",
    "remittanceStatus": "remitted",
    "settledAt": "...",
    "settlementNote": "..."
  }
}''')

    endpoint(story, usable, "assignable", "GET", "/api/v2/admin/assignable-professionals",
             "Admin | RegistryStaff",
             params=[
                ["professionalType", "string", "No", "lawyer (default) | ca"],
                ["practiceArea", "string", "No", "Lawyer filter"],
                ["city", "string", "No", ""],
                ["excludeProfileId", "string", "No", ""],
                ["search", "string", "No", ""],
             ],
             response='''{
  "success": true,
  "professionals": [{
    "id": "45", "name": "...",
    "professionalType": "lawyer",
    "practiceArea": "Family Law",
    "availability": "Available today",
    "currentLoad": 3, "status": "available",
    "city": "Lahore", "verificationStatus": "verified"
  }]
}''')
    story.append(PageBreak())

    story.append(Paragraph("2. Professional delivery", S["H1"]))
    endpoint(story, usable, "lawyer orders", "GET", "/api/v2/lawyer/orders",
             "Lawyer JWT + X-Client-Role: LegalAdvocate",
             response='''{
  "orders": [{
    "id": 88, "orderNumber": "ORD-...",
    "clientName": "...", "serviceName": "...",
    "status": "Processing", "deadline": "...",
    "intakeForm": {}, "formData": {}
  }]
}''', notes="CA: GET /api/v2/ca/orders — same shape")

    endpoint(story, usable, "deliver", "POST",
             "/api/v2/lawyer/orders/:orderId/deliver",
             "Lawyer or CA JWT",
             notes="Aliases: POST /api/v2/ca/orders/:id/deliver · POST /api/lawyers/assigned-orders/:id/upload/",
             params=[["orderId", "path", "Yes", "Order number or id"]],
             body='''Content-Type: multipart/form-data

document: <file>  (PDF or DOCX, max 8MB)''',
             response='''{
  "success": true,
  "orderId": "ORD-...", "orderNumber": "ORD-...",
  "file": "affidavit-final.pdf",
  "remittanceStatus": "pending_payout",
  "settlement": { "status": "pending_payout", "triggered": true }
}''',
             errors="400 missing file · 404 not found / not assigned")
    story.append(PageBreak())

    story.append(Paragraph("3. Knowledge Bank", S["H1"]))
    endpoint(story, usable, "admin list", "GET", "/api/v2/admin/knowledge/articles",
             "Admin only (RegistryStaff → empty)",
             notes="Alias: GET /api/knowledge/manage",
             params=[
                ["page", "number", "No", "Default 1"],
                ["limit", "number", "No", "Max 50"],
                ["status", "string", "No", "draft | published | retired"],
                ["pillar", "string", "No", "legal_articles | law_summaries | free_templates | legal_calculators"],
                ["search", "string", "No", ""],
             ],
             response='''{
  "success": true,
  "articles": [{
    "id": "7", "slug": "how-to-register-partnership",
    "title": "...", "pillar": "legal_articles",
    "summary": "...", "body": "...",
    "status": "draft",
    "seoTitle": "...", "seoDescription": "...",
    "keywords": ["..."],
    "relatedServiceSlugs": ["partnership-deed"],
    "coverImage": null,
    "publishedAt": null,
    "createdAt": "...", "updatedAt": "..."
  }],
  "pagination": { ... }
}''')

    endpoint(story, usable, "create", "POST", "/api/v2/admin/knowledge/articles",
             "Admin only", notes="Alias: POST /api/knowledge/manage",
             body='''{
  "title": "How to register a partnership",  // required
  "slug": "how-to-register-partnership",
  "pillar": "legal_articles",
  "summary": "...", "body": "<p>...</p>",
  "status": "draft",
  "seoTitle": "...", "seoDescription": "...",
  "keywords": ["partnership"],
  "relatedServiceSlugs": ["partnership-deed"],
  "coverImage": "/uploads/cover.png"
}''',
             response='{ "success": true, "article": { ... } }  // 201',
             errors="400 missing title / invalid pillar")

    endpoint(story, usable, "update/delete", "PATCH | DELETE",
             "/api/v2/admin/knowledge/articles/:idOrSlug",
             "Admin only",
             notes="PATCH partial update · DELETE soft-retires (status=retired)")

    endpoint(story, usable, "public list", "GET", "/api/v2/knowledge/articles",
             "Public — no auth",
             notes="Alias: GET /api/knowledge/articles · published only, no body in list")

    endpoint(story, usable, "public detail", "GET", "/api/v2/knowledge/articles/:slug",
             "Public",
             response='''{
  "success": true,
  "article": {
    "id": "7", "slug": "...", "title": "...",
    "body": "...", "status": "published",
    "relatedServices": [{
      "slug": "partnership-deed", "name": "...",
      "accessType": "paid", "price": 2500,
      "href": "/library/partnership-deed"
    }],
    "seo": {
      "title": "...", "description": "...",
      "keywords": ["..."], "schemaType": "LegalArticle"
    }
  }
}''')
    story.append(PageBreak())

    story.append(Paragraph("4. LEX Console", S["H1"]))
    endpoint(story, usable, "stats", "GET", "/api/v2/admin/lex/stats", "Admin only",
             response='''{
  "success": true,
  "stats": {
    "sessions": 120, "turns": 450, "turnsToday": 12,
    "guestOwners": 80, "flaggedTurns": 2,
    "guestPromptLimit": 4,
    "questionBank": {
      "entryCount": 320, "hasTfidf": true, "cacheTtlMs": 300000
    }
  }
}''')

    endpoint(story, usable, "sessions", "GET", "/api/v2/admin/lex/sessions", "Admin only",
             params=[
                ["page", "number", "No", ""], ["limit", "number", "No", ""],
                ["guestOnly", "bool", "No", ""], ["userOnly", "bool", "No", ""],
                ["search", "string", "No", ""],
             ],
             response='''{
  "success": true,
  "sessions": [{
    "id": "session_...", "sessionKey": "session_...",
    "ownerKey": "guest:uuid", "isGuest": true,
    "title": "...", "turnCount": 2,
    "flaggedCount": 0, "createdAt": "...", "updatedAt": "..."
  }],
  "pagination": { ... }
}''')

    endpoint(story, usable, "session detail", "GET", "/api/v2/admin/lex/sessions/:sessionKey",
             "Admin only",
             response='''{
  "success": true,
  "session": {
    "sessionKey": "...", "title": "...",
    "turns": [{
      "id": "101", "question": "...", "response": "...",
      "language": "EN", "isFlagged": false, "createdAt": "..."
    }]
  }
}''')

    endpoint(story, usable, "flag", "POST", "/api/v2/admin/lex/turns/:turnId/flag",
             "Admin only", body='{ "flagged": true }',
             response='{ "success": true, "turnId": "101", "isFlagged": true }')

    endpoint(story, usable, "delete session", "DELETE", "/api/v2/admin/lex/sessions/:sessionKey",
             "Admin only",
             response='{ "success": true, "sessionKey": "session_..." }')

    endpoint(story, usable, "reload Q&A", "POST", "/api/v2/admin/lex/question-bank/reload",
             "Admin only — no body",
             response='''{
  "success": true,
  "questionBank": { "entryCount": 320, "hasTfidf": false },
  "message": "Question bank cache cleared and reload started"
}''')

    story.append(PageBreak())
    story.append(Paragraph("5. RegistryStaff empty rooms", S["H1"]))
    story.append(CodeBlock('''// Knowledge / LEX when X-Client-Role: RegistryStaff
{
  "success": true,
  "empty": true,
  "room": "knowledge",
  "articles": [],
  "pagination": { "page": 1, "limit": 20,
    "totalItems": 0, "totalPages": 0,
    "hasNext": false, "hasPrev": false }
}'''))

    story.append(Paragraph("6. Free template files (not CMS)", S["H1"]))
    story.append(tbl(["Method", "Path", "Auth"], [
        ["GET", "/api/v2/knowledge-bank/catalog", "Public"],
        ["GET", "/api/v2/knowledge-bank/templates/:slug", "Public"],
        ["GET", "/api/v2/knowledge-bank/templates/:slug/download", "Public file bytes"],
    ], [18 * mm, usable - 36 * mm, 18 * mm]))

    doc = SimpleDocTemplate(
        str(OUT), pagesize=A4,
        leftMargin=MARGIN_L, rightMargin=MARGIN_R,
        topMargin=MARGIN_T, bottomMargin=MARGIN_B,
        title="NexusLexis Admin Portal API Contract v2.0",
    )
    doc.build(story, onFirstPage=cover, onLaterPages=footer)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
