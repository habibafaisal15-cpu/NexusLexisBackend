export function isUniqueViolation(err) {
  return err?.code === '23505';
}

export function uniqueConstraintField(err) {
  const detail = String(err?.detail || err?.constraint || '').toLowerCase();
  if (detail.includes('username')) return 'username';
  if (detail.includes('email')) return 'email';
  return 'unknown';
}

export function friendlyUniqueViolationMessage(err) {
  const field = uniqueConstraintField(err);
  if (field === 'username') {
    return 'Could not complete signup. Please try again.';
  }
  if (field === 'email') {
    return 'An account with this email already exists';
  }
  return 'This account already exists';
}
