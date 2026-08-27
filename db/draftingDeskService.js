/**
 * Admin Drafting Desk (The Registry) — NL-BE-ADMIN-DRAFT-001
 * Queue of bespoke drafting work: custom_docs appointments + service orders.
 */
import { query } from './index.js';
import { ensureAdminPortalSchema } from './ensureAdminPortalSchema.js';
import { buildPaginationMeta } from '../shared/lib/pagination.js';
import { ACCEPTANCE_WINDOW_HOURS } from './adminAppointmentOversight.js';

const DESK_LIMITS = [10, 20, 50];

function parseDeskPagination(q = {}) {
  let page = Number.parseInt(q.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(q.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  else if (!DESK_LIMITS.includes(limit)) {
    limit = DESK_LIMITS.reduce((best, a) => (Math.abs(a - limit) < Math.abs(best - limit) ? a : best), 20);
  }
  return { page, limit };
}

function mapCustomRow(row) {
  const assignedAt = row.assigned_at || row.created_at;
  const deadline = row.acceptance_deadline
    || (assignedAt ? new Date(new Date(assignedAt).getTime() + ACCEPTANCE_WINDOW_HOURS * 3600000) : null);
  const expired = row.status === 'pending' && deadline && new Date(deadline).getTime() < Date.now();
  return {
    id: `appt_${row.id}`,
    kind: 'custom_docs',
    appointmentId: String(row.id),
    orderNumber: null,
    client: {
      id: String(row.client_id),
      name: row.client_name,
      email: row.client_email,
    },
    subject: row.subject || row.category_label || 'Custom draft',
    description: row.matter_note || row.client_notes || '',
    status: row.status,
    statusKey: row.status,
    paymentConfirmed: String(row.payment_status || '').toLowerCase() === 'paid',
    paymentStatus: row.payment_status || 'pending',
    assignedProfessional: row.lawyer_prof_id
      ? {
        id: String(row.lawyer_prof_id),
        userId: row.lawyer_user_id ? String(row.lawyer_user_id) : null,
        name: row.lawyer_name,
        type: 'lawyer',
      }
      : null,
    assignedAt,
    acceptanceDeadline: deadline,
    acceptanceExpired: Boolean(expired),
    slaHours: ACCEPTANCE_WINDOW_HOURS,
    createdAt: row.created_at,
    date: row.appointment_date,
    source: 'custom_docs',
  };
}

function mapOrderRow(row) {
  const form = row.intake_form_data || {};
  const assignedAt = row.assigned_at || row.created_at;
  const deadline = row.acceptance_deadline
    || (assignedAt ? new Date(new Date(assignedAt).getTime() + ACCEPTANCE_WINDOW_HOURS * 3600000) : null);
  return {
    id: `order_${row.id}`,
    kind: 'service_order',
    appointmentId: null,
    orderNumber: row.order_number,
    orderId: String(row.id),
    client: {
      id: String(row.client_id),
      name: row.client_name,
      email: row.client_email,
    },
    subject: row.service_name || form.title || 'Drafting order',
    description: form.summary || form.brief || form.matterNote || '',
    status: row.status,
    statusKey: row.status,
    paymentConfirmed: ['completed', 'processing', 'in_progress'].includes(row.status),
    paymentStatus: row.status === 'pending_payment' ? 'pending' : 'paid',
    assignedProfessional: row.assigned_prof_id
      ? {
        id: row.assigned_profile_id ? String(row.assigned_profile_id) : null,
        userId: String(row.assigned_prof_id),
        name: row.assigned_name || null,
        type: row.assigned_role === 'ca' ? 'ca' : 'lawyer',
      }
      : null,
    assignedAt,
    acceptanceDeadline: deadline,
    acceptanceExpired: false,
    slaHours: ACCEPTANCE_WINDOW_HOURS,
    createdAt: row.created_at || row.expected_delivery,
    intakeSchema: row.intake_schema || {},
    intakeForm: form,
    source: form.source || 'service_order',
  };
}

export async function listDraftingDeskOrders(filters = {}) {
  await ensureAdminPortalSchema();
  const { page, limit } = parseDeskPagination(filters);
  const status = filters.status ? String(filters.status).toLowerCase() : null;
  const dateFrom = filters.dateFrom || null;
  const dateTo = filters.dateTo || null;
  const search = filters.search ? `%${String(filters.search).trim()}%` : null;
  const paymentConfirmed = filters.paymentConfirmed;
  const unassignedOnly = filters.unassignedOnly === true
    || filters.unassignedOnly === 'true'
    || filters.unassignedOnly === '1';

  const customParams = [];
  const customWhere = [`a.source = 'custom_docs'`];
  if (status) {
    customParams.push(status);
    customWhere.push(`a.status = $${customParams.length}`);
  }
  if (dateFrom) {
    customParams.push(dateFrom);
    customWhere.push(`a.appointment_date >= $${customParams.length}::date`);
  }
  if (dateTo) {
    customParams.push(dateTo);
    customWhere.push(`a.appointment_date <= $${customParams.length}::date`);
  }
  if (search) {
    customParams.push(search);
    const i = customParams.length;
    customWhere.push(`(
      u.username ILIKE $${i} OR u.email ILIKE $${i}
      OR COALESCE(a.subject,'') ILIKE $${i} OR COALESCE(lp.full_name,'') ILIKE $${i}
    )`);
  }
  if (paymentConfirmed === true || paymentConfirmed === 'true') {
    customWhere.push(`LOWER(COALESCE(a.payment_status,'')) = 'paid'`);
  }
  if (paymentConfirmed === false || paymentConfirmed === 'false') {
    customWhere.push(`LOWER(COALESCE(a.payment_status,'pending')) <> 'paid'`);
  }
  if (unassignedOnly) {
    customWhere.push(`(a.lawyer_prof_id IS NULL OR a.assignment_status = 'pending_assignment')`);
  }

  const custom = await query(
    `SELECT a.*, lp.full_name AS lawyer_name, lp.user_id AS lawyer_user_id,
            u.username AS client_name, u.email AS client_email, a.client_id
     FROM appointments a
     JOIN users u ON u.id = a.client_id
     LEFT JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     WHERE ${customWhere.join(' AND ')}
     ORDER BY a.created_at DESC NULLS LAST, a.id DESC
     LIMIT 500`,
    customParams
  );

  const orderParams = [];
  const orderWhere = [
    `(so.intake_form_data->>'source' IS DISTINCT FROM 'library_purchase')`,
    `(so.completed_file IS NULL OR so.completed_file NOT LIKE 'library:%')`,
  ];
  if (status) {
    orderParams.push(status);
    orderWhere.push(`so.status = $${orderParams.length}`);
  }
  if (search) {
    orderParams.push(search);
    const i = orderParams.length;
    orderWhere.push(`(
      u.username ILIKE $${i} OR u.email ILIKE $${i}
      OR s.name ILIKE $${i} OR so.order_number ILIKE $${i}
    )`);
  }
  if (unassignedOnly) {
    orderWhere.push(`so.assigned_prof_id IS NULL`);
  }

  const orders = await query(
    `SELECT so.*, s.name AS service_name, s.intake_schema,
            u.username AS client_name, u.email AS client_email,
            COALESCE(lp.full_name, cp.full_name) AS assigned_name,
            COALESCE(lp.id, cp.id) AS assigned_profile_id,
            CASE WHEN cp.id IS NOT NULL THEN 'ca' ELSE 'lawyer' END AS assigned_role
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     JOIN users u ON u.id = so.client_id
     LEFT JOIN lawyer_profiles lp ON lp.user_id = so.assigned_prof_id
     LEFT JOIN ca_profiles cp ON cp.user_id = so.assigned_prof_id
     WHERE ${orderWhere.join(' AND ')}
     ORDER BY so.id DESC
     LIMIT 500`,
    orderParams
  );

  let items = [
    ...custom.rows.map(mapCustomRow),
    ...orders.rows.map(mapOrderRow),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (filters.clientProfileId) {
    items = items.filter((i) => i.client?.id === String(filters.clientProfileId));
  }

  const totalItems = items.length;
  const pagination = buildPaginationMeta({ page, limit, totalItems });
  const slice = items.slice(pagination.offset, pagination.offset + pagination.limit);

  return {
    success: true,
    room: 'drafting_desk',
    orders: slice,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      totalItems: pagination.totalItems,
      totalPages: pagination.totalPages,
      hasNext: pagination.hasNext,
      hasPrev: pagination.hasPrev,
    },
  };
}

export async function getDraftingDeskStats() {
  await ensureAdminPortalSchema();
  const [custom, orders] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'in_progress'))::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (
          WHERE status = 'pending'
            AND acceptance_deadline IS NOT NULL
            AND acceptance_deadline < CURRENT_TIMESTAMP
        )::int AS sla_breached
      FROM appointments WHERE source = 'custom_docs'
    `),
    query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('pending', 'pending_payment'))::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('processing', 'in_progress'))::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE assigned_prof_id IS NULL)::int AS unassigned
      FROM service_orders
      WHERE (intake_form_data->>'source' IS DISTINCT FROM 'library_purchase')
        AND (completed_file IS NULL OR completed_file NOT LIKE 'library:%')
    `),
  ]);
  const c = custom.rows[0] || {};
  const o = orders.rows[0] || {};
  return {
    success: true,
    stats: {
      total: (c.total || 0) + (o.total || 0),
      pending: (c.pending || 0) + (o.pending || 0),
      inProgress: (c.in_progress || 0) + (o.in_progress || 0),
      completed: (c.completed || 0) + (o.completed || 0),
      slaBreached: c.sla_breached || 0,
      unassigned: o.unassigned || 0,
      customDocs: c.total || 0,
      serviceOrders: o.total || 0,
    },
  };
}

