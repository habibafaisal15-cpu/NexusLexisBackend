import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './index.js';
import { ensureAccountSchema } from './ensureAccountSchema.js';
import { listVaultForUser, vaultItem } from './vaultHelper.js';
import { syncToDashboardUser } from '../auth_backend/db/userSync.js';

function iso(d) {
  return d ? new Date(d).toISOString() : null;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function writeAudit({ actorAdminId, accountId, action, meta = {} }) {
  await ensureAccountSchema();
  await query(
    `INSERT INTO admin_audit_logs (actor_admin_id, account_id, action, meta)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorAdminId || null, accountId || null, action, JSON.stringify(meta)]
  );
}

function accountStatus(row) {
  if (row.is_active === false || row.account_status === 'suspended') return 'suspended';
  const lawyerPending = row.lawyer_stat === 'pending';
  const caPending = row.ca_stat === 'pending';
  if (lawyerPending || caPending) return 'pending';
  if (!row.lawyer_id && !row.ca_id && !row.client_id) return 'new';
  return row.account_status || 'active';
}

function rolesOf(row) {
  const roles = [];
  if (row.client_id || row.role === 'client' || row.active_role === 'client') roles.push('client');
  if (row.lawyer_id) roles.push('lawyer');
  if (row.ca_id) roles.push('ca');
  if (!roles.length && row.role && row.role !== 'admin') roles.push(row.role);
  return [...new Set(roles)];
}

function listItem(row) {
  return {
    id: String(row.id),
    name: row.username,
    email: row.email,
    phone: row.phone || null,
    roles: rolesOf(row),
    status: accountStatus(row),
    city: row.city || row.lawyer_city || row.ca_city || null,
    cnic: row.cnic || row.lawyer_cnic || row.ca_cnic || null,
    barRoll: row.bar_council_num || null,
    icap: row.icap_membership_no || null,
    joinedAt: iso(row.date_joined),
    lastActiveAt: iso(row.last_active_at),
    avatarUrl: row.avatar_url || row.lawyer_photo || row.ca_photo || null,
  };
}

const BASE_FROM = `
  FROM users u
  LEFT JOIN client_profiles cp ON cp.user_id = u.id
  LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id
  LEFT JOIN ca_profiles cap ON cap.user_id = u.id
`;

const BASE_SELECT = `
  SELECT u.id, u.username, u.email, u.phone, u.role, u.active_role, u.is_active,
         u.date_joined, u.language_pref, u.avatar_url, u.last_active_at,
         u.account_status, u.suspend_reason,
         cp.id AS client_id, cp.cnic, cp.city,
         lp.id AS lawyer_id, lp.verification_stat AS lawyer_stat, lp.city AS lawyer_city,
         lp.cnic AS lawyer_cnic, lp.bar_council_num, lp.photo AS lawyer_photo,
         lp.court_level, lp.membership_tier, lp.office_address AS lawyer_address, lp.full_name AS lawyer_name,
         cap.id AS ca_id, cap.verification_stat AS ca_stat, cap.city AS ca_city,
         cap.cnic AS ca_cnic, cap.icap_membership_no, cap.photo AS ca_photo,
         cap.firm_name, cap.office_address AS ca_address
`;

export async function getUserStats() {
  await ensureAccountSchema();
  const users = await query(`${BASE_SELECT} ${BASE_FROM} WHERE COALESCE(u.role, 'client') <> 'admin'`);
  const rows = users.rows;
  const items = rows.map(listItem).filter((u) => u.email);
  return {
    total: items.length,
    pending: items.filter((u) => u.status === 'pending' || u.status === 'new').length,
    lawyers: items.filter((u) => u.roles.includes('lawyer')).length,
    cas: items.filter((u) => u.roles.includes('ca')).length,
    clients: items.filter((u) => u.roles.includes('client')).length,
    suspended: items.filter((u) => u.status === 'suspended').length,
    multi: items.filter((u) => u.roles.length > 1).length,
  };
}

export async function listUsers({ q, tab = 'all', status, city, page = 1, pageSize = 20, sort = 'newest' }) {
  await ensureAccountSchema();
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const result = await query(`${BASE_SELECT} ${BASE_FROM} ORDER BY u.date_joined DESC`);
  let items = result.rows.map(listItem);

  if (q) {
    const needle = String(q).toLowerCase();
    items = items.filter((u) =>
      [u.name, u.email, u.phone, u.cnic, u.barRoll, u.icap, u.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }
  if (city) items = items.filter((u) => String(u.city || '').toLowerCase() === String(city).toLowerCase());
  if (status) items = items.filter((u) => u.status === status);
  if (tab === 'client') items = items.filter((u) => u.roles.includes('client'));
  if (tab === 'lawyer') items = items.filter((u) => u.roles.includes('lawyer'));
  if (tab === 'ca') items = items.filter((u) => u.roles.includes('ca'));
  if (tab === 'multi') items = items.filter((u) => u.roles.length > 1);
  if (tab === 'pending') items = items.filter((u) => u.status === 'pending' || u.status === 'new');
  if (tab === 'suspended') items = items.filter((u) => u.status === 'suspended');

  if (sort === 'oldest') items = items.reverse();
  if (sort === 'name') items = items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (sort === 'last_active') {
    items = items.sort((a, b) => String(b.lastActiveAt || '').localeCompare(String(a.lastActiveAt || '')));
  }

  const total = items.length;
  const start = (pageNum - 1) * size;
  return { items: items.slice(start, start + size), page: pageNum, pageSize: size, total };
}

async function loadUserRow(id) {
  const result = await query(`${BASE_SELECT} ${BASE_FROM} WHERE u.id = $1`, [id]);
  return result.rows[0] || null;
}

export async function getUserDetail(id) {
  await ensureAccountSchema();
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const item = listItem(row);
  const vault = await listVaultForUser(id);
  return {
    ...item,
    suspendReason: row.suspend_reason || null,
    profiles: {
      lawyer: {
        enabled: Boolean(row.lawyer_id),
        barRoll: row.bar_council_num || null,
        court: row.court_level || null,
        tier: row.membership_tier || null,
        address: row.lawyer_address || null,
      },
      client: { enabled: Boolean(row.client_id) || item.roles.includes('client') },
      ca: {
        enabled: Boolean(row.ca_id),
        icap: row.icap_membership_no || null,
        firm: row.firm_name || null,
        address: row.ca_address || null,
      },
    },
    vault,
  };
}

export async function createUser(body, actorAdminId) {
  await ensureAccountSchema();
  const email = String(body.email || '').toLowerCase().trim();
  const name = String(body.name || '').trim();
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles.map((r) => String(r).toLowerCase()) : ['client'];
  if (!email || !name) throw httpError(400, 'name and email are required');
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rows[0]) throw httpError(409, 'An account with this email already exists');

  const primaryRole = roles.includes('lawyer') ? 'lawyer' : roles.includes('ca') ? 'ca' : 'client';
  const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
  const hash = await bcrypt.hash(tempPassword, 8);

  const auth = await query(
    `INSERT INTO auth_users (full_name, email, password_hash, role, auth_provider, phone)
     VALUES ($1, $2, $3, $4, 'local', $5)
     RETURNING id, full_name, email, role, auth_provider, is_active, phone, password_hash`,
    [name, email, hash, primaryRole, body.phone || null]
  );
  const authUser = auth.rows[0];
  const dashboard = await syncToDashboardUser(authUser, hash);

  if (body.city || body.cnic || roles.includes('client')) {
    await query(
      `INSERT INTO client_profiles (user_id, cnic, city, documents)
       VALUES ($1, $2, $3, '{}'::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET cnic = COALESCE(EXCLUDED.cnic, client_profiles.cnic), city = COALESCE(EXCLUDED.city, client_profiles.city)`,
      [dashboard.id, body.cnic || null, body.city || null]
    ).catch(async () => {
      await query(
        `INSERT INTO client_profiles (user_id, cnic, city, documents) VALUES ($1, $2, $3, '{}'::jsonb)`,
        [dashboard.id, body.cnic || null, body.city || null]
      ).catch(() => {});
    });
  }

  if (roles.includes('lawyer')) {
    await query(
      `INSERT INTO lawyer_profiles
        (user_id, full_name, cnic, bar_council_name, bar_council_num, city, practice_area, language, short_bio, full_bio, online_fee, inperson_fee, office_address, verification_stat)
       VALUES ($1, $2, $3, $4, $5, $6, 'General', 'English', '', '', 0, 0, $7, 'pending')
       ON CONFLICT (user_id) DO NOTHING`,
      [
        dashboard.id,
        name,
        body.cnic || `pending-${dashboard.id}`,
        'Bar Council',
        body.barRoll || `PENDING-${dashboard.id}`,
        body.city || 'Lahore',
        body.address || null,
      ]
    ).catch(() => {});
  }

  if (roles.includes('ca')) {
    await query(
      `INSERT INTO ca_profiles
        (user_id, full_name, cnic, qualification, city, fees, icap_membership_no, office_address, verification_stat)
       VALUES ($1, $2, $3, 'CA', $4, 0, $5, $6, 'pending')
       ON CONFLICT (user_id) DO NOTHING`,
      [dashboard.id, name, body.cnic || `pending-${dashboard.id}`, body.city || 'Lahore', body.icap || null, body.address || null]
    ).catch(() => {});
  }

  await query(
    `UPDATE users SET phone = COALESCE($1, phone), account_status = $2 WHERE id = $3`,
    [body.phone || null, roles.some((r) => r === 'lawyer' || r === 'ca') ? 'pending' : 'new', dashboard.id]
  );

  await writeAudit({ actorAdminId, accountId: dashboard.id, action: 'user.created', meta: { email, roles } });

  const created = listItem(await loadUserRow(dashboard.id));
  const response = { ...created };
  if (body.sendInvite) {
    try {
      const { sendAppEmail } = await import('../auth_backend/services/emailService.js');
      await sendAppEmail({
        to: email,
        subject: 'Your Nexus Lexis account',
        text: `Assalam-o-Alaikum ${name},\n\nAn account was created for you.\nTemporary password: ${tempPassword}\n\nPlease sign in and change your password.`,
      });
    } catch (err) {
      console.warn('[admin-users] invite email skipped:', err.message);
    }
    return { ...response, inviteSent: true };
  }
  return { ...response, temporaryPassword: tempPassword };
}

export async function updateUser(id, body, actorAdminId) {
  await ensureAccountSchema();
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');

  if (body.email && String(body.email).toLowerCase() !== String(row.email).toLowerCase()) {
    const clash = await query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
      [body.email, id]
    );
    if (clash.rows[0]) throw httpError(409, 'Email already in use');
  }

  await query(
    `UPDATE users SET
       username = COALESCE($1, username),
       email = COALESCE($2, email),
       phone = COALESCE($3, phone)
     WHERE id = $4`,
    [body.name || null, body.email ? String(body.email).toLowerCase() : null, body.phone || null, id]
  );
  await query(
    `UPDATE auth_users SET
       full_name = COALESCE($1, full_name),
       email = COALESCE($2, email),
       phone = COALESCE($3, phone)
     WHERE LOWER(email) = LOWER($4)`,
    [body.name || null, body.email ? String(body.email).toLowerCase() : null, body.phone || null, row.email]
  );

  if (body.city || body.cnic) {
    await query(
      `UPDATE client_profiles SET city = COALESCE($1, city), cnic = COALESCE($2, cnic) WHERE user_id = $3`,
      [body.city || null, body.cnic || null, id]
    );
  }
  if (body.barRoll || body.address || body.city) {
    await query(
      `UPDATE lawyer_profiles SET bar_council_num = COALESCE($1, bar_council_num),
        office_address = COALESCE($2, office_address), city = COALESCE($3, city)
       WHERE user_id = $4`,
      [body.barRoll || null, body.address || null, body.city || null, id]
    );
  }
  if (body.icap || body.firm || body.address || body.city) {
    await query(
      `UPDATE ca_profiles SET icap_membership_no = COALESCE($1, icap_membership_no),
        firm_name = COALESCE($2, firm_name), office_address = COALESCE($3, office_address),
        city = COALESCE($4, city)
       WHERE user_id = $5`,
      [body.icap || null, body.firm || null, body.address || null, body.city || null, id]
    );
  }

  await writeAudit({ actorAdminId, accountId: id, action: 'user.updated', meta: body });
  return getUserDetail(id);
}

export async function setUserRoles(id, roles, actorAdminId) {
  if (!Array.isArray(roles) || roles.length < 1) throw httpError(400, 'Must include at least one role');
  const allowed = roles.map((r) => String(r).toLowerCase()).filter((r) => ['client', 'lawyer', 'ca'].includes(r));
  if (!allowed.length) throw httpError(400, 'Must include at least one role');
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const primary = allowed.includes('lawyer') ? 'lawyer' : allowed.includes('ca') ? 'ca' : 'client';
  await query('UPDATE users SET role = $1, active_role = $1 WHERE id = $2', [primary, id]);
  await query(
    'UPDATE auth_users SET role = $1 WHERE LOWER(email) = LOWER($2)',
    [primary, row.email]
  );
  if (allowed.includes('client') && !row.client_id) {
    await query(
      `INSERT INTO client_profiles (user_id, documents) VALUES ($1, '{}'::jsonb) ON CONFLICT (user_id) DO NOTHING`,
      [id]
    ).catch(() => {});
  }
  await writeAudit({ actorAdminId, accountId: id, action: 'roles.updated', meta: { roles: allowed } });
  return getUserDetail(id);
}

export async function approveUser(id, body, actorAdminId) {
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : ['lawyer', 'ca'];
  if (roles.includes('lawyer')) {
    await query(`UPDATE lawyer_profiles SET verification_stat = 'verified' WHERE user_id = $1`, [id]);
  }
  if (roles.includes('ca')) {
    await query(`UPDATE ca_profiles SET verification_stat = 'verified' WHERE user_id = $1`, [id]);
  }
  if (body.approveVault !== false) {
    await query(
      `UPDATE verification_uploads SET state = 'approved', reviewed_at = NOW(), reviewed_by = $2
       WHERE user_id = $1`,
      [id, actorAdminId || null]
    ).catch(() => {});
  }
  await query(`UPDATE users SET account_status = 'active', is_active = TRUE WHERE id = $1`, [id]);
  await writeAudit({ actorAdminId, accountId: id, action: 'user.approved', meta: body || {} });

  if (body.notifyEmail) {
    const row = await loadUserRow(id);
    try {
      const { sendAppEmail } = await import('../auth_backend/services/emailService.js');
      await sendAppEmail({
        to: row.email,
        subject: 'Credentials approved — Nexus Lexis',
        text: 'Your professional credentials were approved. You can now access your dashboard.',
      });
    } catch (err) {
      console.warn('[admin-users] approval email skipped:', err.message);
    }
  }
  return getUserDetail(id);
}

export async function rejectVaultDoc(id, docId, reason, actorAdminId) {
  const result = await query(
    `UPDATE verification_uploads SET state = 'rejected', reviewed_at = NOW(), reviewed_by = $3
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [docId, id, actorAdminId || null]
  );
  if (!result.rows[0]) throw httpError(404, 'Document not found');
  await writeAudit({ actorAdminId, accountId: id, action: 'vault.rejected', meta: { docId, reason } });
  return vaultItem(result.rows[0]);
}

export async function suspendUser(id, body, actorAdminId) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  if (row.role === 'admin') throw httpError(400, 'Cannot suspend an admin account from this screen');
  await query(
    `UPDATE users SET is_active = FALSE, account_status = 'suspended', suspend_reason = $2 WHERE id = $1`,
    [id, body.reason || 'Suspended by registry']
  );
  await query(`UPDATE lawyer_profiles SET is_suspended = TRUE WHERE user_id = $1`, [id]).catch(() => {});
  await query(`UPDATE ca_profiles SET is_suspended = TRUE WHERE user_id = $1`, [id]).catch(() => {});
  await query(`UPDATE auth_users SET is_active = FALSE WHERE LOWER(email) = LOWER($1)`, [row.email]);
  if (body.signOutSessions !== false) {
    const auth = await query(`SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)`, [row.email]);
    if (auth.rows[0]) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE auth_user_id = $1 AND revoked_at IS NULL`,
        [auth.rows[0].id]
      );
    }
  }
  await writeAudit({ actorAdminId, accountId: id, action: 'user.suspended', meta: body || {} });
  return getUserDetail(id);
}

export async function reinstateUser(id, body, actorAdminId) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  await query(
    `UPDATE users SET is_active = TRUE, account_status = 'active', suspend_reason = NULL WHERE id = $1`,
    [id]
  );
  await query(`UPDATE lawyer_profiles SET is_suspended = FALSE WHERE user_id = $1`, [id]).catch(() => {});
  await query(`UPDATE ca_profiles SET is_suspended = FALSE WHERE user_id = $1`, [id]).catch(() => {});
  await query(`UPDATE auth_users SET is_active = TRUE WHERE LOWER(email) = LOWER($1)`, [row.email]);
  await writeAudit({ actorAdminId, accountId: id, action: 'user.reinstated', meta: body || {} });
  return getUserDetail(id);
}

export async function resetUserPassword(id, body, actorAdminId) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const mode = body.mode === 'temporary' ? 'temporary' : 'link';
  if (mode === 'temporary') {
    const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const hash = await bcrypt.hash(tempPassword, 8);
    await query(`UPDATE auth_users SET password_hash = $1 WHERE LOWER(email) = LOWER($2)`, [hash, row.email]);
    await query(`UPDATE users SET password = $1 WHERE id = $2`, [hash, id]);
    await writeAudit({ actorAdminId, accountId: id, action: 'password.reset_temporary', meta: {} });
    return { temporaryPassword: tempPassword, forceChangeOnLogin: Boolean(body.forceChangeOnLogin) };
  }
  const { requestPasswordReset } = await import('../auth_backend/services/passwordResetService.js');
  await requestPasswordReset(row.email);
  await writeAudit({ actorAdminId, accountId: id, action: 'password.reset_link', meta: {} });
  return { ok: true };
}

export async function emailUser(id, body, actorAdminId) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const subject = body.subject || 'Message from Nexus Lexis Registry';
  const text = body.body || '';
  const { sendAppEmail } = await import('../auth_backend/services/emailService.js');
  await sendAppEmail({ to: row.email, subject, text });
  await writeAudit({ actorAdminId, accountId: id, action: 'user.emailed', meta: { subject, template: body.template || 'custom' } });
  return { ok: true };
}

export async function listUserSessions(id) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const auth = await query(`SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)`, [row.email]);
  if (!auth.rows[0]) return { items: [] };
  const result = await query(
    `SELECT id, device, ip, location, last_seen_at, created_at
     FROM refresh_tokens WHERE auth_user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY COALESCE(last_seen_at, created_at) DESC`,
    [auth.rows[0].id]
  );
  return {
    items: result.rows.map((s) => ({
      id: `sess_${s.id}`,
      device: s.device || 'Unknown device',
      location: s.location || null,
      ip: s.ip || null,
      lastActiveAt: iso(s.last_seen_at || s.created_at),
      current: false,
    })),
  };
}

export async function revokeUserSession(id, sessionId) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const sid = Number(String(sessionId).replace(/^sess_/, ''));
  const auth = await query(`SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)`, [row.email]);
  const result = await query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE id = $1 AND auth_user_id = $2 AND revoked_at IS NULL RETURNING id`,
    [sid, auth.rows[0]?.id]
  );
  if (!result.rows[0]) throw httpError(404, 'Session not found');
  return { ok: true };
}

