function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_FROM || process.env.SMTP_FROM));
}

function getFromAddress() {
  return process.env.RESEND_FROM || process.env.SMTP_FROM;
}

export async function verifyResendConnection() {
  if (!isResendConfigured()) {
    return { ok: false, error: 'Resend not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });

    if (response.status === 401) {
      throw new Error('Invalid RESEND_API_KEY');
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || response.statusText);
    }

    return { ok: true, provider: 'resend', from: getFromAddress() };
  } catch (err) {
    return { ok: false, error: err.message, raw: err.message };
  }
}

export async function sendResendMail({ to, subject, text, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [to],
      subject,
      html: html || `<pre>${text}</pre>`,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.message || data.error || response.statusText;
    const err = new Error(`Resend failed: ${detail}`);
    err.code = 'RESEND_SEND_FAILED';
    throw err;
  }

  return { delivered: true, provider: 'resend', id: data.id };
}

export { isResendConfigured };
