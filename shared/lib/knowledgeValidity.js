/**
 * Knowledge Bank 6-month validity helpers (NL-BE-KB-DYN-001).
 * Applies to: articles, summaries, free (accessType=public) templates.
 */
export const VALIDITY_MONTHS = 6;

export function parseIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIso(value) {
  const d = parseIsoDate(value);
  return d ? d.toISOString() : null;
}

/** verifiedAt + 6 calendar months */
export function expiresAtFrom(verifiedAt) {
  const d = parseIsoDate(verifiedAt);
  if (!d) return null;
  const exp = new Date(d.getTime());
  exp.setUTCMonth(exp.getUTCMonth() + VALIDITY_MONTHS);
  return exp.toISOString();
}

export function isExpired(verifiedAt, now = new Date()) {
  const exp = expiresAtFrom(verifiedAt);
  if (!exp) return false;
  return parseIsoDate(now).getTime() > parseIsoDate(exp).getTime();
}

/**
 * Resolve stamp for write:
 * - explicit verifiedAt wins
 * - on publish/public activate with no stamp → now()
 * - else keep existing
 */
export function resolveVerifiedAt({
  verifiedAt,
  existingVerifiedAt = null,
  stampNow = false,
} = {}) {
  if (verifiedAt !== undefined && verifiedAt !== null && verifiedAt !== '') {
    const parsed = parseIsoDate(verifiedAt);
    if (!parsed) {
      const err = new Error('verifiedAt must be a valid ISO-8601 timestamp');
      err.status = 422;
      err.fields = { verifiedAt: 'invalid' };
      throw err;
    }
    return parsed.toISOString();
  }
  if (stampNow) {
    return (parseIsoDate(existingVerifiedAt) || new Date()).toISOString();
  }
  return toIso(existingVerifiedAt);
}

/** SQL fragment: row is still within 6 months of verified_at (null = not expired). */
export function notExpiredSql(column = 'verified_at') {
  return `(${column} IS NULL OR ${column} > (CURRENT_TIMESTAMP - INTERVAL '${VALIDITY_MONTHS} months'))`;
}
