/**
 * NL-BE-ADMIN-OVERSIGHT-001 — Admin Appointment Oversight
 * Same appointments rows as Client/Lawyer; richer admin list/detail/stats/reassign.
 */
import { query } from './index.js';
import {
  AppointmentError,
  normalizeAppointmentStatus,
  appointmentStatusLabel,
  mapLawyerAppointmentRow,
  isSlotTaken,
} from './appointmentService.js';
import { buildPaginationMeta } from '../shared/lib/pagination.js';

export const ACCEPTANCE_WINDOW_HOURS = 24;
const OVERSIGHT_LIMITS = [10, 20, 50];
const DEFAULT_LIMIT = 20;

function nowIso() {
  return new Date().toISOString();
}

function pkToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function parseOversightPagination(queryParams = {}) {
  let page = Number.parseInt(queryParams.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = Number.parseInt(queryParams.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  } else if (!OVERSIGHT_LIMITS.includes(limit)) {
    limit = OVERSIGHT_LIMITS.reduce((best, allowed) => (
      Math.abs(allowed - limit) < Math.abs(best - limit) ? allowed : best
    ), DEFAULT_LIMIT);
  }

  return { page, limit };
}

/** FE mode filter ↔ DB mode */
export function oversightModeToDb(mode) {
  const raw = String(mode || '').toLowerCase().trim();
  if (['video', 'online', 'videocall'].includes(raw)) return ['video', 'online'];
  if (['in_person', 'in-person', 'inperson', 'office', 'physical'].includes(raw)) return ['inperson'];
  if (['phone', 'audio', 'call'].includes(raw)) return ['audio'];
  if (['document', 'docs', 'drafting'].includes(raw)) return ['document'];
  if (['chat', 'message'].includes(raw)) return ['chat'];
  return raw ? [raw] : [];
}

export function dbModeToOversight(mode) {
  const raw = String(mode || '').toLowerCase();
  if (raw === 'online' || raw === 'video') return 'video';
  if (raw === 'inperson') return 'in_person';
  if (raw === 'audio') return 'phone';
  if (raw === 'document') return 'document';
  if (raw === 'chat') return 'phone';
  return raw || 'video';
}

export function statusDisplay(statusKey) {
  const map = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rescheduled: 'Rescheduled',
    no_show: 'No Show',
  };
  return map[statusKey] || appointmentStatusLabel(statusKey);
}

