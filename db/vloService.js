/**
 * Virtual Legal Office (VLO) — NL-BE-VLO-001
 * Plans, subscriptions, matters (client / lawyer / admin).
 * Payment gateways deferred — subscribe creates active sub with paymentStatus=manual_pending.
 */
import { query } from './index.js';
import { ensureVloSchema } from './ensureVloSchema.js';
import { buildPaginationMeta, parsePagination } from '../shared/lib/pagination.js';

export class VloError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const PLAN_NAMES = new Set(['Starter', 'Growth', 'Enterprise']);
const SUB_STATUSES = new Set(['active', 'cancelled', 'paused', 'expired']);
const MATTER_STATUSES = new Set(['received', 'under_review', 'completed']);
const LIST_LIMITS = [12, 24, 48];

const STATUS_LABEL = {
  received: 'Awaiting Counsel Vetting',
  under_review: 'Awaiting Review',
  completed: 'Opinion Rendered',
};

function fail(message, status = 422, fields = {}) {
  throw new VloError(message, status, {
    success: false,
    error: 'Validation failed',
    message,
    fields,
  });
}

function formatPrice(amount) {
  return `Rs. ${Number(amount).toLocaleString('en-PK')}`;
}

function limitLabel(n) {
  if (n == null) return null;
  if (Number(n) < 0) return 'Unlimited';
  return Number(n);
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseListLimit(q = {}) {
  let page = Number.parseInt(q.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let limit = Number.parseInt(q.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  else if (!LIST_LIMITS.includes(limit)) {
    limit = LIST_LIMITS.reduce((best, a) => (Math.abs(a - limit) < Math.abs(best - limit) ? a : best), 12);
  }
  return { page, limit };
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    slug: String(row.name).toLowerCase(),
    monthlyFee: Number(row.monthly_fee),
    monthlyFeeLabel: formatPrice(row.monthly_fee),
    documentReviewsPerMonth: limitLabel(row.document_reviews_per_month),
    consultationsPerMonth: limitLabel(row.consultations_per_month),
    supportChannel: row.support_channel,
    complianceReport: row.compliance_report,
    hasDedicatedLawyer: Boolean(row.has_dedicated_lawyer),
  };
}

function mapLawyer(row) {
  if (!row?.assigned_lawyer_id && !row?.lawyer_user_id) return null;
  return {
    id: String(row.assigned_lawyer_id || row.lawyer_user_id),
    name: row.lawyer_name || null,
    email: row.lawyer_email || null,
    profileId: row.lawyer_profile_id != null ? String(row.lawyer_profile_id) : null,
  };
}

function mapSubscription(row) {
  if (!row) return null;
  const reviewsLimit = Number(row.document_reviews_per_month);
  const consultLimit = Number(row.consultations_per_month);
  const reviewsUsed = Number(row.reviews_used_this_month) || 0;
  const consultUsed = Number(row.consultations_used_this_month) || 0;
  const mattersUsed = Number(row.matters_submitted_this_month) || 0;

  return {
    id: String(row.id),
    status: row.status,
    paymentStatus: row.payment_status || 'manual_pending',
    plan: mapPlan({
      id: row.plan_id,
      name: row.plan_name,
      monthly_fee: row.monthly_fee,
      document_reviews_per_month: row.document_reviews_per_month,
      consultations_per_month: row.consultations_per_month,
      support_channel: row.support_channel,
      compliance_report: row.compliance_report,
      has_dedicated_lawyer: row.has_dedicated_lawyer,
    }),
    // legacy FE shape
    planName: `${row.plan_name} Retainer Plan`,
    price: formatPrice(row.monthly_fee),
    nextBillingDate: row.next_billing_date,
    startDate: row.start_date,
    cancelledAt: row.cancelled_at || null,
    assignedLawyer: mapLawyer(row),
    usage: {
      reviewsUsed,
      reviewsLimit: limitLabel(reviewsLimit),
      reviewsRemaining: reviewsLimit < 0 ? null : Math.max(0, reviewsLimit - reviewsUsed),
      consultationsUsed: consultUsed,
      consultationsLimit: limitLabel(consultLimit),
      consultationsRemaining: consultLimit < 0 ? null : Math.max(0, consultLimit - consultUsed),
      mattersSubmittedThisMonth: mattersUsed,
    },
    stripeSubscriptionId: row.stripe_subscription_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function matterFileMeta(row, kind = 'intake') {
  if (kind === 'completed') {
    if (!row.completed_file_content_base64 && !row.completed_file) return null;
    return {
      url: `/api/v2/vlo/matters/${row.id}/file?kind=completed`,
      fileName: row.completed_file_name || row.completed_file || `matter-${row.id}-opinion.pdf`,
      mime: row.completed_file_mime || 'application/pdf',
      hasFile: Boolean(row.completed_file_content_base64 || row.completed_file),
    };
  }
  if (!row.file_content_base64 && !row.file) return null;
  return {
    url: `/api/v2/vlo/matters/${row.id}/file?kind=intake`,
    fileName: row.file_name || row.file || `matter-${row.id}.bin`,
    mime: row.file_mime || 'application/octet-stream',
    hasFile: Boolean(row.file_content_base64 || row.file),
  };
}

export function mapMatter(row, { publicBaseUrl = null } = {}) {
  if (!row) return null;
  const base = publicBaseUrl || '';
  const intake = matterFileMeta(row, 'intake');
  const completed = matterFileMeta(row, 'completed');
  if (intake?.url) intake.url = `${base}${intake.url}`;
  if (completed?.url) completed.url = `${base}${completed.url}`;

  return {
    id: String(row.id),
    // legacy client id prefix
    legacyId: `m-${row.id}`,
    title: row.title,
    description: row.description,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] || row.status,
    lawyerNotes: row.lawyer_notes || null,
    opinion: row.lawyer_notes || null,
    file: intake,
    completedFile: completed,
    attachment: completed?.fileName || row.completed_file || null,
    subscriptionId: row.subscription_id != null ? String(row.subscription_id) : null,
    clientId: row.client_id != null ? String(row.client_id) : null,
    clientName: row.client_name || null,
    clientEmail: row.client_email || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
  };
}

const SUB_SELECT = `
  SELECT vs.*, vp.name AS plan_name, vp.monthly_fee, vp.document_reviews_per_month,
         vp.consultations_per_month, vp.support_channel, vp.compliance_report, vp.has_dedicated_lawyer,
         u.username AS lawyer_name, u.email AS lawyer_email,
         lp.id AS lawyer_profile_id
  FROM vlo_subscriptions vs
  JOIN vlo_plans vp ON vp.id = vs.plan_id
  LEFT JOIN users u ON u.id = vs.assigned_lawyer_id
  LEFT JOIN lawyer_profiles lp ON lp.user_id = vs.assigned_lawyer_id
`;

async function getActiveSubscriptionRow(clientId) {
  const result = await query(
    `${SUB_SELECT}
     WHERE vs.client_id = $1 AND vs.status = 'active'
     ORDER BY vs.id DESC LIMIT 1`,
    [clientId]
  );
  return result.rows[0] || null;
}

async function getSubscriptionRowById(id) {
  const result = await query(`${SUB_SELECT} WHERE vs.id = $1`, [Number(id)]);
  return result.rows[0] || null;
}

async function createNotification(userId, { title, body, type = 'vlo', link = '/account/vlo', audience = 'client' }) {
  try {
    await query(
      `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, title, body, type, link, audience]
    );
  } catch {
    try {
      await query(
        `INSERT INTO notifications (user_id, title, body, notification_type, link)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, title, body, type, link]
      );
    } catch { /* best-effort */ }
  }
}

export async function listVloPlans() {
  await ensureVloSchema();
  const result = await query(`SELECT * FROM vlo_plans ORDER BY monthly_fee ASC`);
  return {
    success: true,
    data: {
      plans: result.rows.map(mapPlan),
      counts: { plans: result.rows.length },
    },
  };
}

export async function getClientSubscription(clientId) {
  await ensureVloSchema();
  const row = await getActiveSubscriptionRow(clientId);
  if (!row) {
    return {
      success: true,
      data: null,
      // legacy empty shape
      planName: '',
      price: '',
      nextBillingDate: '',
    };
  }
  const mapped = mapSubscription(row);
  return {
    success: true,
    data: mapped,
    ...mapped,
  };
}

export async function subscribeToVlo(clientId, body = {}) {
  await ensureVloSchema();
  const planKey = body.planId || body.plan || body.planName || body.slug;
  if (!planKey) fail('planId or planName is required', 422, { planId: 'required' });

  let planRow;
  if (/^\d+$/.test(String(planKey))) {
    planRow = (await query(`SELECT * FROM vlo_plans WHERE id = $1`, [Number(planKey)])).rows[0];
  } else {
    const name = String(planKey).trim();
    const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    const pretty = PLAN_NAMES.has(name) ? name
      : PLAN_NAMES.has(normalized) ? normalized
        : null;
    planRow = (await query(
      `SELECT * FROM vlo_plans WHERE LOWER(name) = LOWER($1)`,
      [pretty || name]
    )).rows[0];
  }
  if (!planRow) fail('Unknown VLO plan', 404, { planId: 'unknown' });

  const existing = await getActiveSubscriptionRow(clientId);
  if (existing) {
    throw new VloError('Client already has an active VLO subscription', 409, {
      success: false,
      error: 'Already subscribed',
      message: 'Cancel the current plan before subscribing to another.',
      fields: { subscription: 'active' },
      data: mapSubscription(existing),
    });
  }

  const start = today();
  const nextBill = addMonths(start, 1);
  const paymentStatus = body.paymentStatus || 'manual_pending';
  const stripeId = body.stripeSubscriptionId || null;

  const insert = await query(
    `INSERT INTO vlo_subscriptions (
       client_id, plan_id, status, start_date, next_billing_date,
       payment_status, stripe_subscription_id, created_at, updated_at
     ) VALUES ($1, $2, 'active', $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [clientId, planRow.id, start, nextBill, paymentStatus, stripeId]
  );

  const row = await getSubscriptionRowById(insert.rows[0].id);
  await createNotification(clientId, {
    title: 'VLO Subscription Active',
    body: `Your ${planRow.name} retainer is active. You can submit matters from the VLO portal.`,
    type: 'billing',
    link: '/account/vlo',
    audience: 'client',
  });

  return {
    success: true,
    data: mapSubscription(row),
    message: 'Subscription created. Real JazzCash/Stripe billing will attach later — paymentStatus is manual_pending.',
  };
}

export async function cancelClientSubscription(clientId) {
  await ensureVloSchema();
  const existing = await getActiveSubscriptionRow(clientId);
  if (!existing) throw new VloError('No active VLO subscription', 404);

  await query(
    `UPDATE vlo_subscriptions
     SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [existing.id]
  );

  await createNotification(clientId, {
    title: 'Subscription Cancelled',
    body: 'Your VLO retainer subscription has been cancelled. You can re-subscribe anytime.',
    type: 'billing',
    link: '/account/subscriptions',
    audience: 'client',
  });

  const row = await getSubscriptionRowById(existing.id);
  return { success: true, data: mapSubscription(row) };
}

export async function listClientMatters(clientId, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  const result = await query(
    `SELECT vm.*, vs.client_id
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     WHERE vs.client_id = $1
     ORDER BY vm.created_at DESC`,
    [clientId]
  );
  const items = result.rows.map((r) => mapMatter(r, { publicBaseUrl }));
  return { success: true, data: { items, counts: { total: items.length } }, matters: items };
}

export async function getClientMatter(clientId, matterId, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  const numericId = String(matterId).replace(/^m-/, '');
  const result = await query(
    `SELECT vm.*, vs.client_id, u.username AS client_name, u.email AS client_email
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     JOIN users u ON u.id = vs.client_id
     WHERE vs.client_id = $1 AND vm.id = $2`,
    [clientId, Number(numericId)]
  );
  if (!result.rows[0]) throw new VloError('Matter not found', 404);
  return { success: true, data: mapMatter(result.rows[0], { publicBaseUrl }) };
}

export async function createClientMatter(clientId, { title, description, file = null }, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  if (!String(title || '').trim()) fail('title is required', 422, { title: 'required' });
  if (!String(description || '').trim()) fail('description is required', 422, { description: 'required' });

  const sub = await getActiveSubscriptionRow(clientId);
  if (!sub) throw new VloError('No active VLO subscription found', 403, {
    success: false,
    error: 'No active VLO subscription',
    message: 'Subscribe to a VLO plan before submitting matters.',
  });

  const fileName = file?.fileName || file?.originalname || null;
  const fileMime = file?.mimeType || file?.mimetype || null;
  const fileB64 = file?.contentBase64 || (file?.buffer ? file.buffer.toString('base64') : null);

  const result = await query(
    `INSERT INTO vlo_matters (
       subscription_id, title, description, file, status,
       file_name, file_mime, file_content_base64
     ) VALUES ($1, $2, $3, $4, 'received', $5, $6, $7)
     RETURNING id`,
    [
      sub.id,
      String(title).trim().slice(0, 255),
      String(description).trim(),
      fileName,
      fileName,
      fileMime,
      fileB64,
    ]
  );

  await query(
    `UPDATE vlo_subscriptions
     SET matters_submitted_this_month = matters_submitted_this_month + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [sub.id]
  );

  await createNotification(clientId, {
    title: 'VLO Matter Submitted',
    body: `Your matter "${title}" has been submitted and is awaiting counsel review.`,
    audience: 'client',
  });

  if (sub.assigned_lawyer_id) {
    await createNotification(sub.assigned_lawyer_id, {
      title: 'New VLO Matter',
      body: `A client submitted a new matter: "${title}".`,
      link: '/account/vlo',
      audience: 'lawyer',
    });
  }

  return getClientMatter(clientId, result.rows[0].id, { publicBaseUrl });
}

async function loadMatterForLawyer(lawyerUserId, matterId) {
  const numericId = String(matterId).replace(/^m-/, '');
  const result = await query(
    `SELECT vm.*, vs.client_id, vs.assigned_lawyer_id,
            u.username AS client_name, u.email AS client_email
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     JOIN users u ON u.id = vs.client_id
     WHERE vm.id = $1`,
    [Number(numericId)]
  );
  const row = result.rows[0];
  if (!row) throw new VloError('Matter not found', 404);
  if (row.assigned_lawyer_id && Number(row.assigned_lawyer_id) !== Number(lawyerUserId)) {
    // Allow any lawyer if unassigned; if assigned, only that lawyer
    throw new VloError('Matter is assigned to another lawyer', 403);
  }
  return row;
}

export async function updateLawyerMatter(lawyerUserId, matterId, body = {}, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  const row = await loadMatterForLawyer(lawyerUserId, matterId);
  const nextStatus = body.status !== undefined ? String(body.status) : row.status;
  if (!MATTER_STATUSES.has(nextStatus)) fail('status must be received|under_review|completed', 422, { status: 'invalid' });

  const notes = body.lawyerNotes !== undefined || body.notes !== undefined || body.opinion !== undefined
    ? String(body.lawyerNotes ?? body.notes ?? body.opinion ?? '')
    : row.lawyer_notes;

  const updated = await query(
    `UPDATE vlo_matters SET
       status = $2,
       lawyer_notes = $3,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id`,
    [row.id, nextStatus, notes]
  );

  if (nextStatus === 'completed' && row.status !== 'completed') {
    await createNotification(row.client_id, {
      title: 'VLO Opinion Ready',
      body: `Counsel has completed review of "${row.title}".`,
      audience: 'client',
    });
  }

  const fresh = await query(
    `SELECT vm.*, vs.client_id, u.username AS client_name, u.email AS client_email
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     JOIN users u ON u.id = vs.client_id
     WHERE vm.id = $1`,
    [updated.rows[0].id]
  );
  return { success: true, data: mapMatter(fresh.rows[0], { publicBaseUrl }) };
}

export async function uploadMatterCompletedFile(lawyerUserId, matterId, file, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  if (!file?.buffer && !file?.contentBase64) fail('file is required', 400, { file: 'required' });
  const row = await loadMatterForLawyer(lawyerUserId, matterId);
  const fileName = file.fileName || file.originalname || `matter-${row.id}-opinion.pdf`;
  const mime = file.mimeType || file.mimetype || 'application/pdf';
  const b64 = file.contentBase64 || file.buffer.toString('base64');

  await query(
    `UPDATE vlo_matters SET
       completed_file = $2,
       completed_file_name = $2,
       completed_file_mime = $3,
       completed_file_content_base64 = $4,
       status = CASE WHEN status = 'received' THEN 'under_review' ELSE status END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [row.id, fileName, mime, b64]
  );

  await createNotification(row.client_id, {
    title: 'VLO Document Uploaded',
    body: `Counsel uploaded a document for "${row.title}".`,
    audience: 'client',
  });

  return getClientMatter(row.client_id, row.id, { publicBaseUrl });
}

export async function getMatterFile(matterId, { kind = 'intake', clientId = null, lawyerUserId = null, admin = false } = {}) {
  await ensureVloSchema();
  const numericId = String(matterId).replace(/^m-/, '');
  const result = await query(
    `SELECT vm.*, vs.client_id, vs.assigned_lawyer_id
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     WHERE vm.id = $1`,
    [Number(numericId)]
  );
  const row = result.rows[0];
  if (!row) throw new VloError('Matter not found', 404);

  if (!admin) {
    const isClient = clientId && Number(clientId) === Number(row.client_id);
    const isLawyer = lawyerUserId && (
      !row.assigned_lawyer_id || Number(lawyerUserId) === Number(row.assigned_lawyer_id)
    );
    if (!isClient && !isLawyer) throw new VloError('Forbidden', 403);
  }

  if (kind === 'completed') {
    if (!row.completed_file_content_base64) throw new VloError('File not found', 404);
    return {
      fileName: row.completed_file_name || row.completed_file || `matter-${row.id}-opinion.pdf`,
      mimeType: row.completed_file_mime || 'application/pdf',
      buffer: Buffer.from(row.completed_file_content_base64, 'base64'),
    };
  }
  if (!row.file_content_base64) throw new VloError('File not found', 404);
  return {
    fileName: row.file_name || row.file || `matter-${row.id}.bin`,
    mimeType: row.file_mime || 'application/octet-stream',
    buffer: Buffer.from(row.file_content_base64, 'base64'),
  };
}

export async function listLawyerSubscribers(lawyerUserId) {
  await ensureVloSchema();
  const result = await query(
    `SELECT vs.id AS subscription_id, vs.status, vs.start_date, vs.next_billing_date,
            vs.matters_submitted_this_month, vp.name AS plan_name, vp.monthly_fee,
            u.id AS client_id, u.username AS name, u.email,
            (SELECT COUNT(*)::int FROM vlo_matters vm WHERE vm.subscription_id = vs.id) AS matter_count
     FROM vlo_subscriptions vs
     JOIN vlo_plans vp ON vp.id = vs.plan_id
     JOIN users u ON u.id = vs.client_id
     WHERE vs.assigned_lawyer_id = $1
     ORDER BY vs.id DESC`,
    [lawyerUserId]
  );
  return {
    success: true,
    data: {
      subscribers: result.rows.map((r) => ({
        subscriptionId: String(r.subscription_id),
        clientId: String(r.client_id),
        name: r.name,
        email: r.email,
        status: r.status,
        planName: r.plan_name,
        monthlyFeeLabel: formatPrice(r.monthly_fee),
        matterCount: r.matter_count,
        nextBillingDate: r.next_billing_date,
      })),
      counts: { total: result.rows.length },
    },
    subscribers: result.rows,
  };
}

export async function listLawyerMattersForSubscriber(lawyerUserId, subscriberId, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  const result = await query(
    `SELECT vm.*, vs.client_id, u.username AS client_name, u.email AS client_email
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     JOIN users u ON u.id = vs.client_id
     WHERE vs.client_id = $1
       AND (vs.assigned_lawyer_id = $2 OR vs.assigned_lawyer_id IS NULL)
     ORDER BY vm.created_at DESC`,
    [Number(subscriberId), lawyerUserId]
  );
  const items = result.rows.map((r) => mapMatter(r, { publicBaseUrl }));
  return { success: true, data: { items }, matters: items };
}

export async function listAdminSubscriptions(filters = {}, { publicBaseUrl = null } = {}) {
  await ensureVloSchema();
  const { page, limit } = parseListLimit(filters);
  const params = [];
  const where = [];

  if (filters.status && SUB_STATUSES.has(String(filters.status))) {
    params.push(String(filters.status));
    where.push(`vs.status = $${params.length}`);
  }
  if (filters.plan && PLAN_NAMES.has(String(filters.plan))) {
    params.push(String(filters.plan));
    where.push(`vp.name = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${String(filters.search).trim()}%`);
    const i = params.length;
    where.push(`(u.username ILIKE $${i} OR u.email ILIKE $${i} OR vp.name ILIKE $${i})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(
    `SELECT COUNT(*)::int AS total
     FROM vlo_subscriptions vs
     JOIN vlo_plans vp ON vp.id = vs.plan_id
     JOIN users u ON u.id = vs.client_id
     ${whereSql}`,
    params
  );
  const totalItems = count.rows[0]?.total || 0;
  const pagination = buildPaginationMeta({ ...parsePagination({ page, limit }), totalItems });

  params.push(pagination.limit, pagination.offset);
  const rows = await query(
    `SELECT vs.*, vp.name AS plan_name, vp.monthly_fee, vp.document_reviews_per_month,
            vp.consultations_per_month, vp.support_channel, vp.compliance_report, vp.has_dedicated_lawyer,
            u.id AS client_user_id, u.username AS client_name, u.email AS client_email,
            lu.username AS lawyer_name, lu.email AS lawyer_email, lp.id AS lawyer_profile_id
     FROM vlo_subscriptions vs
     JOIN vlo_plans vp ON vp.id = vs.plan_id
     JOIN users u ON u.id = vs.client_id
     LEFT JOIN users lu ON lu.id = vs.assigned_lawyer_id
     LEFT JOIN lawyer_profiles lp ON lp.user_id = vs.assigned_lawyer_id
     ${whereSql}
     ORDER BY vs.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const kpi = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
      COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
      COUNT(*) FILTER (WHERE assigned_lawyer_id IS NULL AND status = 'active')::int AS unassigned
    FROM vlo_subscriptions
  `);

  return {
    success: true,
    data: {
      items: rows.rows.map((r) => ({
        ...mapSubscription(r),
        client: {
          id: String(r.client_user_id),
          name: r.client_name,
          email: r.client_email,
        },
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: pagination.totalItems,
        totalPages: pagination.totalPages,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
      },
      counts: kpi.rows[0] || {
        total: 0, active: 0, cancelled: 0, paused: 0, expired: 0, unassigned: 0,
      },
    },
  };
}

export async function getAdminSubscription(subscriptionId) {
  await ensureVloSchema();
  const result = await query(
    `SELECT vs.*, vp.name AS plan_name, vp.monthly_fee, vp.document_reviews_per_month,
            vp.consultations_per_month, vp.support_channel, vp.compliance_report, vp.has_dedicated_lawyer,
            u.id AS client_user_id, u.username AS client_name, u.email AS client_email,
            lu.username AS lawyer_name, lu.email AS lawyer_email, lp.id AS lawyer_profile_id
     FROM vlo_subscriptions vs
     JOIN vlo_plans vp ON vp.id = vs.plan_id
     JOIN users u ON u.id = vs.client_id
     LEFT JOIN users lu ON lu.id = vs.assigned_lawyer_id
     LEFT JOIN lawyer_profiles lp ON lp.user_id = vs.assigned_lawyer_id
     WHERE vs.id = $1`,
    [Number(subscriptionId)]
  );
  const r = result.rows[0];
  if (!r) throw new VloError('Subscription not found', 404);
  return {
    success: true,
    data: {
      ...mapSubscription(r),
      client: {
        id: String(r.client_user_id),
        name: r.client_name,
        email: r.client_email,
      },
    },
  };
}

export async function assignLawyerToSubscription(subscriptionId, body = {}, adminUserId = null) {
  await ensureVloSchema();
  const row = await getSubscriptionRowById(subscriptionId);
  if (!row) throw new VloError('Subscription not found', 404);

  let lawyerUserId = body.lawyerUserId || body.lawyerId || body.userId || null;
  const lawyerProfileId = body.lawyerProfileId || null;

  if (!lawyerUserId && lawyerProfileId) {
    const lp = await query(
      `SELECT user_id FROM lawyer_profiles WHERE id = $1`,
      [Number(lawyerProfileId)]
    );
    lawyerUserId = lp.rows[0]?.user_id || null;
  }
  if (!lawyerUserId) fail('lawyerUserId or lawyerProfileId is required', 422, { lawyerUserId: 'required' });

  const lawyer = await query(
    `SELECT u.id, u.username, u.email, u.role, lp.id AS profile_id
     FROM users u
     LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id
     WHERE u.id = $1 AND u.is_active = TRUE`,
    [Number(lawyerUserId)]
  );
  if (!lawyer.rows[0] || lawyer.rows[0].role !== 'lawyer') {
    fail('Assigned user must be an active lawyer', 422, { lawyerUserId: 'invalid' });
  }

  await query(
    `UPDATE vlo_subscriptions
     SET assigned_lawyer_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [row.id, Number(lawyerUserId)]
  );

  await createNotification(Number(lawyerUserId), {
    title: 'VLO Client Assigned',
    body: `You have been assigned as dedicated counsel for a ${row.plan_name} subscriber.`,
    link: '/account/vlo',
    audience: 'lawyer',
  });

  await createNotification(row.client_id, {
    title: 'Dedicated Lawyer Assigned',
    body: `${lawyer.rows[0].username} is now your dedicated VLO counsel.`,
    audience: 'client',
  });

  const fresh = await getSubscriptionRowById(row.id);
  return { success: true, data: mapSubscription(fresh), updatedBy: adminUserId != null ? String(adminUserId) : null };
}

export async function getAdminVloStats() {
  await ensureVloSchema();
  const subs = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE assigned_lawyer_id IS NULL AND status = 'active')::int AS unassigned
    FROM vlo_subscriptions
  `);
  const matters = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'received')::int AS received,
      COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM vlo_matters
  `);
  const byPlan = await query(`
    SELECT vp.name, COUNT(vs.id)::int AS subscribers
    FROM vlo_plans vp
    LEFT JOIN vlo_subscriptions vs ON vs.plan_id = vp.id AND vs.status = 'active'
    GROUP BY vp.id, vp.name
    ORDER BY vp.monthly_fee ASC
  `);
  return {
    success: true,
    data: {
      subscriptions: subs.rows[0],
      matters: matters.rows[0],
      byPlan: byPlan.rows.map((r) => ({ plan: r.name, activeSubscribers: r.subscribers })),
    },
  };
}
