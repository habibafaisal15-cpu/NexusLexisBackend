"""Build FE Hostinger Google Sign-In handoff Word document."""
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from pathlib import Path

OUT = Path(__file__).with_name("Frontend_Hostinger_Google_SignIn_Handoff.docx")


def set_run_font(run, size=11, bold=False, code=False):
    run.bold = bold
    run.font.size = Pt(size)
    font_name = "Consolas" if code else "Calibri"
    run.font.name = font_name
    r_pr = run._element.get_or_add_rPr()
    r_fonts = r_pr.get_or_add_rFonts()
    r_fonts.set(qn("w:ascii"), font_name)
    r_fonts.set(qn("w:hAnsi"), font_name)


def add_para(doc, text, bold=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_font(run, bold=bold)
    p.paragraph_format.space_after = Pt(6)
    return p


def add_bullet(doc, text, bold_prefix=None):
    p = doc.add_paragraph(style="List Bullet")
    if bold_prefix:
        r1 = p.add_run(bold_prefix)
        set_run_font(r1, bold=True)
        r2 = p.add_run(text)
        set_run_font(r2)
    else:
        r = p.add_run(text)
        set_run_font(r)
    return p


def add_code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(8)
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), "F5F5F5")
    shd.set(qn("w:val"), "clear")
    p.paragraph_format.element.get_or_add_pPr().append(shd)
    for line in text.strip("\n").split("\n"):
        run = p.add_run(line + "\n")
        set_run_font(run, size=9, code=True)
    return p


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        r = cell.paragraphs[0].add_run(h)
        set_run_font(r, bold=True, size=10)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = ""
            r = cell.paragraphs[0].add_run(str(val))
            set_run_font(r, size=10)
    doc.add_paragraph()
    return table