function professionalTypeFromRole(role) {
  const r = String(role || 'lawyer').toLowerCase();
  if (r === 'ca' || r === 'charteredaccountant') return 'ca';
  if (r === 'consultant') return 'consultant';
  return 'lawyer';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function buildAttentionFlags(row, { acceptanceExpired } = {}) {
  const flags = [];
  const payment = String(row.payment_status || 'pending').toLowerCase();
  const assignment = String(row.assignment_status || 'assigned').toLowerCase();
  const status = String(row.status || 'pending').toLowerCase();

  if (payment === 'failed') flags.push('payment_issue');
  if (assignment === 'reassignment_required' || row.reassignment_required) flags.push('reassignment_required');
  if (acceptanceExpired) flags.push('acceptance_expired');
  if (status === 'pending' && !acceptanceExpired) flags.push('pending_confirmation');
  if (status === 'cancelled') flags.push('cancelled');
  if (status === 'no_show') flags.push('no_show');
  return [...new Set(flags)];
}

export function computeAcceptanceExpired(row) {
  if (String(row.status) !== 'pending') return false;
  if (!row.acceptance_deadline) return false;
  return new Date(row.acceptance_deadline).getTime() < Date.now();
}

/** Persist expiry flags when deadline passed and still pending (on-read). */
export async function evaluateAcceptanceWindow(row) {
  if (!row?.id) return row;
  const expired = computeAcceptanceExpired(row);
  if (!expired) return row;
  if (row.assignment_status === 'reassignment_required' && row.reassignment_required) return row;

  await query(
    `UPDATE appointments SET
       assignment_status = 'reassignment_required',
       reassignment_required = TRUE,
       reassignment_reason = COALESCE(reassignment_reason, 'acceptance_window_expired'),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending'`,
    [row.id]
  );
  return {
    ...row,
    assignment_status: 'reassignment_required',
    reassignment_required: true,
    reassignment_reason: row.reassignment_reason || 'acceptance_window_expired',
  };
}

export function initialOversightFields({
  lawyerRow,
  mode,
  source,
  fee,
  assignedAt = new Date(),
  clientName = 'Client',
  professionalName,
} = {}) {
  const windowHours = ACCEPTANCE_WINDOW_HOURS;
  const assigned = assignedAt instanceof Date ? assignedAt : new Date(assignedAt);
  const deadline = new Date(assigned.getTime() + windowHours * 60 * 60 * 1000);
  const isCustom = source === 'custom_docs';
  const at = assigned.toISOString();

  return {
    fee: fee != null ? Number(fee) : null,
    currency: 'PKR',
    duration_minutes: isCustom ? 45 : 30,
    payment_status: 'pending',
    refund_status: 'none',
    remittance_status: 'not_applicable',
    assignment_status: 'assigned',
    assigned_at: assigned,
    reassignment_required: false,
    reassignment_reason: null,
    original_professional: null,
    meeting_status: isCustom ? 'scheduled' : 'scheduled',
    join_status: 'not_started',
    acceptance_window_hours: windowHours,
    acceptance_deadline: deadline,
    timeline: [
      { id: 't1', label: 'Booking Created', at, state: 'done' },
      { id: 't2', label: 'Professional Assigned', at, state: 'done' },
      { id: 't3', label: 'Acceptance Pending', at, state: 'current' },
    ],
    audit: [
      {
        id: 'a1',
        action: 'Appointment Created',
        performedBy: clientName,
        actorType: 'client',
        at,
      },
      {
        id: 'a2',
        action: 'Professional Assigned',
        performedBy: 'System',
        actorType: 'system',
        at,
        meta: { professionalName: professionalName || lawyerRow?.full_name },
      },
    ],
  };
}

export async function appendAppointmentAudit(appointmentId, entry) {
  const id = entry.id || `a_${Date.now()}`;
  const payload = { ...entry, id, at: entry.at || nowIso() };
  await query(
    `UPDATE appointments
     SET audit = COALESCE(audit, '[]'::jsonb) || $1::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [JSON.stringify([payload]), appointmentId]
  );
}

export async function appendAppointmentTimeline(appointmentId, entries = []) {
  if (!entries.length) return;
  const stamped = entries.map((e, i) => ({
    ...e,
    id: e.id || `t_${Date.now()}_${i}`,
    at: e.at || nowIso(),
  }));
  await query(
    `UPDATE appointments
     SET timeline = COALESCE(timeline, '[]'::jsonb) || $1::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [JSON.stringify(stamped), appointmentId]
  );
}

const ADMIN_SELECT = `
  SELECT a.*,
         lp.full_name AS lawyer_name,
         lp.id AS lawyer_prof_id,
         lp.practice_area AS lawyer_practice_area,
         lp.online_fee AS lawyer_online_fee,
         lp.inperson_fee AS lawyer_inperson_fee,
         u.id AS client_user_id,
         u.username AS client_name,
         u.email AS client_email,
         u.phone AS client_phone
  FROM appointments a
  JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
  JOIN users u ON u.id = a.client_id
`;

export function mapOversightAppointment(row, { includeHeavy = true } = {}) {
  const source = row.source || 'consultation';
  const isCustomRequest = source === 'custom_docs';
  const statusKey = String(row.status || 'pending').toLowerCase();
  const acceptanceExpired = computeAcceptanceExpired(row)
    || (row.assignment_status === 'reassignment_required' && statusKey === 'pending');
  const mode = dbModeToOversight(row.mode);
  const isoDate = row.appointment_date instanceof Date
    ? row.appointment_date.toISOString().slice(0, 10)
    : String(row.appointment_date).slice(0, 10);
  const time = String(row.appointment_time || '').slice(0, 5);
  const fee = row.fee != null
    ? Number(row.fee)
    : Number(mode === 'in_person' ? row.lawyer_inperson_fee : row.lawyer_online_fee) || null;
  const durationMinutes = row.duration_minutes
    || (isCustomRequest ? 45 : 30);
  const assignedAt = row.assigned_at || row.created_at || null;
  const acceptanceDeadline = row.acceptance_deadline || null;
  const windowHours = row.acceptance_window_hours ?? ACCEPTANCE_WINDOW_HOURS;

  const paymentStatus = String(row.payment_status || 'pending').toLowerCase();
  const assignmentStatus = String(
    row.reassignment_required || row.assignment_status === 'reassignment_required'
      ? 'reassignment_required'
      : (row.assignment_status || 'assigned')
  ).toLowerCase();

  const attentionFlags = buildAttentionFlags(
    { ...row, payment_status: paymentStatus, assignment_status: assignmentStatus, status: statusKey },
    { acceptanceExpired }
  );

  const scheduledAt = `${isoDate}T${time}:00+05:00`;
  const flat = mapLawyerAppointmentRow({
    ...row,
    lawyer_name: row.lawyer_name,
    lawyer_prof_id: row.lawyer_prof_id,
  });

  const oversight = {
    id: String(row.id),
    isCustomRequest,
    source,
    client: {
      id: String(row.client_user_id || row.client_id),
      name: row.client_name || null,
      email: row.client_email || null,
      phone: row.client_phone || null,
    },
    professional: {
      id: String(row.lawyer_prof_id),
      name: row.lawyer_name || null,
      type: 'lawyer',
      practiceArea: row.lawyer_practice_area || null,
    },
    service: isCustomRequest
      ? (row.subject ? `Custom draft: ${row.subject}` : (row.category_label || 'Custom draft'))
      : (row.subject || row.category_label || 'Consultation'),
    serviceArea: row.service_area || null,
    requestDescription: row.matter_note || row.client_notes || '',
    requestDate: row.created_at || assignedAt,
    date: isoDate,
    time,
    durationMinutes,
    mode,
    fee,
    currency: row.currency || 'PKR',
    status: statusKey,
    statusKey,
    statusDisplay: statusDisplay(statusKey),
    responseNote: row.response_note || null,
    payment: {
      status: paymentStatus,
      transactionId: row.payment_transaction_id || null,
      paymentDate: row.payment_date || null,
      refundStatus: row.refund_status || 'none',
      remittanceStatus: row.remittance_status
        || (paymentStatus === 'paid' ? 'pending_payout' : 'not_applicable'),
    },
    assignment: {
      status: assignmentStatus,
      assignedAt,
      reassignmentRequired: assignmentStatus === 'reassignment_required' || Boolean(row.reassignment_required),
      reassignmentReason: row.reassignment_reason || null,
      originalProfessional: row.original_professional || null,
    },
    meeting: {
      mode,
      status: row.meeting_status || (statusKey === 'completed' ? 'completed' : statusKey === 'cancelled' ? 'cancelled' : statusKey === 'no_show' ? 'missed' : 'scheduled'),
      link: row.meeting_link || null,
      scheduledAt,
      joinStatus: row.join_status || 'not_started',
    },
    acceptanceWindowHours: windowHours,
    acceptanceDeadline,
    acceptanceExpired,
    attentionFlags,
    deliveredDocument: row.delivered_order_number
      ? { orderNumber: row.delivered_order_number, title: row.subject || 'Custom draft' }
      : null,
    // Flat aliases (NL-FE-ADMIN-APPT-001 / Client/Lawyer normalizer)
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    professionalName: row.lawyer_name,
    lawyerName: row.lawyer_name,
    professionalProfileId: row.lawyer_prof_id,
    professionalRole: 'Lawyer',
    timeSlot: time,
    modeLabel: flat.modeLabel,
    slot: scheduledAt,
    subject: row.subject || null,
    brief: flat.brief,
    categoryLabel: row.category_label || null,
    description: row.matter_note || row.client_notes || '',
    notes: row.matter_note || row.client_notes || '',
    matterNote: row.matter_note || null,
    meetingLink: row.meeting_link || null,
    createdAt: row.created_at || null,
  };

  if (includeHeavy) {
    oversight.timeline = asArray(row.timeline);
    oversight.audit = asArray(row.audit);
  }

  return oversight;
}

function buildListFilters(filters = {}) {
  const params = [];
  const where = [];

  const push = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.status) {
    try {
      push('a.status = ?', normalizeAppointmentStatus(filters.status));
    } catch {
      push('a.status = ?', String(filters.status).toLowerCase());
    }
  }
  if (filters.source) push('a.source = ?', String(filters.source));
  if (filters.lawyerProfileId) push('a.lawyer_prof_id = ?', Number(filters.lawyerProfileId));
  if (filters.paymentStatus) push('LOWER(COALESCE(a.payment_status, \'pending\')) = ?', String(filters.paymentStatus).toLowerCase());
  if (filters.assignmentStatus) {
    const as = String(filters.assignmentStatus).toLowerCase();
    if (as === 'reassignment_required') {
      where.push(`(a.assignment_status = 'reassignment_required' OR a.reassignment_required = TRUE)`);
    } else {
      push('LOWER(COALESCE(a.assignment_status, \'assigned\')) = ?', as);
    }
  }
  if (filters.serviceArea) {
    push('LOWER(COALESCE(a.service_area, \'\')) LIKE ?', `%${String(filters.serviceArea).toLowerCase()}%`);
  }
  if (filters.professionalType) {
    const t = String(filters.professionalType).toLowerCase();
    if (t === 'ca') {
      where.push('FALSE'); // lawyer appointments table only for now
    } else if (t !== 'lawyer' && t !== 'consultant') {
      // unknown type → empty
      where.push('FALSE');
    }
  }
  if (filters.mode) {
    const modes = oversightModeToDb(filters.mode);
    if (modes.length) {
      params.push(modes);
      where.push(`a.mode = ANY($${params.length}::text[])`);
    }
  }
  if (filters.dateFrom) push('a.appointment_date >= ?::date', filters.dateFrom);
  if (filters.dateTo) push('a.appointment_date <= ?::date', filters.dateTo);
  if (filters.search) {
    const q = `%${String(filters.search).trim()}%`;
    params.push(q);
    const i = params.length;
    where.push(`(
      CAST(a.id AS TEXT) ILIKE $${i}
      OR u.username ILIKE $${i}
      OR u.email ILIKE $${i}
      OR lp.full_name ILIKE $${i}
      OR COALESCE(a.subject, '') ILIKE $${i}
    )`);
  }
  if (filters.attentionOnly === true || filters.attentionOnly === 'true' || filters.attentionOnly === '1') {
    where.push(`(
      LOWER(COALESCE(a.payment_status, '')) = 'failed'
      OR a.assignment_status = 'reassignment_required'
      OR a.reassignment_required = TRUE
      OR a.status IN ('cancelled', 'no_show')
      OR (
        a.status = 'pending'
        AND a.acceptance_deadline IS NOT NULL
        AND a.acceptance_deadline < CURRENT_TIMESTAMP
      )
      OR a.status = 'pending'
    )`);
  }

  return { params, where };
}

