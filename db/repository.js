import { query } from './index.js';

const DEMO_CLIENT_EMAIL = process.env.DEMO_CLIENT_EMAIL || 'habibcorp@nexuslexis.law';

const ORDER_STATUS_MAP = {
  pending_payment: 'Pending Payment',
  processing: 'Processing',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const MATTER_STATUS_MAP = {
  received: 'Awaiting Counsel Vetting',
  under_review: 'Awaiting Review',
  completed: 'Opinion Rendered'
};

function formatPrice(amount) {
  return `Rs. ${Number(amount).toLocaleString('en-PK')}`;
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} mins ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function formatMessageTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export async function getDemoClient() {
  const result = await query(
    'SELECT id, username AS name, email, role FROM users WHERE email = $1 AND is_active = TRUE',
    [DEMO_CLIENT_EMAIL]
  );
  return result.rows[0] || null;
}

export async function addActivity(clientId, type, langKey, params = {}) {
  await query(
    `INSERT INTO client_activities (client_id, activity_type, lang_key, params)
     VALUES ($1, $2, $3, $4)`,
    [clientId, type, langKey, JSON.stringify(params)]
  );
}

export async function getStats(clientId) {
  const [orders, appointments, subscription, unread] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM service_orders
       WHERE client_id = $1 AND status IN ('pending_payment', 'processing', 'in_progress')`,
      [clientId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM appointments
       WHERE client_id = $1 AND status IN ('pending', 'confirmed')`,
      [clientId]
    ),
    query(
      `SELECT vp.name AS plan_name
       FROM vlo_subscriptions vs
       JOIN vlo_plans vp ON vp.id = vs.plan_id
       WHERE vs.client_id = $1 AND vs.status = 'active'
       ORDER BY vs.id DESC LIMIT 1`,
      [clientId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM messages
       WHERE recipient_id = $1 AND is_read = FALSE`,
      [clientId]
    )
  ]);

  return {
    activeOrders: orders.rows[0]?.count || 0,
    appointments: appointments.rows[0]?.count || 0,
    retainerTier: subscription.rows[0]?.plan_name || 'None',
    unreadMessages: unread.rows[0]?.count || 0
  };
}

export async function getNotifications(clientId) {
  const result = await query(
    `SELECT id, body AS text, link AS route
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE
     ORDER BY created_at DESC`,
    [clientId]
  );
  return result.rows;
}

export async function dismissNotification(clientId, id) {
  await query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [id, clientId]
  );
}

export async function clearNotifications(clientId) {
  await query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [clientId]
  );
}

export async function getActivities(clientId) {
  const result = await query(
    `SELECT id, activity_type AS type, lang_key AS "langKey", params, created_at AS timestamp
     FROM client_activities
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [clientId]
  );
  return result.rows.map((row) => ({
    id: `act-${row.id}`,
    type: row.type,
    langKey: row.langKey,
    params: row.params || {},
    timestamp: row.timestamp,
    timeAgo: formatTimeAgo(row.timestamp)
  }));
}

export async function getOrders(clientId) {
  const result = await query(
    `SELECT so.id, so.order_number, s.slug AS "templateId", s.name AS "templateName",
            so.status, so.intake_form_data AS "formData", so.expected_delivery
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     WHERE so.client_id = $1
     ORDER BY so.id DESC`,
    [clientId]
  );
  return result.rows.map((row) => ({
    id: row.order_number || String(row.id),
    templateId: row.templateId,
    templateName: row.templateName,
    status: ORDER_STATUS_MAP[row.status] || row.status,
    date: row.expected_delivery ? new Date(row.expected_delivery).toISOString().split('T')[0] : formatDate(),
    formData: row.formData || {}
  }));
}

export async function createOrder(clientId, { templateId, templateName, formData }) {
  let serviceResult = await query('SELECT id FROM services WHERE slug = $1', [templateId]);
  if (!serviceResult.rows[0]) {
    const cat = await query(`SELECT id FROM service_categories WHERE slug = 'document-services' LIMIT 1`);
    const categoryId = cat.rows[0]?.id || 1;
    serviceResult = await query(
      `INSERT INTO services (category_id, name, slug, price, delivery_days, intake_schema)
       VALUES ($1, $2, $3, 0, 7, '{}'::jsonb) RETURNING id`,
      [categoryId, templateName, templateId]
    );
  }

  const orderNumber = String(Math.floor(1000 + Math.random() * 9000));
  const result = await query(
    `INSERT INTO service_orders (order_number, client_id, service_id, status, intake_form_data)
     VALUES ($1, $2, $3, 'pending_payment', $4)
     RETURNING id, order_number, status, expected_delivery`,
    [orderNumber, clientId, serviceResult.rows[0].id, JSON.stringify(formData || {})]
  );

  await addActivity(clientId, 'order', 'DocStarted', { doc: templateName });

  const row = result.rows[0];
  return {
    id: row.order_number,
    templateId,
    templateName,
    status: 'Pending Payment',
    date: formatDate(),
    formData: formData || {}
  };
}

export async function getMatters(clientId) {
  const result = await query(
    `SELECT vm.id, vm.title, vm.description, vm.status, vm.lawyer_notes AS opinion,
            vm.completed_file AS attachment, vm.created_at AS date
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     WHERE vs.client_id = $1
     ORDER BY vm.created_at DESC`,
    [clientId]
  );
  return result.rows.map((row) => ({
    id: `m-${row.id}`,
    title: row.title,
    status: MATTER_STATUS_MAP[row.status] || row.status,
    date: new Date(row.date).toISOString().split('T')[0],
    description: row.description,
    ...(row.opinion ? { opinion: row.opinion } : {}),
    ...(row.attachment ? { attachment: row.attachment } : {})
  }));
}

export async function getMatterById(clientId, matterId) {
  const numericId = matterId.replace(/^m-/, '');
  const result = await query(
    `SELECT vm.id, vm.title, vm.description, vm.status, vm.lawyer_notes AS opinion,
            vm.completed_file AS attachment, vm.created_at AS date
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     WHERE vs.client_id = $1 AND vm.id = $2`,
    [clientId, numericId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: `m-${row.id}`,
    title: row.title,
    status: MATTER_STATUS_MAP[row.status] || row.status,
    date: new Date(row.date).toISOString().split('T')[0],
    description: row.description,
    opinion: row.opinion,
    attachment: row.attachment
  };
}

export async function createMatter(clientId, { title, description, files = [] }) {
  const sub = await query(
    `SELECT id FROM vlo_subscriptions WHERE client_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`,
    [clientId]
  );
  if (!sub.rows[0]) {
    throw new Error('No active VLO subscription found');
  }

  const fileName = files[0] || null;
  const result = await query(
    `INSERT INTO vlo_matters (subscription_id, title, description, file, status)
     VALUES ($1, $2, $3, $4, 'received')
     RETURNING id, title, description, status, created_at`,
    [sub.rows[0].id, title, description, fileName]
  );

  await query(
    `UPDATE vlo_subscriptions SET matters_submitted_this_month = matters_submitted_this_month + 1
     WHERE id = $1`,
    [sub.rows[0].id]
  );

  await addActivity(clientId, 'matter', 'UploadMatter', { title });

  const row = result.rows[0];
  return {
    id: `m-${row.id}`,
    title: row.title,
    status: 'Awaiting Counsel Vetting',
    date: new Date(row.created_at).toISOString().split('T')[0],
    description: row.description
  };
}

export async function getThreads(clientId) {
  const threadIds = await query(
    `SELECT DISTINCT thread_id FROM messages
     WHERE sender_id = $1 OR recipient_id = $1
     ORDER BY thread_id`,
    [clientId]
  );

  const threads = [];
  for (const { thread_id } of threadIds.rows) {
    const messages = await query(
      `SELECT m.id, m.content AS text, m.file, m.created_at, m.sender_id,
              su.role AS sender_role
       FROM messages m
       JOIN users su ON su.id = m.sender_id
       WHERE m.thread_id = $1
       ORDER BY m.created_at ASC`,
      [thread_id]
    );

    if (!messages.rows.length) continue;

    const lawyerMsg = messages.rows.find((m) => m.sender_role === 'lawyer');
    const lawyerProfile = lawyerMsg
      ? await query(
          `SELECT lp.full_name, lp.photo FROM lawyer_profiles lp WHERE lp.user_id = $1`,
          [lawyerMsg.sender_id]
        )
      : { rows: [] };

    const last = messages.rows[messages.rows.length - 1];
    threads.push({
      id: thread_id,
      lawyerName: lawyerProfile.rows[0]?.full_name || 'Assigned Advocate',
      lawyerImage: lawyerProfile.rows[0]?.photo || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=128',
      lastMessage: last.text || 'File Attachment',
      lastUpdated: formatTimeAgo(last.created_at),
      messages: messages.rows.map((m) => ({
        id: m.id,
        sender: m.sender_id === clientId ? 'user' : 'lawyer',
        text: m.text,
        timestamp: formatMessageTime(m.created_at),
        ...(m.file ? { attachments: [m.file] } : {})
      }))
    });
  }

  return threads;
}

export async function sendMessage(clientId, threadId, { text, attachments = [] }) {
  const threadMeta = await query(
    `SELECT sender_id, recipient_id FROM messages WHERE thread_id = $1 LIMIT 1`,
    [threadId]
  );
  if (!threadMeta.rows[0]) {
    throw new Error('Thread not found');
  }

  const { sender_id, recipient_id } = threadMeta.rows[0];
  const recipientId = sender_id === clientId ? recipient_id : sender_id;

  const result = await query(
    `INSERT INTO messages (sender_id, recipient_id, thread_id, content, file)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, content, created_at`,
    [clientId, recipientId, threadId, text || '', attachments[0] || null]
  );

  await addActivity(clientId, 'message', 'Message', { id: threadId.replace('t-', '') });

  const row = result.rows[0];
  return {
    id: row.id,
    sender: 'user',
    text: text || '',
    attachments,
    timestamp: formatMessageTime(row.created_at)
  };
}

export async function bookAppointment(clientId, { lawyerName, slot, mode }) {
  const lawyer = await query(
    `SELECT lp.id, lp.user_id FROM lawyer_profiles lp
     WHERE lp.full_name ILIKE $1 OR lp.full_name ILIKE $2
     LIMIT 1`,
    [lawyerName, `%${lawyerName.replace(/^Adv\.\s*/i, '')}%`]
  );

  if (!lawyer.rows[0]) {
    throw new Error('Lawyer not found');
  }

  const appointmentDate = slot?.split(' ')[0] || formatDate();
  const appointmentTime = '10:00:00';

  await query(
    `INSERT INTO appointments (client_id, lawyer_prof_id, appointment_date, appointment_time, mode, status)
     VALUES ($1, $2, $3, $4, $5, 'confirmed')`,
    [clientId, lawyer.rows[0].id, appointmentDate, appointmentTime, mode || 'online']
  );

  await query(
    `UPDATE vlo_subscriptions SET consultations_used_this_month = consultations_used_this_month + 1
     WHERE client_id = $1 AND status = 'active'`,
    [clientId]
  );

  await addActivity(clientId, 'booking', 'Booked', { name: lawyerName });
  return { success: true, lawyerName, slot, mode };
}

export async function getSubscription(clientId) {
  const result = await query(
    `SELECT vp.name AS "planName", vp.monthly_fee, vs.next_billing_date AS "nextBillingDate"
     FROM vlo_subscriptions vs
     JOIN vlo_plans vp ON vp.id = vs.plan_id
     WHERE vs.client_id = $1 AND vs.status = 'active'
     ORDER BY vs.id DESC LIMIT 1`,
    [clientId]
  );
  const row = result.rows[0];
  if (!row) return { planName: '', price: '', nextBillingDate: '' };
  return {
    planName: `${row.planName} Retainer Plan`,
    price: formatPrice(row.monthly_fee),
    nextBillingDate: row.nextBillingDate
  };
}

export async function cancelSubscription(clientId) {
  await query(
    `UPDATE vlo_subscriptions SET status = 'cancelled'
     WHERE client_id = $1 AND status = 'active'`,
    [clientId]
  );
  await addActivity(clientId, 'billing', 'Cancelled', {});
}

export async function getInvoices(clientId) {
  const result = await query(
    `SELECT invoice_number AS id, category, invoice_date AS date, amount
     FROM invoices WHERE client_id = $1 ORDER BY invoice_date DESC`,
    [clientId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    category: row.category,
    date: row.date,
    price: formatPrice(row.amount)
  }));
}

export async function submitEvaluation(clientId, { rating, comment, threadId }) {
  const threadMeta = await query(
    `SELECT sender_id, recipient_id FROM messages WHERE thread_id = $1 LIMIT 1`,
    [threadId]
  );
  if (!threadMeta.rows[0]) return { success: true, rating, comment, threadId };

  const { sender_id, recipient_id } = threadMeta.rows[0];
  const lawyerUserId = sender_id === clientId ? recipient_id : sender_id;

  const lawyer = await query('SELECT id FROM lawyer_profiles WHERE user_id = $1', [lawyerUserId]);
  if (lawyer.rows[0]) {
    await query(
      `INSERT INTO lawyer_reviews (lawyer_id, client_id, rating, review_text, is_approved)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [lawyer.rows[0].id, clientId, rating, comment || '']
    );
  }

  return { success: true, rating, comment, threadId };
}

export async function getLawyers(filters = {}) {
  let sql = `
    SELECT lp.id, lp.full_name AS name, lp.city, lp.practice_area AS "practiceArea",
           lp.language, lp.full_bio AS bio, lp.online_fee, lp.inperson_fee, lp.photo AS image,
           COALESCE(AVG(lr.rating), 5)::numeric(3,1) AS stars
    FROM lawyer_profiles lp
    INNER JOIN users u ON u.id = lp.user_id AND u.role = 'lawyer' AND u.is_active = TRUE
    LEFT JOIN lawyer_reviews lr ON lr.lawyer_id = lp.id AND lr.is_approved = TRUE
    WHERE lp.verification_stat = 'verified' AND lp.is_suspended = FALSE`;
  const params = [];

  if (filters.city) {
    params.push(filters.city);
    sql += ` AND LOWER(lp.city) = LOWER($${params.length})`;
  }
  if (filters.practice) {
    params.push(`%${filters.practice}%`);
    sql += ` AND LOWER(lp.practice_area) LIKE LOWER($${params.length})`;
  }
  if (filters.lang) {
    params.push(filters.lang);
    sql += ` AND LOWER(lp.language) = LOWER($${params.length})`;
  }

  sql += ' GROUP BY lp.id ORDER BY lp.membership_tier DESC, lp.id';

  const result = await query(sql, params);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    city: row.city,
    practiceArea: row.practiceArea || 'General practice',
    language: row.language || 'English',
    stars: Number(row.stars),
    bio: row.bio || '',
    onlineFee: formatPrice(row.online_fee),
    inPersonFee: formatPrice(row.inperson_fee),
    image: row.image || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=256'
  }));
}

export async function getWorkspace(clientId) {
  const [stats, notifications, activities, orders, matters, threads, subscription, invoices, lawyers] =
    await Promise.all([
      getStats(clientId),
      getNotifications(clientId),
      getActivities(clientId),
      getOrders(clientId),
      getMatters(clientId),
      getThreads(clientId),
      getSubscription(clientId),
      getInvoices(clientId),
      getLawyers()
    ]);

  return { stats, notifications, activities, orders, matters, threads, subscription, invoices, lawyers };
}

function formatDate() {
  return new Date().toISOString().split('T')[0];
}