export async function revokeAllUserSessions(id) {
  const row = await loadUserRow(id);
  if (!row) throw httpError(404, 'User not found');
  const auth = await query(`SELECT id FROM auth_users WHERE LOWER(email) = LOWER($1)`, [row.email]);
  if (auth.rows[0]) {
    await query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE auth_user_id = $1 AND revoked_at IS NULL`,
      [auth.rows[0].id]
    );
  }
  return { ok: true };
}

export async function listUserMatters(id, page = 1, pageSize = 20) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const result = await query(
    `SELECT m.id, m.title, m.status, m.created_at
     FROM vlo_matters m
     JOIN vlo_subscriptions s ON s.id = m.subscription_id
     WHERE s.client_id = $1 OR s.assigned_lawyer_id = $1
     ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,
    [id, size, offset]
  ).catch(() => ({ rows: [] }));
  const count = await query(
    `SELECT COUNT(*)::int AS c
     FROM vlo_matters m
     JOIN vlo_subscriptions s ON s.id = m.subscription_id
     WHERE s.client_id = $1 OR s.assigned_lawyer_id = $1`,
    [id]
  ).catch(() => ({ rows: [{ c: result.rows.length }] }));
  return {
    items: result.rows.map((m) => ({
      id: String(m.id),
      title: m.title,
      status: m.status,
      party: null,
    })),
    total: count.rows[0]?.c || result.rows.length,
  };
}