const SORT_SQL = `
  CASE
    WHEN a.assignment_status = 'reassignment_required' OR a.reassignment_required = TRUE THEN 1
    WHEN LOWER(COALESCE(a.payment_status, '')) = 'failed' THEN 2
    WHEN a.status = 'no_show' THEN 4
    WHEN a.status = 'cancelled' THEN 5
    WHEN a.status = 'pending' THEN 6
    ELSE 7
  END ASC,
  a.appointment_date DESC,
  a.appointment_time DESC
`;

export async function listAdminAppointmentsOversight(filters = {}) {
  const { params, where } = buildListFilters(filters);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { page, limit } = parseOversightPagination(filters);

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     JOIN users u ON u.id = a.client_id
     ${whereSql}`,
    params
  );
  const totalItems = countResult.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ page, limit, totalItems });

  const pageParams = [...params, pagination.limit, pagination.offset];
  const result = await query(
    `${ADMIN_SELECT}
     ${whereSql}
     ORDER BY ${SORT_SQL}
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );

  const appointments = [];
  for (const row of result.rows) {
    const evaluated = await evaluateAcceptanceWindow(row);
    appointments.push(mapOversightAppointment(evaluated, { includeHeavy: false }));
  }

  return {
    success: true,
    appointments,
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

export async function getAdminAppointmentStats() {
  const today = pkToday();
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
       COUNT(*) FILTER (WHERE appointment_date = $1::date)::int AS today,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
       COUNT(*) FILTER (
         WHERE assignment_status = 'reassignment_required' OR reassignment_required = TRUE
       )::int AS needs_reassignment,
       COALESCE(SUM(fee) FILTER (WHERE LOWER(COALESCE(payment_status, '')) = 'paid'), 0)::float AS revenue
     FROM appointments`,
    [today]
  );
  const row = result.rows[0] || {};
  return {
    success: true,
    stats: {
      total: row.total || 0,
      pending: row.pending || 0,
      confirmed: row.confirmed || 0,
      today: row.today || 0,
      completed: row.completed || 0,
      cancelled: row.cancelled || 0,
      needsReassignment: row.needs_reassignment || 0,
      revenue: Math.round(Number(row.revenue) || 0),
    },
  };
}

export async function getAdminAppointmentById(appointmentId) {
  const result = await query(`${ADMIN_SELECT} WHERE a.id = $1`, [appointmentId]);
  const row = result.rows[0];
  if (!row) throw new AppointmentError('Appointment not found', 404);
  const evaluated = await evaluateAcceptanceWindow(row);
  return {
    success: true,
    appointment: mapOversightAppointment(evaluated, { includeHeavy: true }),
  };
}

export async function reassignAdminAppointment(appointmentId, body = {}, adminActor = {}) {
  const professionalProfileId = body.professionalProfileId || body.lawyerProfileId;
  if (!professionalProfileId) {
    throw new AppointmentError('professionalProfileId is required');
  }

  const existing = await query(`${ADMIN_SELECT} WHERE a.id = $1`, [appointmentId]);
  const row = existing.rows[0];
  if (!row) throw new AppointmentError('Appointment not found', 404);

  if (Number(professionalProfileId) === Number(row.lawyer_prof_id)) {
    throw new AppointmentError('professionalProfileId is the same as the current professional');
  }

  const target = await query(
    `SELECT lp.id, lp.user_id, lp.full_name, lp.practice_area, lp.online_fee, lp.inperson_fee
     FROM lawyer_profiles lp
     INNER JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
     WHERE lp.id = $1 AND COALESCE(lp.is_suspended, FALSE) = FALSE`,
    [Number(professionalProfileId)]
  );
  if (!target.rows[0]) throw new AppointmentError('Professional not found or inactive', 400);
  const next = target.rows[0];

  const isoDate = row.appointment_date instanceof Date
    ? row.appointment_date.toISOString().slice(0, 10)
    : String(row.appointment_date).slice(0, 10);
  const time = String(row.appointment_time || '10:00:00');
  if (await isSlotTaken(next.id, isoDate, time, row.id)) {
    throw new AppointmentError('Target professional cannot take this slot', 409);
  }

  const original = row.original_professional || {
    id: String(row.lawyer_prof_id),
    name: row.lawyer_name,
    type: 'lawyer',
    practiceArea: row.lawyer_practice_area || null,
  };

  const windowHours = row.acceptance_window_hours || ACCEPTANCE_WINDOW_HOURS;
  const assignedAt = new Date();
  const deadline = new Date(assignedAt.getTime() + windowHours * 60 * 60 * 1000);
  const at = assignedAt.toISOString();
  const note = body.note || 'Reassigned by admin';

  const timelineExtra = [
    { id: `t_re_${Date.now()}`, label: 'New Professional Assigned', at, state: 'done' },
    { id: `t_acc_${Date.now()}`, label: 'Acceptance Pending', at, state: 'current' },
  ];
  const auditExtra = [{
    id: `a_re_${Date.now()}`,
    action: 'Lawyer Reassigned',
    performedBy: adminActor.name || adminActor.email || 'Admin',
    actorType: 'admin',
    at,
    meta: {
      from: original,
      to: { id: String(next.id), name: next.full_name, type: 'lawyer' },
      note,
    },
  }];

  await query(
    `UPDATE appointments SET
       lawyer_prof_id = $1,
       status = 'pending',
       assignment_status = 'assigned',
       assigned_at = $2,
       reassignment_required = FALSE,
       reassignment_reason = NULL,
       original_professional = $3::jsonb,
       acceptance_deadline = $4,
       acceptance_window_hours = $5,
       response_note = COALESCE($6, response_note),
       timeline = COALESCE(timeline, '[]'::jsonb) || $7::jsonb,
       audit = COALESCE(audit, '[]'::jsonb) || $8::jsonb,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $9`,
    [
      next.id,
      assignedAt,
      JSON.stringify(original),
      deadline,
      windowHours,
      body.note || null,
      JSON.stringify(timelineExtra),
      JSON.stringify(auditExtra),
      row.id,
    ]
  );

  await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, $2, $3, 'appointment', '/account/appointments', 'lawyer')`,
    [
      next.user_id,
      'New appointment assigned',
      `Admin assigned you a booking for ${isoDate} at ${String(time).slice(0, 5)}.`,
    ]
  );
  if (row.client_id) {
    await query(
      `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
       VALUES ($1, $2, $3, 'appointment', '/account/appointments', 'client')`,
      [
        row.client_id,
        'Professional updated',
        `Your booking was reassigned to ${next.full_name}.`,
      ]
    );
  }

  return getAdminAppointmentById(row.id);
}

