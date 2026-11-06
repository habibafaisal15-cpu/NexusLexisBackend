"""Rebuild Profiles & Admin Users API Word doc with tables and sections D/E."""
from docx import Document
from docx.shared import Pt, Inches
from docx.oxml.ns import qn
from pathlib import Path

OUT = Path(__file__).with_name("Profiles_and_Admin_Users_API.docx")


def font(run, size=11, bold=False, code=False):
    run.bold = bold
    run.font.size = Pt(size)
    name = "Consolas" if code else "Calibri"
    run.font.name = name
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.get_or_add_rFonts()
    r_fonts.set(qn("w:ascii"), name)
    r_fonts.set(qn("w:hAnsi"), name)


def para(doc, text, bold=False, size=11):
    p = doc.add_paragraph()
    r = p.add_run(text)
    font(r, size=size, bold=bold)
    p.paragraph_format.space_after = Pt(6)
    return p


def code(doc, text):
    p = doc.add_paragraph()
    r = p.add_run(text.strip("\n"))
    font(r, size=9, code=True)
    p.paragraph_format.space_after = Pt(8)
    return p


def table(doc, headers, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        r = cell.paragraphs[0].add_run(h)
        font(r, size=10, bold=True)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = ""
            r = cell.paragraphs[0].add_run(str(val))
            font(r, size=10)
    doc.add_paragraph()
    return t


def main():
    doc = Document()
    for s in doc.sections:
        s.top_margin = Inches(0.7)
        s.bottom_margin = Inches(0.7)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)

    doc.add_heading("NexusLexis — Profiles & Admin Users API (implemented)", 0)
    para(doc, "Date: 6 Nov 2026")
    para(doc, "Main API: https://nexus-lexis-backend-ql8w.vercel.app/api/v2")
    para(doc, "Auth API: https://nexus-lexis-backend-45v4.vercel.app/api/auth")
    para(
        doc,
        "All routes need Authorization: Bearer <accessToken> unless noted. "
        "Admin routes require an admin JWT (role=admin). Errors: { \"error\": \"…\" }.",
    )

    doc.add_heading("A. Profile APIs (Client / Lawyer / CA)", 1)

    doc.add_heading("A1. GET client profile — added", 2)
    para(doc, "GET {MAIN}/client/profile")
    para(doc, "Headers: Authorization   |   Body: none")
    code(
        doc,
        """{
  "id": "12",
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 317 7171022",
  "cnic": "34241-1234578-9",
  "city": "Lahore",
  "language": "en",
  "avatarUrl": "/uploads/…",
  "memberSince": "2026-01-12T00:00:00.000Z",
  "status": "active"
}""",
    )

    doc.add_heading("A2. PUT client profile — updated", 2)
    para(doc, "PUT {AUTH}/profile/client")
    para(doc, "Now accepts name, email, language (en|ur) plus existing CNIC/city/phone.")
    code(
        doc,
        """{
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 317 7171022",
  "cnic": "34241-1234578-9",
  "city": "Lahore",
  "language": "en",
  "address": "optional"
}""",
    )

    doc.add_heading("A3. POST client photo — added", 2)
    para(doc, "POST {MAIN}/client/profile/photo")
    para(doc, "Also: POST {AUTH}/account/client/photo")
    para(doc, "Content-Type: multipart/form-data. Field: file (image).")
    para(doc, 'Response 200: { "avatarUrl": "/uploads/…", "photoUrl": "/uploads/…" }')

    doc.add_heading("A4. GET lawyer profile — updated", 2)
    para(doc, "GET {MAIN}/lawyer/profile")
    para(
        doc,
        "Returns Settings shape: chamberAddress, barRoll, experienceYears, enrolmentDate, "
        "courtLevel, practiceAreas[], courts[], bio, language, verificationStatus, tier, vault[], "
        "plus fee fields. Same object is also nested under profile for older clients.",
    )

    doc.add_heading("A5. PATCH lawyer profile — updated", 2)
    para(doc, "PATCH {MAIN}/lawyer/profile")
    code(
        doc,
        """{
  "name": "Advocate Zainab Qazi",
  "email": "zainab.advocate@nexuslexis.law",
  "phone": "+92 300 9876543",
  "city": "Lahore",
  "chamberAddress": "Suite 402, High Court Bar Chambers, Lahore",
  "barRoll": "BC-LH-98421",
  "experienceYears": 12,
  "enrolmentDate": "2014-05-15",
  "courtLevel": "High Court Advocate",
  "practiceAreas": ["Corporate Law", "Civil Litigation"],
  "courts": ["High Court"],
  "bio": "…"
}""",
    )
    para(doc, "Changing bar credentials may set verification back to pending.")

    doc.add_heading("A6. POST lawyer photo — existing", 2)
    para(doc, "POST {MAIN}/lawyer/profile/photo")
    para(doc, "multipart field photo → { \"avatarUrl\": \"…\" }")

    doc.add_heading("A7. GET CA profile — updated", 2)
    para(doc, "GET {MAIN}/ca/profile")
    para(
        doc,
        "Adds icapNumber, firmName, ntn, targetSegment, specializations[], officeAddress, language, vault[].",
    )

    doc.add_heading("A8. PATCH CA profile — updated", 2)
    para(doc, "PATCH {MAIN}/ca/profile")
    code(
        doc,
        """{
  "name": "Ayesha Rahman, FCA",
  "email": "ayesha@rahmanandco.pk",
  "phone": "+92 321 5550199",
  "city": "Karachi",
  "officeAddress": "14th Floor, Progressive Centre",
  "icapNumber": "R-45281",
  "firmName": "Rahman & Co.",
  "ntn": "3123456-7",
  "targetSegment": "SMEs & Corporate Retainers",
  "specializations": ["Corporate Taxation", "Auditing"],
  "bio": "…",
  "language": "en"
}""",
    )

    doc.add_heading("A9. POST CA photo — existing", 2)
    para(doc, "POST {MAIN}/ca/profile/photo  field photo")

    doc.add_heading("A10. Vault upload — updated aliases", 2)
    para(doc, "POST {AUTH}/profile/documents/upload")
    para(doc, "multipart: file + docType")
    para(
        doc,
        "docType also accepts: bar_license, cnic, icap, fbr_ntn "
        "(plus barCertificate, cnicFront, cnicBack, caCertificate, photo, profilePhoto).",
    )
    para(doc, "GET {AUTH}/account/vault → { items: [ { id, docType, label, fileName, fileUrl, state } ] }")

    doc.add_heading("B. Shared account security — added", 1)
    para(doc, "Use Main {MAIN}/account/… or Auth {AUTH}/account/… (same behaviour).")

    doc.add_heading("B1. Change password", 2)
    para(doc, "POST /account/password")
    para(doc, "Headers: Authorization")
    code(doc, '{ "currentPassword": "oldpass12", "newPassword": "newpass12" }')
    para(doc, 'Response: { "ok": true }. 401 if current password is wrong.')

    doc.add_heading("B2. List sessions", 2)
    para(doc, "GET /account/sessions")
    para(doc, "Optional header X-Refresh-Token to mark current: true.")
    code(
        doc,
        """{
  "items": [
    {
      "id": "sess_1",
      "device": "Unknown device",
      "location": null,
      "ip": null,
      "lastActiveAt": "2026-11-06T18:00:00.000Z",
      "current": true
    }
  ]
}""",
    )

    doc.add_heading("B3. Revoke one session", 2)
    para(doc, "DELETE /account/sessions/:sessionId")
    para(doc, "Headers: Authorization   |   Body: none")

    doc.add_heading("B4. Revoke all other sessions", 2)
    para(doc, "POST /account/sessions/revoke-others")
    para(doc, "Optional X-Refresh-Token or body { \"refreshToken\": \"…\" } to keep current session.")

    doc.add_heading("B5. Language preference", 2)
    para(doc, "PATCH /account/preferences")
    code(doc, '{ "language": "en" }')
    para(doc, "language must be en or ur.")

    doc.add_heading("C. Admin Users APIs — added", 1)
    para(doc, "Base: {MAIN}/admin/users")
    para(doc, "Headers: Authorization: Bearer <admin token>. Admin role required.")

    rows_c = [
        ["C1 Stats", "GET", "/admin/users/stats", "none"],
        ["C2 List", "GET", "/admin/users", "query: q, tab, status, city, page, pageSize, sort"],
        ["C3 Detail", "GET", "/admin/users/:id", "none"],
        ["C4 Create", "POST", "/admin/users", "JSON identity + roles[] + sendInvite"],
        ["C5 Update", "PATCH", "/admin/users/:id", "JSON name, email, phone, city, cnic, barRoll, icap, firm, address"],
        ["C6 Roles", "PUT", "/admin/users/:id/roles", '{ "roles": ["client", "lawyer"] }'],
        ["C7 Approve", "POST", "/admin/users/:id/approve", '{ "approveVault": true, "notifyEmail": true, "roles": ["lawyer"] }'],
        ["C8 Reject vault", "POST", "/admin/users/:id/vault/:docId/reject", '{ "reason": "…" }'],
        ["C9 Suspend", "POST", "/admin/users/:id/suspend", '{ "reason": "…", "signOutSessions": true }'],
        ["C10 Reinstate", "POST", "/admin/users/:id/reinstate", '{ "note": "…" }'],
        ["C11 Reset password", "POST", "/admin/users/:id/reset-password", '{ "mode": "link" } or { "mode": "temporary" }'],
        ["C12 Email", "POST", "/admin/users/:id/email", '{ "template": "custom", "subject": "…", "body": "…" }'],
        ["C13 List sessions", "GET", "/admin/users/:id/sessions", "none"],
        ["C13 Revoke one", "DELETE", "/admin/users/:id/sessions/:sessionId", "none"],
        ["C13 Revoke others", "POST", "/admin/users/:id/sessions/revoke-others", "none"],
        ["C14 Matters", "GET", "/admin/users/:id/matters", "query page, pageSize"],
        ["C14 Documents", "GET", "/admin/users/:id/documents", "query page, pageSize"],
        ["C14 Payments", "GET", "/admin/users/:id/payments", "query page, pageSize"],
        ["C14 Audit", "GET", "/admin/users/:id/audit", "query page, pageSize"],
        ["C15 Bulk", "POST", "/admin/users/bulk", '{ "action": "approve|suspend|email", "userIds": [], "payload": {} }'],
    ]
    table(doc, ["Item", "Method", "Path", "Query / body"], rows_c)

    para(doc, "Create user body example:")
    code(
        doc,
        """{
  "name": "Matti Ullah",
  "email": "client@example.com",
  "phone": "+92 300 1234567",
  "city": "Lahore",
  "cnic": "34241-1234578-9",
  "roles": ["client", "lawyer"],
  "barRoll": "BC-LH-11111",
  "sendInvite": true
}""",
    )
    para(doc, "Bulk body example:")
    code(
        doc,
        """{
  "action": "approve",
  "userIds": ["12", "15"],
  "payload": { "reason": "Bulk suspension by Registry", "subject": "…", "body": "…" }
}""",
    )

    doc.add_heading("D. Apply (unchanged registration)", 1)
    para(
        doc,
        "These registration apply endpoints already existed. They are listed here so FE has one sheet. No path change.",
    )
    table(
        doc,
        ["Action", "Method", "Path", "Headers", "Body"],
        [
            [
                "Lawyer first-time apply",
                "POST",
                "{AUTH}/profile/lawyer/apply",
                "Authorization: Bearer <token>",
                "JSON: barCouncilName, barCouncilNumber, city, shortBio, fullBio, officeAddress, onlineFee, inPersonFee, documents",
            ],
            [
                "CA first-time apply",
                "POST",
                "{AUTH}/profile/ca/apply",
                "Authorization: Bearer <token>",
                "JSON: cnic, qualification, city, fees, plus CA credential fields",
            ],
        ],
    )
    para(doc, "After apply, GET {MAIN}/lawyer/profile or GET {MAIN}/ca/profile returns the saved Settings shape including vault.")

    doc.add_heading("E. Frontend mapping", 1)
    para(doc, "Wire the dashboard UI to these live endpoints. Replace MAIN and AUTH bases above.")
    table(
        doc,
        ["UI", "Method", "Path"],
        [
            ["Open Client profile", "GET", "{MAIN}/client/profile"],
            ["Save Client", "PUT", "{AUTH}/profile/client"],
            ["Client photo", "POST", "{MAIN}/client/profile/photo  (multipart field file)"],
            ["Open Lawyer profile", "GET", "{MAIN}/lawyer/profile"],
            ["Save Lawyer profile", "PATCH", "{MAIN}/lawyer/profile"],
            ["Lawyer photo", "POST", "{MAIN}/lawyer/profile/photo  (multipart field photo)"],
            ["Open CA profile", "GET", "{MAIN}/ca/profile"],
            ["Save CA profile", "PATCH", "{MAIN}/ca/profile"],
            ["CA photo", "POST", "{MAIN}/ca/profile/photo  (multipart field photo)"],
            ["Vault upload", "POST", "{AUTH}/profile/documents/upload  (multipart file + docType)"],
            ["Change password modal", "POST", "{MAIN}/account/password  or  {AUTH}/account/password"],
            ["Active sessions list", "GET", "{MAIN}/account/sessions"],
            ["Revoke one session", "DELETE", "{MAIN}/account/sessions/:sessionId"],
            ["Revoke other sessions", "POST", "{MAIN}/account/sessions/revoke-others"],
            ["Language preference", "PATCH", "{MAIN}/account/preferences"],
            ["Admin Users KPIs", "GET", "{MAIN}/admin/users/stats"],
            ["Admin Users table", "GET", "{MAIN}/admin/users"],
            ["Admin user drawer", "GET", "{MAIN}/admin/users/:id"],
            ["Admin create user", "POST", "{MAIN}/admin/users"],
            ["Admin edit user", "PATCH", "{MAIN}/admin/users/:id"],
            ["Admin manage roles", "PUT", "{MAIN}/admin/users/:id/roles"],
            ["Admin approve", "POST", "{MAIN}/admin/users/:id/approve"],
            ["Admin suspend / reinstate", "POST", "{MAIN}/admin/users/:id/suspend  ·  …/reinstate"],
            ["Admin reset password", "POST", "{MAIN}/admin/users/:id/reset-password"],
            ["Admin email", "POST", "{MAIN}/admin/users/:id/email"],
            ["Admin sessions", "GET/DELETE/POST", "{MAIN}/admin/users/:id/sessions…"],
            ["Admin bulk bar", "POST", "{MAIN}/admin/users/bulk"],
        ],
    )

    doc.save(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