def main():
    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.85)
        section.right_margin = Inches(0.85)

    title = doc.add_heading(
        "Frontend Handoff — Hostinger Google Sign-In (NexusLexis)", 0
    )
    for run in title.runs:
        set_run_font(run, size=18, bold=True)

    for k, v in [
        ("Date", "16 Oct 2026"),
        ("Site", "https://nexuslexis.law (Hostinger)"),
        ("Auth API", "https://nexus-lexis-backend-45v4.vercel.app/api/auth"),
        ("Status", "Backend ready. FE + Hostinger uploads required."),
    ]:
        p = doc.add_paragraph()
        r1 = p.add_run(f"{k}: ")
        set_run_font(r1, bold=True)
        r2 = p.add_run(v)
        set_run_font(r2)
        p.paragraph_format.space_after = Pt(2)

    doc.add_heading("1. Problem (what is broken today)", 1)
    add_table(
        doc,
        ["Issue", "Evidence"],
        [
            [
                "Google signup stuck on Hostinger",
                "Live bundle still uses GoogleOAuthProvider → POST /google/token",
            ],
            [
                "SPA routes 404",
                "/login, /signup, /account, etc. return 404; only / works",
            ],
            [
                "Google return URL broken",
                "Auth used to send users to /login?token=… → Hostinger 404",
            ],
            [
                "Netlify OK, Hostinger not",
                "nexuslexis.netlify.app/login works (SPA rewrite); Hostinger has none",
            ],
        ],
    )
    p = doc.add_paragraph()
    r = p.add_run("Do not keep GIS popup on Hostinger. ")
    set_run_font(r, bold=True)
    r2 = p.add_run(
        "It causes FETCH_ERROR / origin_mismatch. Use full-page redirect."
    )
    set_run_font(r2)

    doc.add_heading("2. Required Hostinger uploads (do first)", 1)
    add_para(
        doc,
        "Upload these two files into public_html (same folder as index.html):",
    )
    add_table(
        doc,
        ["Source in backend repo", "Upload as"],
        [
            ["docs/hostinger/.htaccess", "public_html/.htaccess"],
            ["docs/hostinger/google-auth.html", "public_html/google-auth.html"],
        ],
    )
    add_para(doc, "Or download from live Auth API:")
    add_bullet(
        doc,
        "https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/.htaccess",
    )
    add_bullet(
        doc,
        "https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/hostinger/google-auth.html",
    )

    doc.add_heading("What each file does", 2)
    add_bullet(
        doc,
        " — Apache SPA fallback so /login, /signup, /account serve index.html (no more 404).",
        bold_prefix=".htaccess",
    )
    add_bullet(
        doc,
        " — After Google OAuth, Auth redirects here with ?token=&refreshToken=. "
        "Writes sessionStorage keys (accessToken, token, refreshToken), then sends user to /.",
        bold_prefix="google-auth.html",
    )

    doc.add_heading("Verify uploads", 2)
    add_code(
        doc,
        """https://nexuslexis.law/login              → 200 (app shell, not Hostinger 404)
https://nexuslexis.law/signup             → 200
https://nexuslexis.law/google-auth.html   → 200 (“Signing you in…”)""",
    )

    doc.add_heading("3. Required code change — Google button", 1)
    doc.add_heading("Remove (production Hostinger)", 2)
    add_bullet(
        doc,
        "@react-oauth/google / GoogleOAuthProvider / GIS popup button for Hostinger production",
    )
    add_bullet(doc, "POST /google/token as the primary path")

    doc.add_heading("Add — redirect start", 2)
    add_code(
        doc,
        """const AUTH =
  import.meta.env.VITE_AUTH_API_URL ||
  'https://nexus-lexis-backend-45v4.vercel.app/api/auth';

/**
 * Full-page Google sign-in (no popup, no CORS XHR).
 * @param {'client'|'lawyer'|'ca'} role
 */
export function startGoogleSignIn(role = 'client') {
  const safeRole = ['client', 'lawyer', 'ca'].includes(role) ? role : 'client';
  // Warm Auth cold start (optional)
  fetch(`${AUTH}/ping`).catch(() => {});
  const returnTo = encodeURIComponent(window.location.origin);
  window.location.href =
    `${AUTH}/google/start?role=${encodeURIComponent(safeRole)}&returnTo=${returnTo}`;
}""",
    )

    add_para(doc, "Wire Login / SignUp Google buttons:")
    add_code(
        doc,
        """<button type="button" onClick={() => startGoogleSignIn(selectedRole || 'client')}>
  Continue with Google
</button>""",
    )
    add_para(doc, "On SignUp, pass the selected role (client | lawyer | ca).")

    doc.add_heading("Optional: warm Auth on app boot", 2)
    add_code(
        doc,
        """useEffect(() => {
  fetch(`${AUTH}/ping`).catch(() => {});
}, []);""",
    )

    doc.add_heading("4. End-to-end flow (after FE change)", 1)
    add_code(
        doc,
        """User clicks “Continue with Google”
  → GET {AUTH}/google/start?role=…&returnTo=https://nexuslexis.law
  → Google consent screen
  → GET {AUTH}/google/callback?code=…
  → 302 → https://nexuslexis.law/google-auth.html?token=…&refreshToken=…
  → google-auth.html writes sessionStorage
  → redirect → /
  → React app sees accessToken → treat as logged in → GET /me for user""",
    )

    doc.add_heading("Error return", 2)
    add_code(doc, "/google-auth.html?googleError=<message>&next=/login")
    add_para(doc, "Show the message or send user to /login.")

    doc.add_heading("5. sessionStorage contract (already used by live FE)", 1)
    add_para(
        doc, "google-auth.html writes the same keys as current tokenStorage:"
    )
    add_table(
        doc,
        ["Key", "Value"],
        [
            ["accessToken", "JWT"],
            ["token", "same JWT (alias)"],
            ["refreshToken", "refresh token"],
            ["user", "cleared; refill via GET /me"],
        ],
    )
    add_para(
        doc,
        "After landing on /, call GET {AUTH}/me with Authorization: Bearer <accessToken> "
        "and hydrate Redux / auth context.",
    )

    doc.add_heading("6. Google Cloud Console checklist", 1)
    add_para(doc, "OAuth client type: Web application")
    doc.add_heading("Authorized JavaScript origins", 2)
    for origin in [
        "https://nexuslexis.law",
        "https://www.nexuslexis.law",
        "https://nexuslexis.netlify.app",
        "http://localhost:5173 (local)",
    ]:
        add_bullet(doc, origin)
    doc.add_heading(
        "Authorized redirect URIs (exact — Auth callback, not the FE domain)", 2
    )
    add_bullet(
        doc,
        "https://nexus-lexis-backend-45v4.vercel.app/api/auth/google/callback",
    )
    add_para(
        doc,
        "Client ID in FE must match Vercel env GOOGLE_CLIENT_ID on Auth.",
    )

    doc.add_heading("7. Auth API cheat sheet", 1)
    add_para(
        doc,
        "Base: https://nexus-lexis-backend-45v4.vercel.app/api/auth",
    )
    add_table(
        doc,
        ["Method", "Path", "Use"],
        [
            ["GET", "/ping", "Warm-up"],
            ["GET", "/config", 'Includes googleAuth.recommendedMode: "redirect"'],
            ["GET", "/google/start?role=&returnTo=", "Primary Google entry"],
            ["GET", "/google/callback", "Google → FE (do not call from FE)"],
            ["POST", "/google/token", "Legacy GIS only — avoid on Hostinger"],
            ["GET", "/me", "Current user + verification / re-apply flags"],
            ["POST", "/login", "Email/password"],
            ["POST", "/refresh", "Body { refreshToken }"],
        ],
    )

    doc.add_heading(
        "8. Related: lawyer reject → show Rejected + allow re-apply", 1
    )
    add_para(
        doc, "After admin rejects a lawyer, Auth returns (login / refresh / /me):"
    )
    add_code(
        doc,
        """{
  "user": {
    "verificationStatus": "Rejected",
    "canAccessDashboard": false,
    "nextStep": "complete_lawyer_application",
    "pendingVerificationRole": null,
    "canReapply": true,
    "canApplyAsLawyer": true,
    "message": "Your lawyer application was rejected. You can update your details and apply for verification again."
  },
  "accountAccess": { "...same fields..." }
}""",
    )

    doc.add_heading("FE routing rules", 2)
    add_table(
        doc,
        ["Condition", "UI"],
        [
            [
                "nextStep === 'verification_pending' OR pendingVerificationRole set",
                "Pending verification screen only",
            ],
            [
                "verificationStatus === 'Rejected' OR canReapply === true",
                "Rejected message + re-open lawyer apply form",
            ],
            [
                "canApplyAsLawyer === true",
                "Enable POST /profile/lawyer/apply again",
            ],
        ],
    )
    add_para(doc, "Do not treat Rejected as Pending.")
    add_para(
        doc,
        "Do not gate apply only on ApplicationRequired — rejected users keep a "
        "profile row but must re-apply.",
    )

    doc.add_heading("9. Acceptance checklist", 1)
    for item in [
        ".htaccess uploaded to Hostinger public_html",
        "google-auth.html uploaded to Hostinger public_html",
        "/login and /signup return 200 (hard refresh)",
        "Google button uses window.location.href → /google/start (no GIS popup on Hostinger)",
        "Google signup completes → lands on site logged in",
        "Lawyer rejected in admin → FE shows Rejected + can submit apply again",
        "Google Console origins + redirect URI match section 6",
    ]:
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run("☐  " + item)
        set_run_font(r)

    doc.add_heading("10. Troubleshooting", 1)
    add_table(
        doc,
        ["Symptom", "Fix"],
        [
            [
                "Error 400: origin_mismatch",
                "Add site origin to Google Console JS origins",
            ],
            [
                "Unable to reach the server / RTK FETCH_ERROR",
                "Stop using /google/token; use /google/start",
            ],
            [
                "Google finishes → blank / Hostinger 404",
                "Upload .htaccess + google-auth.html",
            ],
            [
                "Stuck on “Signing you in…”",
                "Check google-auth.html query has token; check sessionStorage",
            ],
            [
                "Logged in but no user name",
                "Call GET /me after bridge redirect",
            ],
            [
                "Redirect URI mismatch",
                "Only Auth callback URL in Google Console (see section 6)",
            ],
        ],
    )

    doc.add_heading("11. Files in this backend repo", 1)
    add_table(
        doc,
        ["Path", "Purpose"],
        [
            ["docs/hostinger/.htaccess", "SPA rewrite for Hostinger"],
            ["docs/hostinger/google-auth.html", "Token bridge page"],
            ["docs/hostinger/README.md", "Short upload note"],
            ["docs/Frontend_Google_Redirect_Fix.md", "Short version of this handoff"],
            [
                "docs/Frontend_Hostinger_Google_SignIn_Handoff.md",
                "Markdown source of this document",
            ],
            [
                "docs/Frontend_Hostinger_Google_SignIn_Handoff.docx",
                "This Word document for FE sharing",
            ],
        ],
    )

    doc.save(OUT)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