export async function listAssignableProfessionals(filters = {}) {
  const params = [];
  const where = [
    'COALESCE(lp.is_suspended, FALSE) = FALSE',
    'u.is_active = TRUE',
  ];

  const type = String(filters.professionalType || 'lawyer').toLowerCase();
  if (type && type !== 'lawyer' && type !== 'consultant') {
    return { success: true, professionals: [] };
  }

  if (filters.excludeProfileId) {
    params.push(Number(filters.excludeProfileId));
    where.push(`lp.id <> $${params.length}`);
  }
  if (filters.practiceArea) {
    params.push(`%${String(filters.practiceArea)}%`);
    where.push(`(lp.practice_area ILIKE $${params.length} OR COALESCE(lp.practice_areas, '') ILIKE $${params.length})`);
  }
  if (filters.city) {
    params.push(`%${String(filters.city)}%`);
    where.push(`lp.city ILIKE $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    where.push(`(lp.full_name ILIKE $${params.length} OR COALESCE(lp.practice_area, '') ILIKE $${params.length})`);
  }

  // Prefer verified first
  const result = await query(
    `SELECT lp.id, lp.full_name, lp.practice_area, lp.city, lp.verification_stat,
            COALESCE(lp.online_fee, 0) AS online_fee,
            (
              SELECT COUNT(*)::int FROM appointments a
              WHERE a.lawyer_prof_id = lp.id
                AND a.status IN ('pending', 'confirmed', 'rescheduled', 'in_progress')
            ) AS current_load
     FROM lawyer_profiles lp
     JOIN users u ON u.id = lp.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY
       CASE WHEN lp.verification_stat = 'verified' THEN 0 ELSE 1 END,
       current_load ASC,
       lp.full_name ASC
     LIMIT 100`,
    params
  );

  return {
    success: true,
    professionals: result.rows.map((row) => {
      const load = row.current_load || 0;
      return {
        id: String(row.id),
        name: row.full_name,
        professionalType: 'lawyer',
        practiceArea: row.practice_area || null,
        experienceYears: null,
        availability: load >= 8 ? 'Busy' : 'Available today',
        currentLoad: load,
        rating: null,
        status: load >= 8 ? 'busy' : 'available',
        city: row.city || null,
        verificationStatus: row.verification_stat || null,
      };
    }),
  };
}

export { professionalTypeFromRole };