export async function assignDraftingDeskOrder(body = {}, adminActor = {}) {
  await ensureAdminPortalSchema();
  const kind = String(body.kind || '').toLowerCase();
  const lawyerProfileId = body.lawyerProfileId || body.assigned_to_lawyer_id;
  const caProfileId = body.caProfileId || body.assigned_to_ca_id;
  const note = body.note || null;

  if (!lawyerProfileId && !caProfileId) {
    const err = new Error('lawyerProfileId or caProfileId is required');
    err.status = 400;
    throw err;
  }

  const assignedAt = new Date();
  const deadline = new Date(assignedAt.getTime() + ACCEPTANCE_WINDOW_HOURS * 3600000);

  if (kind === 'custom_docs' || body.appointmentId) {
    const appointmentId = body.appointmentId || String(body.id || '').replace(/^appt_/, '');
    if (!lawyerProfileId) {
      const err = new Error('custom_docs assignments require lawyerProfileId');
      err.status = 400;
      throw err;
    }
    const { reassignAdminAppointment } = await import('./adminAppointmentOversight.js');
    return reassignAdminAppointment(appointmentId, {
      professionalProfileId: lawyerProfileId,
      professionalType: 'lawyer',
      note: note || 'Assigned from Drafting Desk',
    }, adminActor);
  }

  const orderNumber = body.orderNumber || body.orderId;
  if (!orderNumber) {
    const err = new Error('appointmentId or orderNumber is required');
    err.status = 400;
    throw err;
  }

  let userId = null;
  let professional = null;
  if (lawyerProfileId) {
    const lp = await query(
      `SELECT lp.id, lp.user_id, lp.full_name FROM lawyer_profiles lp
       JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
       WHERE lp.id = $1 AND lp.verification_stat = 'verified'`,
      [Number(lawyerProfileId)]
    );
    if (!lp.rows[0]) {
      const err = new Error('Verified lawyer not found');
      err.status = 400;
      throw err;
    }
    userId = lp.rows[0].user_id;
    professional = { id: String(lp.rows[0].id), userId: String(userId), name: lp.rows[0].full_name, type: 'lawyer' };
  } else {
    const cp = await query(
      `SELECT cp.id, cp.user_id, cp.full_name FROM ca_profiles cp
       JOIN users u ON u.id = cp.user_id AND u.is_active = TRUE
       WHERE cp.id = $1 AND cp.verification_stat = 'verified'`,
      [Number(caProfileId)]
    );
    if (!cp.rows[0]) {
      const err = new Error('Verified CA not found');
      err.status = 400;
      throw err;
    }
    userId = cp.rows[0].user_id;
    professional = { id: String(cp.rows[0].id), userId: String(userId), name: cp.rows[0].full_name, type: 'ca' };
  }

  const updated = await query(
    `UPDATE service_orders SET
       assigned_prof_id = $1,
       assigned_at = $2,
       acceptance_deadline = $3,
       status = CASE WHEN status IN ('pending', 'pending_payment') THEN 'processing' ELSE status END,
       milestone = COALESCE($4, milestone)
     WHERE order_number = $5 OR id::text = $5
     RETURNING id, order_number, status, assigned_prof_id, assigned_at, acceptance_deadline, client_id`,
    [userId, assignedAt, deadline, note || 'Assigned from Drafting Desk', String(orderNumber)]
  );
  if (!updated.rows[0]) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  const row = updated.rows[0];
  await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, 'New drafting assignment', $2, 'order', '/account/orders', $3)`,
    [userId, `You were assigned order ${row.order_number}. 24-hour SLA started.`, professional.type === 'ca' ? 'ca' : 'lawyer']
  );

  return {
    success: true,
    order: {
      id: `order_${row.id}`,
      orderNumber: row.order_number,
      status: row.status,
      assignedProfessional: professional,
      assignedAt: row.assigned_at,
      acceptanceDeadline: row.acceptance_deadline,
      slaHours: ACCEPTANCE_WINDOW_HOURS,
    },
  };
}
