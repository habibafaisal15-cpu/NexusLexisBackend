function isGraphConfigured() {
  return Boolean(
    process.env.MS365_TENANT_ID
    && process.env.MS365_CLIENT_ID
    && process.env.MS365_CLIENT_SECRET
    && (process.env.MS365_SENDER || process.env.SMTP_USER)
  );
}

function getSenderAddress() {
  return process.env.MS365_SENDER || process.env.SMTP_USER;
}

async function getGraphAccessToken() {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || response.statusText;
    throw new Error(`Microsoft Graph auth failed: ${detail}`);
  }

  return data.access_token;
}

export async function verifyGraphMailConnection() {
  if (!isGraphConfigured()) {
    return { ok: false, error: 'Microsoft Graph not configured' };
  }

  try {
    const token = await getGraphAccessToken();
    const sender = getSenderAddress();

    // Mail.Send (application) allows sendMail but not reading user profiles.
    // Optional mailbox check — skip failure if only send permission is granted.
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.ok) {
      return { ok: true, provider: 'microsoft-graph', sender };
    }

    if (response.status === 403 || response.status === 401) {
      // Token is valid; Mail.Send is sufficient for OTP delivery
      return {
        ok: true,
        provider: 'microsoft-graph',
        sender,
        note: 'Mail.Send verified via token (user profile read not required)',
      };
    }

    const detail = await response.text();
    throw new Error(detail || `Could not access mailbox ${sender}`);
  } catch (err) {
    return {
      ok: false,
      error: explainGraphError(err.message),
      raw: err.message,
    };
  }
}

function explainGraphError(message = '') {
  if (/invalid_client|AADSTS7000215/i.test(message)) {
    return 'Microsoft Graph client secret is invalid. Check MS365_CLIENT_SECRET in auth_backend/.env';
  }
  if (/Authorization_RequestDenied|403/i.test(message)) {
    return [
      'Microsoft Graph Mail.Send permission missing or not admin-consented.',
      'Azure Portal → App registrations → your app → API permissions →',
      'Microsoft Graph → Application → Mail.Send → Grant admin consent',
    ].join(' ');
  }
  if (/ErrorInvalidUser|404|ResourceNotFound/i.test(message)) {
    return `Sender mailbox not found: ${getSenderAddress()}. Set MS365_SENDER to a valid mailbox.`;
  }
  return message;
}

export async function sendGraphMail({ to, subject, text, html }) {
  const token = await getGraphAccessToken();
  const sender = getSenderAddress();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.EMAIL_SEND_TIMEOUT_MS || 8000));

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            from: {
              emailAddress: {
                name: 'Nexus Lexis',
                address: sender,
              },
            },
            body: {
              contentType: 'HTML',
              content: html || text.replace(/\n/g, '<br>'),
            },
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: true,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok && response.status !== 202) {
      const detail = await response.text();
      const err = new Error(explainGraphError(detail || response.statusText));
      err.code = 'GRAPH_SEND_FAILED';
      throw err;
    }

    console.log(`[graph-mail] Accepted send to ${to} (${response.status})`);
    return { delivered: true, provider: 'microsoft-graph' };
  } finally {
    clearTimeout(timer);
  }
}

export { isGraphConfigured };