export async function listUserDocuments(id, page = 1, pageSize = 20) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const result = await query(
    `SELECT so.id, so.order_number, so.status, so.created_at, s.name AS service_name
     FROM service_orders so
     LEFT JOIN services s ON s.id = so.service_id
     WHERE so.client_id = $1
     ORDER BY so.created_at DESC LIMIT $2 OFFSET $3`,
    [id, size, offset]
  ).catch(() => ({ rows: [] }));
  return {
    items: result.rows.map((d) => ({
      id: String(d.id),
      name: d.service_name || d.order_number,
      type: 'Order / filing',
      date: iso(d.created_at),
    })),
  };
}

export async function listUserPayments(id, page = 1, pageSize = 20) {
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const result = await query(
    `SELECT id, amount, category, invoice_number, invoice_date, created_at
     FROM invoices
     WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [id, size, offset]
  ).catch(() => ({ rows: [] }));
  return {
    items: result.rows.map((p) => ({
      id: p.invoice_number || `PAY-${p.id}`,
      description: p.category || 'Invoice',
      amount: Number(p.amount) || 0,
      currency: 'PKR',
      direction: 'debit',
      status: 'Recorded',
      date: iso(p.invoice_date || p.created_at),
    })),
  };
}

export async function listUserAudit(id, page = 1, pageSize = 20) {
  await ensureAccountSchema();
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const result = await query(
    `SELECT a.id, a.action, a.meta, a.created_at, u.username AS actor_name
     FROM admin_audit_logs a
     LEFT JOIN users u ON u.id = a.actor_admin_id
     WHERE a.account_id = $1
     ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`,
    [id, size, offset]
  );
  return {
    items: result.rows.map((a) => ({
      id: String(a.id),
      action: a.action,
      actorName: a.actor_name || 'Registry Admin',
      meta: a.meta || {},
      createdAt: iso(a.created_at),
    })),
  };
}

export async function bulkUsers({ action, userIds = [], payload = {} }, actorAdminId) {
  if (!Array.isArray(userIds) || !userIds.length) throw httpError(400, 'userIds required');
  if (userIds.length > 50) throw httpError(400, 'Max batch size is 50');
  const failed = [];
  let processed = 0;
  for (const rawId of userIds) {
    try {
      if (action === 'approve') await approveUser(rawId, payload, actorAdminId);
      else if (action === 'suspend') await suspendUser(rawId, payload, actorAdminId);
      else if (action === 'email') await emailUser(rawId, payload, actorAdminId);
      else throw httpError(400, 'action must be approve, suspend, or email');
      processed += 1;
    } catch (err) {
      failed.push({ id: String(rawId), error: err.message });
    }
  }
  return { ok: failed.length === 0, processed, failed };
}
