function isGraphDelegatedConfigured() {
  return Boolean(
    process.env.MS365_TENANT_ID
    && process.env.MS365_CLIENT_ID
    && process.env.MS365_CLIENT_SECRET
    && process.env.MS365_REFRESH_TOKEN
    && (process.env.MS365_SENDER || process.env.SMTP_USER)
  );
}

function getSenderAddress() {
  return process.env.MS365_SENDER || process.env.SMTP_USER;
}

async function getDelegatedAccessToken() {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;
  const refreshToken = process.env.MS365_REFRESH_TOKEN;

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Mail.Send offline_access',
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || response.statusText;
    throw new Error(`Delegated Graph auth failed: ${detail}`);
  }

  return data.access_token;
}

export async function verifyGraphDelegatedConnection() {
  if (!isGraphDelegatedConfigured()) {
    return { ok: false, error: 'Delegated Graph not configured (MS365_REFRESH_TOKEN missing)' };
  }

  try {
    await getDelegatedAccessToken();
    return { ok: true, provider: 'microsoft-graph-delegated', sender: getSenderAddress() };
  } catch (err) {
    return { ok: false, error: err.message, raw: err.message };
  }
}

export async function sendDelegatedGraphMail({ to, subject, text, html }) {
  const token = await getDelegatedAccessToken();
  const sender = getSenderAddress();

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
            emailAddress: { name: 'Nexus Lexis', address: sender },
          },
          body: {
            contentType: 'HTML',
            content: html || text.replace(/\n/g, '<br>'),
          },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!response.ok && response.status !== 202) {
    const detail = await response.text();
    throw new Error(detail || response.statusText);
  }

  console.log(`[graph-delegated] Accepted send to ${to} (${response.status})`);
  return { delivered: true, provider: 'microsoft-graph-delegated' };
}

export { isGraphDelegatedConfigured };
