import { query } from './index.js';

export const ALLOWED_APPT_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show', 'in_progress'];
export const ALLOWED_APPT_MODES = ['online', 'inperson', 'document', 'video', 'audio', 'chat'];
export const DEFAULT_SLOT_TIMES = ['10:00', '11:30', '14:00', '16:00'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export class AppointmentError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function normalizeAppointmentMode(mode) {
  const raw = String(mode || 'online').toLowerCase().trim();
  if (['in-person', 'in_person', 'inperson', 'office', 'physical'].includes(raw)) return 'inperson';
  if (['document', 'drafting', 'docs', 'custom_docs'].includes(raw)) return 'document';
  if (['video', 'videocall'].includes(raw)) return 'video';
  if (['audio', 'call', 'phone'].includes(raw)) return 'audio';
  if (['chat', 'message'].includes(raw)) return 'chat';
  if (raw === 'online') return 'online';
  if (ALLOWED_APPT_MODES.includes(raw)) return raw;
  return 'online';
}

export function normalizeAppointmentStatus(status) {
  const raw = String(status || '').trim();
  const map = {
    pending: 'pending',
    confirmed: 'confirmed',
    accepted: 'confirmed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    declined: 'cancelled',
    rejected: 'cancelled',
    completed: 'completed',
    rescheduled: 'rescheduled',
    no_show: 'no_show',
    noshow: 'no_show',
    'no-show': 'no_show',
    in_progress: 'in_progress',
    inprogress: 'in_progress',
    'in-progress': 'in_progress',
  };
  const dbStatus = map[raw.toLowerCase()];
  if (!dbStatus) {
    throw new AppointmentError('Invalid appointment status', 400, {
      allowed: ['pending', 'confirmed', 'Accepted', 'cancelled', 'Rejected', 'completed', 'rescheduled', 'no_show', 'in_progress'],
    });
  }
  return dbStatus;
}

export function appointmentStatusLabel(status) {
  const map = {
    pending: 'Pending',
    confirmed: 'Accepted',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rescheduled: 'Rescheduled',
    no_show: 'NoShow',
    in_progress: 'InProgress',
  };
  return map[status] || status;
}

function modeLabel(mode) {
  const map = {
    online: 'Online',
    inperson: 'In-Person',
    document: 'Document',
    video: 'Video',
    audio: 'Audio',
    chat: 'Chat',
  };
  return map[mode] || mode;
}

function formatTimeLabel(hhmm) {
  const [hStr, mStr] = String(hhmm).slice(0, 5).split(':');
  let hours = Number(hStr);
  const mins = mStr || '00';
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${meridiem}`;
}

function toPkDateParts(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return { date, time: `${time}:00` };
}

export function parseAppointmentSlot({ slot, date, timeSlot, time } = {}) {
  if (slot && /T/.test(String(slot))) {
    const parts = toPkDateParts(slot);
    if (parts) return parts;
  }

  const dateValue = date || (slot && /^\d{4}-\d{2}-\d{2}/.test(String(slot))
    ? String(slot).slice(0, 10)
    : null);
  const timeValue = timeSlot || time || slot;
  const parsedTime = parseClock(timeValue);

  if (dateValue && /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue).slice(0, 10))) {
    return { date: String(dateValue).slice(0, 10), time: parsedTime };
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return { date: today, time: parsedTime };
}

function parseClock(value) {
  if (!value) return '10:00:00';
  const iso = String(value).match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}:00`;
  const match = String(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '10:00:00';
  let hours = Number.parseInt(match[1], 10);
  const mins = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${mins}:00`;
}

async function notify(userId, { title, body, type = 'appointment', link = '/account/appointments', audience = 'client' }) {
  if (!userId || !body?.trim()) return;
  await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, title || 'NexusLexis Update', body.trim(), type, link, audience]
  );
}

export function mapAppointmentAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((item, index) => ({
    id: item.id || `att-${index + 1}`,
    fileName: item.fileName || item.name || `attachment-${index + 1}`,
    mimeType: item.mimeType || item.type || 'application/octet-stream',
    url: item.url || null,
    contentBase64: item.contentBase64 || item.content || null,
  })).map((item) => {
    const publicItem = {
      id: item.id,
      fileName: item.fileName,
      mimeType: item.mimeType,
      url: item.url,
    };
    if (item.contentBase64) publicItem.hasFile = true;
    return publicItem;
  });
}

function publicAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).map((item, index) => ({
    id: item.id || `att-${index + 1}`,
    fileName: item.fileName || item.name || `attachment-${index + 1}`,
    mimeType: item.mimeType || item.type || null,
    url: item.url || null,
  }));
}

export function mapClientAppointmentRow(row) {
  const attachments = row.attachments || [];
  const isoDate = row.appointment_date instanceof Date
    ? row.appointment_date.toISOString().slice(0, 10)
    : String(row.appointment_date).slice(0, 10);
  const time = String(row.appointment_time || '').slice(0, 8);
  const timeSlot = time.slice(0, 5);
  const source = row.source || 'consultation';

  return {
    id: String(row.id),
    professionalName: row.professional_name,
    professionalRole: row.professional_role || 'Lawyer',
    professionalProfileId: row.professional_profile_id,
    professionalId: row.professional_profile_id,
    date: isoDate,
    dateLabel: isoDate,
    time: timeSlot,
    timeSlot,
    slot: `${isoDate}T${timeSlot}:00+05:00`,
    mode: row.mode,
    modeLabel: modeLabel(row.mode),
    status: appointmentStatusLabel(row.status),
    statusKey: row.status,
    source,
    categoryId: row.category_id || null,
    categoryLabel: row.category_label || null,
    subject: row.subject || null,
    serviceArea: row.service_area || null,
    matterNote: row.matter_note || null,
    language: row.language || null,
    city: row.client_city || null,
    clientCity: row.client_city || null,
    description: row.matter_note || row.client_notes || '',
    caseDescription: row.matter_note || row.client_notes || '',
    caseCategory: row.category_label || row.service_area || null,
    duration: source === 'custom_docs' ? 45 : 30,
    fee: null,
    attachments: publicAttachments(attachments),
    responseNote: row.response_note || null,
    deliveredDocument: row.delivered_order_number
      ? { orderNumber: row.delivered_order_number, title: row.subject || 'Custom draft' }
      : null,
    createdAt: row.created_at || null,
  };
}

export function mapLawyerAppointmentRow(row) {
  const client = mapClientAppointmentRow({
    ...row,
    professional_name: row.lawyer_name || row.professional_name,
    professional_role: 'Lawyer',
    professional_profile_id: row.lawyer_prof_id,
  });
  return {
    ...client,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    consultationMode: modeLabel(row.mode),
    meetingLink: row.meeting_link || null,
    notes: row.matter_note || row.client_notes || '',
    brief: {
      source: row.source || 'consultation',
      categoryId: row.category_id,
      categoryLabel: row.category_label,
      subject: row.subject,
      serviceArea: row.service_area,
      matterNote: row.matter_note,
      language: row.language,
      city: row.client_city,
      attachments: publicAttachments(row.attachments),
    },
  };
}

export async function isSlotTaken(lawyerProfId, date, time, excludeId = null) {
  const result = await query(
    `SELECT id FROM appointments
     WHERE lawyer_prof_id = $1
       AND appointment_date = $2
       AND appointment_time = $3::time
       AND status NOT IN ('cancelled', 'no_show')
       ${excludeId ? 'AND id <> $4' : ''}
     LIMIT 1`,
    excludeId ? [lawyerProfId, date, time, excludeId] : [lawyerProfId, date, time]
  );
  return Boolean(result.rows[0]);
}

async function getTemplateSlots(lawyerProfId, weekday) {
  const result = await query(
    `SELECT slots FROM lawyer_availability
     WHERE lawyer_prof_id = $1 AND weekday = $2`,
    [lawyerProfId, weekday]
  );
  if (result.rows[0]?.slots?.length) return result.rows[0].slots.map((s) => String(s).slice(0, 5));
  return DEFAULT_SLOT_TIMES;
}

export async function getLawyerAvailability(lawyerProfileId, date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppointmentError('Query param date=YYYY-MM-DD is required');
  }

  const lawyer = await query(
    `SELECT lp.id, lp.full_name FROM lawyer_profiles lp
     INNER JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
     WHERE lp.id = $1 AND COALESCE(lp.is_suspended, FALSE) = FALSE`,
    [Number(lawyerProfileId)]
  );
  if (!lawyer.rows[0]) throw new AppointmentError('Lawyer not found', 404);

  const weekday = new Date(`${date}T12:00:00+05:00`).getDay();
  const override = await query(
    `SELECT slots FROM lawyer_availability_overrides
     WHERE lawyer_prof_id = $1 AND override_date = $2`,
    [lawyer.rows[0].id, date]
  );
  const times = override.rows[0]
    ? (override.rows[0].slots || []).map((s) => String(s).slice(0, 5))
    : await getTemplateSlots(lawyer.rows[0].id, weekday);

  const booked = await query(
    `SELECT appointment_time FROM appointments
     WHERE lawyer_prof_id = $1 AND appointment_date = $2
       AND status NOT IN ('cancelled', 'no_show')`,
    [lawyer.rows[0].id, date]
  );
  const taken = new Set(booked.rows.map((row) => String(row.appointment_time).slice(0, 5)));

  return {
    lawyerProfileId: String(lawyer.rows[0].id),
    lawyerName: lawyer.rows[0].full_name,
    date,
    slots: times.map((start) => ({
      start: `${date}T${start}:00+05:00`,
      label: formatTimeLabel(start),
      available: !taken.has(start),
    })),
  };
}

export async function getLawyerAvailabilitySettings(lawyerProfId) {
  const weeklyRows = await query(
    `SELECT weekday, slots FROM lawyer_availability WHERE lawyer_prof_id = $1 ORDER BY weekday`,
    [lawyerProfId]
  );
  const overrideRows = await query(
    `SELECT override_date, slots FROM lawyer_availability_overrides
     WHERE lawyer_prof_id = $1 ORDER BY override_date`,
    [lawyerProfId]
  );

  const weekly = {};
  for (const name of WEEKDAY_NAMES) weekly[name] = DEFAULT_SLOT_TIMES;
  for (const row of weeklyRows.rows) {
    weekly[WEEKDAY_NAMES[row.weekday]] = (row.slots || []).map((s) => String(s).slice(0, 5));
  }

  const overrides = {};
  for (const row of overrideRows.rows) {
    const key = row.override_date instanceof Date
      ? row.override_date.toISOString().slice(0, 10)
      : String(row.override_date).slice(0, 10);
    overrides[key] = (row.slots || []).map((s) => String(s).slice(0, 5));
  }

  return { timezone: 'Asia/Karachi', weekly, overrides };
}

export async function setLawyerAvailabilitySettings(lawyerProfId, payload = {}) {
  const weekly = payload.weekly || {};
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const key = WEEKDAY_NAMES[weekday];
    if (weekly[key] === undefined) continue;
    const slots = Array.isArray(weekly[key])
      ? weekly[key].map((s) => String(s).slice(0, 5))
      : DEFAULT_SLOT_TIMES;
    await query(
      `INSERT INTO lawyer_availability (lawyer_prof_id, weekday, slots)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (lawyer_prof_id, weekday) DO UPDATE SET slots = EXCLUDED.slots`,
      [lawyerProfId, weekday, JSON.stringify(slots)]
    );
  }

  const overrides = payload.overrides || {};
  for (const [date, slots] of Object.entries(overrides)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    await query(
      `INSERT INTO lawyer_availability_overrides (lawyer_prof_id, override_date, slots)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (lawyer_prof_id, override_date) DO UPDATE SET slots = EXCLUDED.slots`,
      [lawyerProfId, date, JSON.stringify(Array.isArray(slots) ? slots : [])]
    );
  }

  return getLawyerAvailabilitySettings(lawyerProfId);
}

async function ensureCustomDraftingService() {
  const existing = await query(`SELECT id FROM services WHERE slug = 'custom-document-drafting' LIMIT 1`);
  if (existing.rows[0]) return existing.rows[0].id;

  let categoryId = null;
  const cat = await query(`SELECT id FROM service_categories WHERE slug = 'document-services' LIMIT 1`);
  if (cat.rows[0]) {
    categoryId = cat.rows[0].id;
  } else {
    const created = await query(
      `INSERT INTO service_categories (name, slug, description, icon, display_order)
       VALUES ('Document Services', 'document-services', 'Custom drafting', 'file-text', 3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    categoryId = created.rows[0].id;
  }

  const service = await query(
    `INSERT INTO services (category_id, name, slug, price, delivery_days, intake_schema, access_type, description, is_active)
     VALUES ($1, 'Custom Document Drafting', 'custom-document-drafting', 0, 7, '{}'::jsonb, 'paid', 'Lawyer-delivered custom draft', TRUE)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [categoryId]
  );
  return service.rows[0].id;
}

export async function bookLawyerAppointment(clientId, body = {}, files = []) {
  const lawyerProfileId = body.lawyerProfileId || body.professionalProfileId;
  const lawyerName = body.lawyerName;

  let lawyerRow = null;
  if (lawyerProfileId) {
    const byId = await query(
      `SELECT lp.id, lp.user_id, lp.full_name
       FROM lawyer_profiles lp
       INNER JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
       WHERE lp.id = $1 AND COALESCE(lp.is_suspended, FALSE) = FALSE`,
      [Number(lawyerProfileId)]
    );
    lawyerRow = byId.rows[0] || null;
  }
  if (!lawyerRow && lawyerName) {
    const byName = await query(
      `SELECT lp.id, lp.user_id, lp.full_name
       FROM lawyer_profiles lp
       INNER JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
       WHERE lp.full_name ILIKE $1 OR lp.full_name ILIKE $2
       LIMIT 1`,
      [lawyerName, `%${String(lawyerName).replace(/^Adv\.\s*/i, '')}%`]
    );
    lawyerRow = byName.rows[0] || null;
  }
  if (!lawyerRow) throw new AppointmentError('Lawyer not found', 404);
  if (Number(clientId) === Number(lawyerRow.user_id)) {
    throw new AppointmentError('You cannot book a consultation with yourself');
  }

  const feeRow = await query(
    `SELECT online_fee, inperson_fee FROM lawyer_profiles WHERE id = $1`,
    [lawyerRow.id]
  );

  const { date, time } = parseAppointmentSlot(body);
  if (await isSlotTaken(lawyerRow.id, date, time)) {
    throw new AppointmentError('This slot is no longer available', 409);
  }

  const sourceRaw = String(body.source || '').toLowerCase();
  const categoryId = body.categoryId || body.category_id || null;
  const isCustom = sourceRaw === 'custom_docs'
    || String(categoryId || '').toLowerCase() === 'drafting'
    || normalizeAppointmentMode(body.mode) === 'document';
  const source = isCustom ? 'custom_docs' : (sourceRaw || 'consultation');
  const mode = normalizeAppointmentMode(body.mode);
  const subject = body.subject || (isCustom ? 'Document Drafting Consultation' : null);
  const matterNote = body.matterNote || body.intake || body.description || null;
  const clientCity = body.clientCity || body.city || null;
  const clientNotes = [
    clientCity ? `City: ${clientCity}` : null,
    matterNote,
  ].filter(Boolean).join('\n\n') || null;

  const jsonAttachments = Array.isArray(body.attachments) ? body.attachments : (Array.isArray(body.documents) ? body.documents : []);
  const fileAttachments = (files || []).map((file, index) => ({
    id: `file-${Date.now()}-${index}`,
    fileName: file.originalname || file.filename || `upload-${index + 1}`,
    mimeType: file.mimetype || 'application/octet-stream',
    contentBase64: file.buffer ? file.buffer.toString('base64') : null,
  }));
  const attachments = [...jsonAttachments, ...fileAttachments].map((item, index) => ({
    id: item.id || `att-${index + 1}`,
    fileName: item.fileName || item.name || `attachment-${index + 1}`,
    mimeType: item.mimeType || item.type || 'application/octet-stream',
    contentBase64: item.contentBase64 || item.content || null,
    url: item.url || null,
  }));

  const clientNameResultEarly = await query('SELECT username FROM users WHERE id = $1', [clientId]);
  const clientNameEarly = clientNameResultEarly.rows[0]?.username || 'Client';
  const assignedAt = new Date();
  const feeAmount = Number(
    mode === 'inperson'
      ? (feeRow.rows[0]?.inperson_fee ?? 0)
      : (feeRow.rows[0]?.online_fee ?? 0)
  ) || null;
  const { initialOversightFields } = await import('./adminAppointmentOversight.js');
  const oversight = initialOversightFields({
    lawyerRow,
    mode,
    source,
    fee: feeAmount,
    assignedAt,
    clientName: clientNameEarly,
    professionalName: lawyerRow.full_name,
  });

  const insert = await query(
    `INSERT INTO appointments (
       client_id, lawyer_prof_id, appointment_date, appointment_time, mode, status, client_notes,
       source, category_id, category_label, subject, service_area, matter_note, language, client_city,
       attachments, brief,
       fee, currency, duration_minutes,
       payment_status, refund_status, remittance_status,
       assignment_status, assigned_at, reassignment_required,
       meeting_status, join_status,
       acceptance_window_hours, acceptance_deadline,
       timeline, audit, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4::time, $5, 'pending', $6,
       $7, $8, $9, $10, $11, $12, $13, $14,
       $15::jsonb, $16::jsonb,
       $17, $18, $19,
       $20, $21, $22,
       $23, $24, FALSE,
       $25, $26,
       $27, $28,
       $29::jsonb, $30::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )
     RETURNING *`,
    [
      clientId,
      lawyerRow.id,
      date,
      time,
      mode,
      clientNotes,
      source,
      categoryId,
      body.categoryLabel || body.category || (isCustom ? 'Document Drafting' : null),
      subject,
      body.serviceArea || null,
      matterNote,
      body.language || body.lang || null,
      clientCity,
      JSON.stringify(attachments),
      JSON.stringify({
        source,
        categoryId,
        subject,
        serviceArea: body.serviceArea || null,
        matterNote,
        language: body.language || null,
        city: clientCity,
      }),
      oversight.fee,
      oversight.currency,
      oversight.duration_minutes,
      oversight.payment_status,
      oversight.refund_status,
      oversight.remittance_status,
      oversight.assignment_status,
      oversight.assigned_at,
      oversight.meeting_status,
      oversight.join_status,
      oversight.acceptance_window_hours,
      oversight.acceptance_deadline,
      JSON.stringify(oversight.timeline),
      JSON.stringify(oversight.audit),
    ]
  );

  await query(
    `UPDATE vlo_subscriptions SET consultations_used_this_month = consultations_used_this_month + 1
     WHERE client_id = $1 AND status = 'active'`,
    [clientId]
  );

  const slotLabel = `${date} at ${formatTimeLabel(time)}`;
  const clientName = clientNameEarly;
  const modeText = modeLabel(mode).toLowerCase();

  await notify(clientId, {
    title: isCustom ? 'Custom draft request submitted' : 'Consultation Booked',
    body: isCustom
      ? `Your document drafting request with ${lawyerRow.full_name} is booked for ${slotLabel}.`
      : `Your ${modeText} consultation with ${lawyerRow.full_name} is requested for ${slotLabel}.`,
    audience: 'client',
  });
  await notify(lawyerRow.user_id, {
    title: isCustom ? 'New custom docs request' : 'New Consultation Request',
    body: `${clientName} requested a ${isCustom ? 'custom document draft' : `${modeText} consultation`} for ${slotLabel}.`,
    audience: 'lawyer',
  });

  const row = insert.rows[0];
  return {
    success: true,
    appointmentId: String(row.id),
    lawyerName: lawyerRow.full_name,
    lawyerProfileId: lawyerRow.id,
    professionalProfileId: lawyerRow.id,
    slot: `${date}T${String(time).slice(0, 5)}:00+05:00`,
    mode,
    status: appointmentStatusLabel(row.status),
    statusKey: row.status,
    source,
    date,
    time: String(time).slice(0, 5),
    subject,
  };
}

export async function listClientAppointments(clientId) {
  const [lawyerRows, caRows] = await Promise.all([
    query(
      `SELECT a.*, lp.full_name AS professional_name, lp.id AS professional_profile_id, 'Lawyer' AS professional_role
       FROM appointments a
       JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
       WHERE a.client_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [clientId]
    ),
    query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.mode, a.status, a.topic AS client_notes,
              NULL::text AS source, NULL::text AS category_id, NULL::text AS category_label,
              NULL::text AS subject, NULL::text AS service_area, a.topic AS matter_note,
              NULL::text AS language, NULL::text AS client_city, '[]'::jsonb AS attachments,
              NULL::text AS response_note, NULL::text AS delivered_order_number,
              cp.full_name AS professional_name, cp.id AS professional_profile_id, 'CA' AS professional_role
       FROM ca_appointments a
       JOIN ca_profiles cp ON cp.id = a.ca_prof_id
       WHERE a.client_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [clientId]
    ),
  ]);

  return {
    appointments: [
      ...lawyerRows.rows.map(mapClientAppointmentRow),
      ...caRows.rows.map(mapClientAppointmentRow),
    ],
  };
}

