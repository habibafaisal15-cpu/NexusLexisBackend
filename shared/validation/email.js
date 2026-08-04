import dns from 'dns/promises';

const EMAIL_FORMAT_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'throwaway.email',
  'yopmail.com',
  'getnada.com',
  'sharklasers.com',
  'trashmail.com',
  'maildrop.cc',
  'dispostable.com',
  'fakeinbox.com',
  'mintemail.com',
  'mytemp.email',
  'tempail.com',
  'emailondeck.com',
  'spamgourmet.com',
  'mailnesia.com',
  'moakt.com',
  'inboxkitten.com',
]);

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

function getDomain(email) {
  return email.split('@')[1] || '';
}

export function isValidEmailFormat(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;

  const [localPart, domain] = normalized.split('@');
  if (!localPart || !domain || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return false;
  }

  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || !/^[a-z]+$/i.test(tld)) {
    return false;
  }

  return EMAIL_FORMAT_RE.test(normalized);
}

export function isValidEmail(email) {
  return isValidEmailFormat(email);
}

export function isDisposableEmail(email) {
  const domain = getDomain(normalizeEmail(email));
  return DISPOSABLE_DOMAINS.has(domain);
}

async function domainAcceptsMail(domain) {
  let resolverUnavailable = false;

  const withTimeout = (promise, ms = 3000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error('DNS timeout'), { code: 'ETIMEOUT' })), ms);
      }),
    ]);

  try {
    const mxRecords = await withTimeout(dns.resolveMx(domain));
    if (mxRecords?.length > 0) return { ok: true };
  } catch (err) {
    if (isDnsResolverError(err)) {
      resolverUnavailable = true;
    }
  }

  try {
    const addresses = await withTimeout(dns.resolve4(domain));
    if (addresses?.length > 0) return { ok: true };
  } catch (err) {
    if (isDnsResolverError(err)) {
      resolverUnavailable = true;
    } else {
      return { ok: false };
    }
  }

  if (resolverUnavailable) {
    return { ok: true, skipped: true };
  }

  return { ok: false };
}

function isDnsResolverError(err) {
  return ['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL'].includes(err?.code);
}

export async function validateEmailForSignup(email, { checkMx = true } = {}) {
  const normalized = normalizeEmail(email);

  if (!isValidEmailFormat(normalized)) {
    return {
      valid: false,
      code: 'INVALID_FORMAT',
      error: 'Please provide a valid email address',
    };
  }

  if (isDisposableEmail(normalized)) {
    return {
      valid: false,
      code: 'DISPOSABLE_EMAIL',
      error: 'Temporary or disposable email addresses are not allowed',
    };
  }

  const skipMx = process.env.EMAIL_SKIP_MX_CHECK === 'true' || Boolean(process.env.VERCEL);
  if (checkMx && !skipMx) {
    const domain = getDomain(normalized);
    const domainCheck = await domainAcceptsMail(domain);
    if (!domainCheck.ok) {
      return {
        valid: false,
        code: 'DOMAIN_NOT_FOUND',
        error: 'This email domain cannot receive mail. Use a real email address.',
      };
    }
  }

  return { valid: true, email: normalized };
}
