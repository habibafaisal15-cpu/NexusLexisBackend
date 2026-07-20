# Production email — Microsoft 365 (Option A)

Long-term OTP delivery using **Application Mail.Send** (no refresh tokens, no SMTP passwords in production).

---

## Architecture

```
Sign-up → auth_backend → Microsoft Graph (app credentials)
                              → sends as noreply@nexuslexis.law
                              → Gmail / any recipient
```

---

## Part 1 — Microsoft admin (one-time)

### 1. Create system mailbox

In [admin.microsoft.com](https://admin.microsoft.com) → **Users** → **Add user**:

| Field | Value |
|-------|--------|
| Name | Nexus Lexis Mailer |
| Email | **noreply@nexuslexis.law** |
| Password | Strong random password (store in password manager) |
| **MFA** | **Do not enable** (service account) |
| License | Any mailbox license (Exchange Online) |

### 2. Azure app permissions (already mostly done)

App: **Nexus Lexis OTP Mail** (`591c9f09-92bc-4d4e-828c-a82354599029`)

Required permission:

| API | Type | Permission | Status |
|-----|------|------------|--------|
| Microsoft Graph | **Application** | **Mail.Send** | Must show green ✓ Granted |

Do **not** rely on Delegated Mail.Send or SMTP in production.

### 3. Open Microsoft support ticket (critical)

Manual Outlook from `contact@` → Gmail **works**.  
Graph Application send → **550 5.7.708** (IP blocked).

**admin.microsoft.com** → **Help & support** → New request:

```
Subject: Enable outbound Graph/application mail — 550 5.7.708

Outbound email sent via Microsoft Graph API (Application Mail.Send) from our
Azure app (client ID 591c9f09-92bc-4d4e-828c-a82354599029) as
noreply@nexuslexis.law fails when delivering to external recipients (Gmail).

Error:
550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP.

Manual sends from the same tenant mailboxes to Gmail succeed.
Please enable application/API outbound mail for our tenant or remove the
IP block affecting Graph sendMail submissions.

Domain: nexuslexis.law
Sender: noreply@nexuslexis.law
```

Wait for Microsoft to confirm resolution before go-live.

### 4. Security Defaults (if SMTP ever needed for debugging)

For **production Graph-only**, Security Defaults is less critical, but if you previously blocked app paths:

- [entra.microsoft.com](https://entra.microsoft.com) → **Properties** → **Security defaults** → review policy with admin

Production uses **Application Graph only** — not SMTP AUTH.

---

## Part 2 — DNS (required for Gmail deliverability)

In domain registrar (where `nexuslexis.law` DNS is managed):

### SPF (TXT on `@` or root)

```
v=spf1 include:spf.protection.outlook.com -all
```

### DKIM

1. [admin.microsoft.com](https://admin.microsoft.com) → **Settings** → **Domains** → `nexuslexis.law`
2. **DKIM** → Enable → copy **two CNAME records** to DNS
3. Wait for **Verified**

### DMARC (TXT on `_dmarc`)

```
v=DMARC1; p=none; rua=mailto:contact@nexuslexis.law
```

After 30 days stable delivery, consider `p=quarantine`.

Verify: [mxtoolbox.com/spf.aspx](https://mxtoolbox.com/spf.aspx) → enter `nexuslexis.law`

---

## Part 3 — Production `.env` (auth server)

Copy `auth_backend/.env.production.example` → `.env` on server:

```env
NODE_ENV=production
REQUIRE_EMAIL_DELIVERY=true

EMAIL_PROVIDER=graph

MS365_TENANT_ID=4dc5e429-4704-452e-8104-16e99619c70b
MS365_CLIENT_ID=591c9f09-92bc-4d4e-828c-a82354599029
MS365_CLIENT_SECRET=<rotate before production>
MS365_SENDER=noreply@nexuslexis.law

# Do NOT set in production:
# MS365_REFRESH_TOKEN
# SMTP_*
```

Rotate `MS365_CLIENT_SECRET` in Azure before launch; update `.env`; restart auth API.

---

## Part 4 — Verify before go-live

On the production server (or locally after `.env` update):

```bash
cd auth_backend
npm run test:email
npm run test:email:send your@gmail.com
```

Success = email arrives in inbox (check spam once).

Then test full sign-up on the live site.

---

## Part 5 — Secret rotation (ongoing)

| Secret | Rotation |
|--------|----------|
| `MS365_CLIENT_SECRET` | Every 12–24 months (Azure → Certificates & secrets) |
| `JWT_SECRET` | On compromise or annual |
| App passwords / SMTP | **Not used in production** |

---

## Checklist

```
□ noreply@nexuslexis.law mailbox created (no MFA)
□ Application Mail.Send granted + admin consent
□ Microsoft ticket submitted for 550 5.7.708
□ Microsoft confirms outbound Graph mail works
□ SPF + DKIM + DMARC configured
□ Production .env uses graph only + noreply@ sender
□ test:email + test:email:send pass to external Gmail
□ Live sign-up OTP tested
```

---

## Until Microsoft fixes 5.7.708

| Method | Use for |
|--------|---------|
| **Sign up with Google** | Dev / demo |
| **Delegated Graph** (`setup:graph-mail`) | Temporary dev only |
| **Application Graph** | Production (after ticket resolved) |

When the ticket is resolved, reply **“Microsoft fixed mail”** and we will switch sender to `noreply@` and run final tests.