export async function listAdminAppointments(filters = {}) {
  const { listAdminAppointmentsOversight } = await import('./adminAppointmentOversight.js');
  return listAdminAppointmentsOversight(filters);
}

export async function patchAdminAppointment(appointmentId, body = {}, adminActor = {}) {
  const existing = await query(
    `SELECT a.*, lp.full_name AS lawyer_name, lp.id AS lawyer_prof_id
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     WHERE a.id = $1`,
    [appointmentId]
  );
  const row = existing.rows[0];
  if (!row) throw new AppointmentError('Appointment not found', 404);
  const result = await patchLawyerAppointment(row.lawyer_prof_id, appointmentId, body, {
    actorType: 'admin',
    actorName: adminActor.name || adminActor.email || 'Admin',
  });
  const { getAdminAppointmentById } = await import('./adminAppointmentOversight.js');
  try {
    const detail = await getAdminAppointmentById(appointmentId);
    return { ...result, appointment: detail.appointment, success: true };
  } catch {
    return result;
  }
}

export async function listLawyerAppointments(lawyerProfId) {
  const result = await query(
    `SELECT a.*, lp.full_name AS lawyer_name, lp.id AS lawyer_prof_id,
            u.username AS client_name, u.email AS client_email, u.phone AS client_phone
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     JOIN users u ON u.id = a.client_id
     WHERE a.lawyer_prof_id = $1
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [lawyerProfId]
  );
  return { appointments: result.rows.map(mapLawyerAppointmentRow) };
}

export async function patchLawyerAppointment(lawyerProfId, appointmentId, body = {}, actor = {}) {
  const existing = await query(
    `SELECT a.*, lp.full_name AS lawyer_name, lp.user_id AS lawyer_user_id
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     WHERE a.id = $1 AND a.lawyer_prof_id = $2`,
    [appointmentId, lawyerProfId]
  );
  const row = existing.rows[0];
  if (!row) throw new AppointmentError('Appointment not found', 404);

  const sets = [];
  const params = [];
  const push = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };

  if (body.status !== undefined) {
    push('status', normalizeAppointmentStatus(body.status));
  }
  if (body.responseNote !== undefined) push('response_note', body.responseNote || null);

  if (body.slot || body.date || body.timeSlot) {
    const next = parseAppointmentSlot({
      slot: body.slot,
      date: body.date || row.appointment_date,
      timeSlot: body.timeSlot || body.time,
    });
    if (await isSlotTaken(lawyerProfId, next.date, next.time, row.id)) {
      throw new AppointmentError('This slot is no longer available', 409);
    }
    push('appointment_date', next.date);
    params.push(next.time);
    sets.push(`appointment_time = $${params.length}::time`);
    if (body.status === undefined) push('status', 'rescheduled');
  }

  if (!sets.length) {
    throw new AppointmentError('No appointment fields to update');
  }

  params.push(row.id, lawyerProfId);
  await query(
    `UPDATE appointments SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${params.length - 1} AND lawyer_prof_id = $${params.length}`,
    params
  );

  const nextStatus = body.status !== undefined
    ? normalizeAppointmentStatus(body.status)
    : (body.slot || body.date || body.timeSlot ? 'rescheduled' : row.status);

  const actorType = actor.actorType || 'professional';
  const actorName = actor.actorName || row.lawyer_name || 'Professional';
  const { appendAppointmentAudit, appendAppointmentTimeline } = await import('./adminAppointmentOversight.js');
  await appendAppointmentAudit(row.id, {
    action: `Status → ${appointmentStatusLabel(nextStatus)}`,
    performedBy: actorName,
    actorType,
    meta: body.responseNote ? { responseNote: body.responseNote } : undefined,
  });
  if (nextStatus === 'confirmed') {
    await appendAppointmentTimeline(row.id, [
      { label: 'Accepted by Professional', state: 'done' },
    ]);
  } else if (nextStatus === 'completed') {
    await appendAppointmentTimeline(row.id, [
      { label: 'Completed', state: 'done' },
    ]);
  }

  const updated = await query(
    `SELECT a.*, lp.full_name AS lawyer_name, lp.id AS lawyer_prof_id,
            u.username AS client_name, u.email AS client_email, u.phone AS client_phone
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     JOIN users u ON u.id = a.client_id
     WHERE a.id = $1`,
    [row.id]
  );

  await notify(row.client_id, {
    title: 'Appointment Update',
    body: `Your consultation is now ${appointmentStatusLabel(nextStatus)}.`,
    audience: 'client',
  });

  return {
    success: true,
    status: appointmentStatusLabel(updated.rows[0].status),
    statusKey: updated.rows[0].status,
    appointment: mapLawyerAppointmentRow(updated.rows[0]),
  };
}

export async function deliverCustomDraft(lawyerUserId, lawyerProfId, appointmentId, { file, title, notes } = {}) {
  const existing = await query(
    `SELECT a.*, lp.full_name AS lawyer_name
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     WHERE a.id = $1 AND a.lawyer_prof_id = $2`,
    [appointmentId, lawyerProfId]
  );
  const appt = existing.rows[0];
  if (!appt) throw new AppointmentError('Appointment not found', 404);

  if (appt.delivered_order_number) {
    const existingDoc = await query(
      `SELECT order_number, status, intake_form_data FROM service_orders WHERE order_number = $1`,
      [appt.delivered_order_number]
    );
    if (existingDoc.rows[0]) {
      return {
        success: true,
        appointmentId: String(appt.id),
        status: 'Completed',
        document: {
          orderNumber: existingDoc.rows[0].order_number,
          title: existingDoc.rows[0].intake_form_data?.title || appt.subject || 'Custom draft',
          source: 'custom_docs',
          status: existingDoc.rows[0].status,
        },
      };
    }
  }

  if (!file?.buffer) {
    throw new AppointmentError('file is required (PDF or DOCX)');
  }

  const serviceId = await ensureCustomDraftingService();
  const orderNumber = `NL-CD-${String(appt.id).padStart(6, '0')}`;
  const docTitle = title || appt.subject || 'Custom draft';
  const formData = {
    source: 'custom_docs',
    appointmentId: String(appt.id),
    title: docTitle,
    notes: notes || appt.response_note || null,
    deliveredFileName: file.originalname || `${docTitle}.pdf`,
    deliveredMimeType: file.mimetype || 'application/pdf',
    deliveredFileBase64: file.buffer.toString('base64'),
    purchasedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await query(
    `INSERT INTO service_orders (
       order_number, client_id, service_id, assigned_prof_id, status, intake_form_data,
       completed_file, milestone, expected_delivery
     ) VALUES ($1, $2, $3, $4, 'completed', $5::jsonb, $6, 'Delivered custom draft', CURRENT_TIMESTAMP)
     ON CONFLICT (order_number) DO UPDATE SET
       status = 'completed',
       intake_form_data = EXCLUDED.intake_form_data,
       completed_file = EXCLUDED.completed_file,
       milestone = EXCLUDED.milestone,
       assigned_prof_id = EXCLUDED.assigned_prof_id`,
    [
      orderNumber,
      appt.client_id,
      serviceId,
      lawyerUserId,
      JSON.stringify(formData),
      `custom:${orderNumber}`,
    ]
  );

  await query(
    `UPDATE appointments
     SET status = 'completed',
         delivered_order_number = $1,
         response_note = COALESCE($2, response_note)
     WHERE id = $3`,
    [orderNumber, notes || null, appt.id]
  );

  await notify(appt.client_id, {
    title: 'Custom draft ready',
    body: `"${docTitle}" has been added to My Documents.`,
    type: 'order',
    link: '/account/documents',
    audience: 'client',
  });

  return {
    success: true,
    appointmentId: String(appt.id),
    status: 'Completed',
    document: {
      orderNumber,
      title: docTitle,
      source: 'custom_docs',
      status: 'completed',
    },
  };
}

export async function deliverLawyerOrder(lawyerUserId, orderId, file) {
  const result = await query(
    `SELECT so.id, so.order_number, so.client_id, so.intake_form_data
     FROM service_orders so
     WHERE (so.id::text = $1 OR so.order_number = $1)
       AND so.assigned_prof_id = $2`,
    [String(orderId), lawyerUserId]
  );
  const order = result.rows[0];
  if (!order) return null;
  if (!file?.buffer) throw new AppointmentError('document file is required');

  const formData = {
    ...(order.intake_form_data || {}),
    deliveredFileName: file.originalname || 'document.pdf',
    deliveredMimeType: file.mimetype || 'application/pdf',
    deliveredFileBase64: file.buffer.toString('base64'),
    purchasedAt: new Date().toISOString(),
  };

  await query(
    `UPDATE service_orders
     SET status = 'completed',
         intake_form_data = $1::jsonb,
         completed_file = COALESCE(NULLIF(completed_file, ''), $2),
         milestone = 'Delivered by lawyer'
     WHERE id = $3`,
    [JSON.stringify(formData), `custom:${order.order_number}`, order.id]
  );

  return { success: true, orderId: order.order_number, file: file.originalname };
}
