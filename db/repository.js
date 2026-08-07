import { query } from './index.js';

const DEMO_CLIENT_EMAIL = process.env.DEMO_CLIENT_EMAIL || 'client@nexuslexis.law';

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
  const ts = new Date(date).getTime();
  if (!Number.isFinite(ts)) return 'Just now';
  const diff = Date.now() - ts;
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
  const [orders, appointments, subscription, unread, matters] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM service_orders
       WHERE client_id = $1 AND status IN ('pending_payment', 'processing', 'in_progress')`,
      [clientId]
    ),
    query(
      `SELECT (
         (SELECT COUNT(*)::int FROM appointments
          WHERE client_id = $1 AND status IN ('pending', 'confirmed'))
         +
         (SELECT COUNT(*)::int FROM ca_appointments
          WHERE client_id = $1 AND status IN ('pending', 'confirmed'))
       ) AS count`,
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
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM vlo_matters vm
       JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
       WHERE vs.client_id = $1 AND vm.status NOT IN ('completed')`,
      [clientId]
    )
  ]);

  return {
    activeOrders: orders.rows[0]?.count || 0,
    activeMatters: matters.rows[0]?.count || 0,
    appointments: appointments.rows[0]?.count || 0,
    retainerTier: subscription.rows[0]?.plan_name || 'None',
    unreadMessages: unread.rows[0]?.count || 0
  };
}

export async function getNotifications(userId, audience = 'client') {
  const result = await query(
    `SELECT id, title, body AS text, link AS route, notification_type AS type, created_at AS "createdAt"
     FROM notifications
     WHERE user_id = $1 AND audience = $2 AND is_read = FALSE
     ORDER BY created_at DESC`,
    [userId, audience]
  );
  return result.rows;
}

export async function dismissNotification(userId, id, audience = 'client') {
  await query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 AND audience = $3',
    [id, userId, audience]
  );
}

export async function clearNotifications(userId, audience = 'client') {
  await query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND audience = $2 AND is_read = FALSE',
    [userId, audience]
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

function mapOrderRow(row) {
  return {
    id: row.order_number || String(row.id),
    orderNumber: row.order_number || String(row.id),
    templateId: row.templateId,
    templateName: row.templateName,
    categorySlug: row.categorySlug || null,
    categoryName: row.categoryName || null,
    status: ORDER_STATUS_MAP[row.status] || row.status,
    statusKey: row.status,
    date: row.expected_delivery ? new Date(row.expected_delivery).toISOString().split('T')[0] : formatDate(),
    expectedDelivery: row.expected_delivery,
    milestone: row.milestone || null,
    completedFile: row.completed_file || null,
    downloadUrl: row.completed_file ? `/api/v2/documents/${row.order_number}/download` : null,
    formData: row.formData || {},
  };
}

export async function getOrders(clientId) {
  const result = await query(
    `SELECT so.id, so.order_number, so.status, so.intake_form_data AS "formData",
            so.expected_delivery, so.completed_file, so.milestone,
            s.slug AS "templateId", s.name AS "templateName",
            sc.slug AS "categorySlug", sc.name AS "categoryName"
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     LEFT JOIN service_categories sc ON sc.id = s.category_id
     WHERE so.client_id = $1
     ORDER BY so.id DESC`,
    [clientId]
  );
  return result.rows.map(mapOrderRow);
}

function mapLibraryTemplateRow(row, { includeFile = false } = {}) {
  const hasFile = Boolean(row.template_content_base64 || row.template_file_name);
  const template = {
    id: row.service_id || row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || row.intake_schema?.category || row.category_description || '',
    price: Number(row.price),
    priceLabel: formatPrice(row.price),
    deliveryDays: row.delivery_days,
    intakeSchema: row.intake_schema || {},
    isActive: row.is_active !== false,
    hasTemplateFile: hasFile,
    templateFileName: row.template_file_name || null,
    templateMimeType: row.template_mime_type || null,
    sampleDownloadUrl: hasFile
      ? `/api/v2/library/templates/${row.slug}/sample`
      : null,
  };

  if (includeFile && row.template_content_base64) {
    template.templateContentBase64 = row.template_content_base64;
  }

  return template;
}

export async function getLibraryCatalog({ category, search, includeInactive = false } = {}) {
  let sql = `
    SELECT sc.id AS category_id, sc.name AS category_name, sc.slug AS category_slug,
           sc.description AS category_description, sc.icon AS category_icon,
           sc.display_order,
           s.id AS service_id, s.name, s.slug, s.price, s.delivery_days, s.intake_schema,
           s.description, s.is_active, s.template_file_name, s.template_mime_type,
           CASE WHEN s.template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file
    FROM service_categories sc
    LEFT JOIN services s ON s.category_id = sc.id
      ${includeInactive ? '' : 'AND s.is_active IS TRUE'}
    WHERE 1=1`;
  const params = [];

  if (category) {
    params.push(category);
    sql += ` AND sc.slug = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    sql += ` AND (
      LOWER(s.name) LIKE $${params.length}
      OR LOWER(COALESCE(s.slug, '')) LIKE $${params.length}
      OR LOWER(sc.name) LIKE $${params.length}
    )`;
  }

  sql += ' ORDER BY sc.display_order ASC, sc.name ASC, s.name ASC';

  const result = await query(sql, params);
  const categoriesMap = new Map();

  for (const row of result.rows) {
    if (!categoriesMap.has(row.category_slug)) {
      categoriesMap.set(row.category_slug, {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        description: row.category_description,
        icon: row.category_icon,
        displayOrder: row.display_order,
        templates: [],
      });
    }

    if (row.service_id) {
      categoriesMap.get(row.category_slug).templates.push(
        mapLibraryTemplateRow({
          ...row,
          template_content_base64: row.has_file ? '1' : null,
        })
      );
    }
  }

  return {
    categories: [...categoriesMap.values()],
    templateCount: [...categoriesMap.values()].reduce((sum, cat) => sum + cat.templates.length, 0),
  };
}

export async function getLibraryTemplate(slug, { includeInactive = false, includeFile = false } = {}) {
  const result = await query(
    `SELECT s.id, s.name, s.slug, s.price, s.delivery_days, s.intake_schema,
            s.description, s.is_active, s.template_file_name, s.template_mime_type,
            ${includeFile ? 's.template_content_base64,' : ''}
            sc.id AS category_id, sc.name AS category_name, sc.slug AS category_slug,
            sc.description AS category_description, sc.icon AS category_icon
     FROM services s
     JOIN service_categories sc ON sc.id = s.category_id
     WHERE s.slug = $1
       ${includeInactive ? '' : 'AND s.is_active IS TRUE'}`,
    [slug]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    ...mapLibraryTemplateRow(row, { includeFile }),
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      icon: row.category_icon,
    },
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `template-${Date.now()}`;
}

async function allocateUniqueServiceSlug(baseSlug, excludeId = null) {
  let candidate = baseSlug;
  for (let i = 0; i < 20; i += 1) {
    const result = await query(
      excludeId
        ? 'SELECT id FROM services WHERE slug = $1 AND id <> $2 LIMIT 1'
        : 'SELECT id FROM services WHERE slug = $1 LIMIT 1',
      excludeId ? [candidate, excludeId] : [candidate]
    );
    if (!result.rows[0]) return candidate;
    candidate = `${baseSlug}-${i + 2}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

export async function createLibraryCategory({ name, slug, description, icon, displayOrder }) {
  const categoryName = String(name || '').trim();
  if (!categoryName) throw new Error('Category name is required');

  let finalSlug = slugify(slug || categoryName);
  for (let i = 0; i < 20; i += 1) {
    const existing = await query('SELECT id FROM service_categories WHERE slug = $1 LIMIT 1', [finalSlug]);
    if (!existing.rows[0]) break;
    finalSlug = `${slugify(slug || categoryName)}-${i + 2}`;
  }

  const result = await query(
    `INSERT INTO service_categories (name, slug, description, icon, display_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       icon = EXCLUDED.icon,
       display_order = EXCLUDED.display_order
     RETURNING id, name, slug, description, icon, display_order`,
    [
      categoryName,
      finalSlug,
      description || null,
      icon || 'file-text',
      Number.isFinite(Number(displayOrder)) ? Number(displayOrder) : 99,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    displayOrder: row.display_order,
  };
}

export async function createLibraryTemplate({
  name,
  slug,
  categorySlug,
  categoryId,
  price,
  deliveryDays,
  description,
  intakeSchema,
  isActive = true,
  file,
}) {
  const templateName = String(name || '').trim();
  if (!templateName) throw new Error('Template name is required');

  let resolvedCategoryId = categoryId ? Number(categoryId) : null;
  if (!resolvedCategoryId && categorySlug) {
    const cat = await query('SELECT id FROM service_categories WHERE slug = $1', [categorySlug]);
    resolvedCategoryId = cat.rows[0]?.id || null;
  }
  if (!resolvedCategoryId) {
    const fallback = await query(
      `SELECT id FROM service_categories WHERE slug = 'document-services' LIMIT 1`
    );
    resolvedCategoryId = fallback.rows[0]?.id || null;
  }
  if (!resolvedCategoryId) {
    throw new Error('Category not found. Create a category first or pass categorySlug.');
  }

  const baseSlug = slugify(slug || templateName);
  const finalSlug = await allocateUniqueServiceSlug(baseSlug);
  const parsedPrice = Number(price);
  const parsedDays = Number(deliveryDays);

  const result = await query(
    `INSERT INTO services (
       category_id, name, slug, price, delivery_days, intake_schema,
       description, is_active, template_file_name, template_mime_type, template_content_base64
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
     RETURNING id, name, slug, price, delivery_days, intake_schema, description, is_active,
               template_file_name, template_mime_type,
               CASE WHEN template_content_base64 IS NOT NULL THEN TRUE ELSE FALSE END AS has_file`,
    [
      resolvedCategoryId,
      templateName,
      finalSlug,
      Number.isFinite(parsedPrice) ? parsedPrice : 0,
      Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7,
      JSON.stringify(intakeSchema || {
        summary: { type: 'textarea', label: 'Brief / instructions', required: true },
      }),
      description || null,
      isActive !== false,
      file?.fileName || null,
      file?.mimeType || null,
      file?.contentBase64 || null,
    ]
  );

  return mapLibraryTemplateRow({
    ...result.rows[0],
    service_id: result.rows[0].id,
    template_content_base64: result.rows[0].has_file ? '1' : null,
  });
}

export async function updateLibraryTemplate(idOrSlug, {
  name,
  slug,
  categorySlug,
  categoryId,
  price,
  deliveryDays,
  description,
  intakeSchema,
  isActive,
  file,
  clearFile = false,
}) {
  const existing = await query(
    `SELECT id, slug FROM services
     WHERE id::text = $1 OR slug = $1
     LIMIT 1`,
    [String(idOrSlug)]
  );
  const current = existing.rows[0];
  if (!current) return null;

  let resolvedCategoryId = categoryId ? Number(categoryId) : null;
  if (!resolvedCategoryId && categorySlug) {
    const cat = await query('SELECT id FROM service_categories WHERE slug = $1', [categorySlug]);
    resolvedCategoryId = cat.rows[0]?.id || null;
    if (!resolvedCategoryId) throw new Error('Category not found');
  }

  let nextSlug = current.slug;
  if (slug || name) {
    nextSlug = await allocateUniqueServiceSlug(slugify(slug || name), current.id);
  }

  const sets = [];
  const params = [];
  const push = (sqlPart, value) => {
    params.push(value);
    sets.push(`${sqlPart} = $${params.length}`);
  };

  if (name !== undefined) push('name', String(name).trim());
  if (slug || name) push('slug', nextSlug);
  if (resolvedCategoryId) push('category_id', resolvedCategoryId);
  if (price !== undefined) push('price', Number(price) || 0);
  if (deliveryDays !== undefined) push('delivery_days', Number(deliveryDays) || 7);
  if (description !== undefined) push('description', description || null);
  if (intakeSchema !== undefined) {
    params.push(JSON.stringify(intakeSchema || {}));
    sets.push(`intake_schema = $${params.length}::jsonb`);
  }
  if (isActive !== undefined) push('is_active', isActive !== false && isActive !== 'false');

  if (clearFile) {
    push('template_file_name', null);
    push('template_mime_type', null);
    push('template_content_base64', null);
  } else if (file?.contentBase64) {
    push('template_file_name', file.fileName || null);
    push('template_mime_type', file.mimeType || null);
    push('template_content_base64', file.contentBase64);
  }

  if (!sets.length) {
    return getLibraryTemplate(current.slug, { includeInactive: true });
  }

  params.push(current.id);
  await query(
    `UPDATE services SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params
  );

  const updated = await query('SELECT slug FROM services WHERE id = $1', [current.id]);
  return getLibraryTemplate(updated.rows[0].slug, { includeInactive: true });
}

export async function deactivateLibraryTemplate(idOrSlug) {
  return updateLibraryTemplate(idOrSlug, { isActive: false });
}

export async function getLibraryTemplateSample(slug) {
  const result = await query(
    `SELECT slug, template_file_name, template_mime_type, template_content_base64, is_active
     FROM services WHERE slug = $1`,
    [slug]
  );
  const row = result.rows[0];
  if (!row || !row.template_content_base64) return null;
  return {
    slug: row.slug,
    fileName: row.template_file_name || `${row.slug}.bin`,
    mimeType: row.template_mime_type || 'application/octet-stream',
    contentBase64: row.template_content_base64,
    isActive: row.is_active !== false,
  };
}

export async function getClientDocuments(clientId, { status } = {}) {
  let sql = `
    SELECT so.id, so.order_number, so.status, so.intake_form_data AS "formData",
           so.expected_delivery, so.completed_file, so.milestone,
           s.slug AS "templateId", s.name AS "templateName",
           sc.slug AS "categorySlug", sc.name AS "categoryName"
    FROM service_orders so
    JOIN services s ON s.id = so.service_id
    LEFT JOIN service_categories sc ON sc.id = s.category_id
    WHERE so.client_id = $1`;
  const params = [clientId];

  if (status === 'active') {
    sql += ` AND so.status IN ('pending_payment', 'processing', 'in_progress')`;
  } else if (status === 'completed') {
    sql += ` AND so.status = 'completed'`;
  }

  sql += ' ORDER BY so.id DESC';

  const result = await query(sql, params);
  const documents = result.rows.map((row) => ({
    ...mapOrderRow(row),
    createdAt: row.expected_delivery || null,
    hasDownload: Boolean(row.completed_file),
  }));

  return {
    documents,
    counts: {
      total: documents.length,
      active: documents.filter((d) => ['Pending Payment', 'Processing', 'In Progress'].includes(d.status)).length,
      completed: documents.filter((d) => d.status === 'Completed').length,
    },
  };
}

export async function getClientDocumentOrder(clientId, orderNumber) {
  const result = await query(
    `SELECT so.id, so.order_number, so.status, so.intake_form_data AS "formData",
            so.expected_delivery, so.completed_file, so.milestone,
            s.slug AS "templateId", s.name AS "templateName",
            sc.slug AS "categorySlug", sc.name AS "categoryName"
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     LEFT JOIN service_categories sc ON sc.id = s.category_id
     WHERE so.client_id = $1 AND so.order_number = $2`,
    [clientId, orderNumber]
  );

  return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
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

  await createNotification(clientId, {
    title: 'Document Order Submitted',
    body: `Your custom document request for "${templateName}" (Order #${orderNumber}) has been submitted and is pending payment.`,
    type: 'order',
    link: '/account/orders',
    audience: 'client',
  });

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

  const subInfo = await query(
    `SELECT vs.assigned_lawyer_id FROM vlo_subscriptions vs WHERE vs.id = $1`,
    [sub.rows[0].id]
  );
  const assignedLawyerUserId = subInfo.rows[0]?.assigned_lawyer_id;
  const clientName = await getUserDisplayName(clientId);

  await createNotification(clientId, {
    title: 'VLO Matter Submitted',
    body: `Your matter "${title}" has been submitted and is awaiting counsel review.`,
    type: 'vlo',
    link: '/account/vlo',
    audience: 'client',
  });

  if (assignedLawyerUserId) {
    await createNotification(assignedLawyerUserId, {
      title: 'New VLO Matter',
      body: `${clientName} submitted a new matter: "${title}".`,
      type: 'vlo',
      link: '/account/vlo',
      audience: 'lawyer',
    });
  }

  const row = result.rows[0];
  return {
    id: `m-${row.id}`,
    title: row.title,
    status: 'Awaiting Counsel Vetting',
    date: new Date(row.created_at).toISOString().split('T')[0],
    description: row.description
  };
}

async function userHasLawyerProfile(userId) {
  const result = await query(
    'SELECT id FROM lawyer_profiles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return Boolean(result.rows[0]);
}

async function userHasCaProfile(userId) {
  const result = await query(
    'SELECT id FROM ca_profiles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return Boolean(result.rows[0]);
}

function formatApptStatus(status) {
  const map = {
    pending: 'Pending',
    confirmed: 'Accepted',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
}

function formatApptDate(dateValue) {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function resolvePeerDisplay(peerUserId) {
  const userResult = await query(
    'SELECT id, username, role FROM users WHERE id = $1',
    [peerUserId]
  );
  const user = userResult.rows[0];
  if (!user) {
    return {
      peerId: peerUserId,
      peerName: 'User',
      peerImage: null,
      peerRole: 'client',
    };
  }

  const lawyer = await query(
    'SELECT full_name, photo FROM lawyer_profiles WHERE user_id = $1',
    [peerUserId]
  );
  if (lawyer.rows[0]) {
    return {
      peerId: peerUserId,
      peerName: lawyer.rows[0].full_name || user.username,
      peerImage: lawyer.rows[0].photo || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=128',
      peerRole: 'lawyer',
    };
  }

  const ca = await query(
    'SELECT full_name, photo FROM ca_profiles WHERE user_id = $1',
    [peerUserId]
  );
  if (ca.rows[0]) {
    return {
      peerId: peerUserId,
      peerName: ca.rows[0].full_name || user.username,
      peerImage: ca.rows[0].photo || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=128',
      peerRole: 'ca',
    };
  }

  const client = await query(
    'SELECT profile_photo FROM client_profiles WHERE user_id = $1',
    [peerUserId]
  );

  return {
    peerId: peerUserId,
    peerName: user.username,
    peerImage: client.rows[0]?.profile_photo || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=128',
    peerRole: user.role || 'client',
  };
}

function mapMessageSender(senderId, viewerUserId) {
  return Number(senderId) === Number(viewerUserId) ? 'user' : 'peer';
}

async function loadThreadMessages(threadId, viewerUserId) {
  const messages = await query(
    `SELECT m.id, m.content AS text, m.file, m.created_at, m.sender_id, m.recipient_id,
            m.is_read, su.role AS sender_role
     FROM messages m
     JOIN users su ON su.id = m.sender_id
     WHERE m.thread_id = $1
     ORDER BY m.created_at ASC`,
    [threadId]
  );

  return messages.rows.map((m) => ({
    id: m.id,
    sender: mapMessageSender(m.sender_id, viewerUserId),
    senderId: m.sender_id,
    text: m.text,
    timestamp: formatMessageTime(m.created_at),
    createdAt: m.created_at,
    isRead: m.is_read,
    isMine: Number(m.sender_id) === Number(viewerUserId),
    ...(m.file ? { attachments: [m.file] } : {}),
  }));
}

async function buildThreadSummary(userId, threadId) {
  const access = await assertThreadAccess(userId, threadId);
  if (!access) return null;

  const messages = await loadThreadMessages(threadId, userId);
  if (!messages.length) return null;

  const peer = await resolvePeerDisplay(access.peerUserId);
  const last = messages[messages.length - 1];
  const unread = await query(
    `SELECT COUNT(*)::int AS count FROM messages
     WHERE thread_id = $1 AND recipient_id = $2 AND is_read = FALSE`,
    [threadId, userId]
  );

  return {
    id: threadId,
    peerId: peer.peerId,
    peerName: peer.peerName,
    peerRole: peer.peerRole,
    peerImage: peer.peerImage,
    lawyerName: peer.peerRole === 'lawyer' ? peer.peerName : undefined,
    lawyerImage: peer.peerRole === 'lawyer' ? peer.peerImage : undefined,
    clientName: peer.peerRole === 'client' ? peer.peerName : undefined,
    clientImage: peer.peerRole === 'client' ? peer.peerImage : undefined,
    lastMessage: last.text || 'File attachment',
    lastUpdated: formatTimeAgo(last.createdAt || last.created_at),
    unreadCount: unread.rows[0]?.count || 0,
    messages,
  };
}

export async function assertThreadAccess(userId, threadId) {
  const result = await query(
    `SELECT sender_id, recipient_id FROM messages
     WHERE thread_id = $1
       AND (sender_id = $2 OR recipient_id = $2)
     LIMIT 1`,
    [threadId, userId]
  );

  if (!result.rows[0]) return null;

  const { sender_id, recipient_id } = result.rows[0];
  const peerUserId = sender_id === userId ? recipient_id : sender_id;
  return { peerUserId, senderId: sender_id, recipientId: recipient_id };
}

export async function getUnreadMessageCount(userId) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM messages
     WHERE recipient_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}

export async function getThreads(userId) {
  const threadIds = await query(
    `SELECT thread_id, MAX(created_at) AS last_at
     FROM messages
     WHERE sender_id = $1 OR recipient_id = $1
     GROUP BY thread_id
     ORDER BY last_at DESC`,
    [userId]
  );

  const threads = [];
  for (const { thread_id } of threadIds.rows) {
    const summary = await buildThreadSummary(userId, thread_id);
    if (summary) threads.push(summary);
  }

  return threads;
}

export async function getThread(userId, threadId) {
  const summary = await buildThreadSummary(userId, threadId);
  if (!summary) {
    throw new Error('Thread not found');
  }
  return summary;
}

export async function markThreadAsRead(userId, threadId) {
  const access = await assertThreadAccess(userId, threadId);
  if (!access) {
    throw new Error('Thread not found');
  }

  const result = await query(
    `UPDATE messages
     SET is_read = TRUE
     WHERE thread_id = $1 AND recipient_id = $2 AND is_read = FALSE
     RETURNING id`,
    [threadId, userId]
  );

  return { threadId, markedRead: result.rowCount };
}

export async function sendMessage(senderUserId, threadId, { text, attachments = [], recipientUserId = null, notify = true }) {
  const access = await assertThreadAccess(senderUserId, threadId);
  if (!access && !recipientUserId) {
    throw new Error('Thread not found');
  }

  let recipientId = recipientUserId || access?.peerUserId;

  if (!recipientId) {
    const threadMeta = await query(
      `SELECT sender_id, recipient_id FROM messages WHERE thread_id = $1 LIMIT 1`,
      [threadId]
    );
    if (!threadMeta.rows[0]) {
      throw new Error('Thread not found');
    }
    const { sender_id, recipient_id } = threadMeta.rows[0];
    recipientId = sender_id === senderUserId ? recipient_id : sender_id;
  }

  const senderResult = await query(
    'SELECT id, username, role FROM users WHERE id = $1',
    [senderUserId]
  );
  const sender = senderResult.rows[0];
  if (!sender) {
    throw new Error('Sender not found');
  }

  const result = await query(
    `INSERT INTO messages (sender_id, recipient_id, thread_id, content, file)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, content, created_at`,
    [senderUserId, recipientId, threadId, text || '', attachments[0] || null]
  );

  if (sender.role === 'client') {
    await addActivity(senderUserId, 'message', 'Message', { id: threadId.replace('t-', '') });
  }

  const senderName = await getUserDisplayName(senderUserId);
  const isLawyerSender = await userHasLawyerProfile(senderUserId);
  const isCaSender = await userHasCaProfile(senderUserId);
  const isProfessionalSender = isLawyerSender || isCaSender;

  if (notify) {
    let title = 'New Message';
    let audience = 'client';
    if (isProfessionalSender) {
      title = 'New Message from Your Advisor';
      audience = 'client';
    } else if (await userHasLawyerProfile(recipientId)) {
      title = 'New Client Message';
      audience = 'lawyer';
    } else if (await userHasCaProfile(recipientId)) {
      title = 'New Client Message';
      audience = 'ca';
    }

    await createNotification(recipientId, {
      title,
      body: `${senderName} sent you a message: "${messagePreview(text)}"`,
      type: 'message',
      link: `/account/messages?thread=${encodeURIComponent(threadId)}`,
      audience,
    });
  }

  const row = result.rows[0];
  return {
    id: row.id,
    threadId,
    sender: isProfessionalSender ? 'lawyer' : 'user',
    senderId: senderUserId,
    recipientId,
    text: text || '',
    attachments,
    timestamp: formatMessageTime(row.created_at),
  };
}

function parseSlotTime(slot) {
  if (!slot) return '10:00:00';
  const match = String(slot).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '10:00:00';
  let hours = parseInt(match[1], 10);
  const mins = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${mins}:00`;
}

export async function bookAppointment(clientId, { lawyerName, lawyerProfileId, slot, mode, intake }) {
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
      [lawyerName, `%${lawyerName.replace(/^Adv\.\s*/i, '')}%`]
    );
    lawyerRow = byName.rows[0] || null;
  }

  if (!lawyerRow) {
    throw new Error('Lawyer not found');
  }

  if (Number(clientId) === Number(lawyerRow.user_id)) {
    throw new Error('You cannot book a consultation with yourself');
  }

  const appointmentDate = formatDate();
  const appointmentTime = parseSlotTime(slot);

  const dbMode = mode === 'inperson' ? 'inperson' : 'online';
  const clientNotes = intake?.trim() || null;
  const insert = await query(
    `INSERT INTO appointments (client_id, lawyer_prof_id, appointment_date, appointment_time, mode, status, client_notes)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id, appointment_date, appointment_time, mode, status`,
    [clientId, lawyerRow.id, appointmentDate, appointmentTime, dbMode, clientNotes]
  );

  await query(
    `UPDATE vlo_subscriptions SET consultations_used_this_month = consultations_used_this_month + 1
     WHERE client_id = $1 AND status = 'active'`,
    [clientId]
  );

  await addActivity(clientId, 'booking', 'Booked', { name: lawyerRow.full_name });

  const clientName = await getUserDisplayName(clientId);
  const slotLabel = slot || `${appointmentDate} at ${appointmentTime.slice(0, 5)}`;
  const modeLabel = dbMode === 'online' ? 'online' : 'in-person';
  const intakeNote = intake?.trim() ? ` Note: "${messagePreview(intake, 80)}"` : '';

  await createNotification(clientId, {
    title: 'Consultation Booked',
    body: `Your ${modeLabel} consultation with ${lawyerRow.full_name} is requested for ${slotLabel}.`,
    type: 'appointment',
    link: '/account/appointments',
    audience: 'client',
  });

  await createNotification(lawyerRow.user_id, {
    title: 'New Consultation Request',
    body: `${clientName} requested a ${modeLabel} consultation for ${slotLabel}.${intakeNote}`,
    type: 'appointment',
    link: '/account/appointments',
    audience: 'lawyer',
  });

  const row = insert.rows[0];
  return {
    success: true,
    appointmentId: row.id,
    lawyerName: lawyerRow.full_name,
    lawyerProfileId: lawyerRow.id,
    slot: slotLabel,
    mode: dbMode,
    status: row.status,
    date: row.appointment_date,
    time: row.appointment_time
  };
}

export async function bookCaAppointment(clientId, { caProfileId, caName, slot, mode, intake, clientCity }) {
  let caRow = null;

  if (caProfileId) {
    const byId = await query(
      `SELECT cp.id, cp.user_id, cp.full_name
       FROM ca_profiles cp
       INNER JOIN users u ON u.id = cp.user_id AND u.is_active = TRUE
       WHERE cp.id = $1 AND COALESCE(cp.is_suspended, FALSE) = FALSE`,
      [Number(caProfileId)]
    );
    caRow = byId.rows[0] || null;
  }

  if (!caRow && caName) {
    const byName = await query(
      `SELECT cp.id, cp.user_id, cp.full_name
       FROM ca_profiles cp
       INNER JOIN users u ON u.id = cp.user_id AND u.is_active = TRUE
       WHERE cp.full_name ILIKE $1
       LIMIT 1`,
      [`%${caName}%`]
    );
    caRow = byName.rows[0] || null;
  }

  if (!caRow) {
    throw new Error('Chartered accountant not found');
  }

  if (Number(clientId) === Number(caRow.user_id)) {
    throw new Error('You cannot book a consultation with yourself');
  }

  const appointmentDate = formatDate();
  const appointmentTime = parseSlotTime(slot);
  const dbMode = mode === 'inperson' ? 'inperson' : 'online';
  const topicParts = [];
  if (clientCity?.trim()) topicParts.push(`City: ${clientCity.trim()}`);
  if (intake?.trim()) topicParts.push(intake.trim());
  const topic = topicParts.join('\n\n') || null;

  const insert = await query(
    `INSERT INTO ca_appointments (client_id, ca_prof_id, appointment_date, appointment_time, mode, status, topic)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id, appointment_date, appointment_time, mode, status`,
    [clientId, caRow.id, appointmentDate, appointmentTime, dbMode, topic]
  );

  await addActivity(clientId, 'booking', 'Booked', { name: caRow.full_name });

  const clientName = await getUserDisplayName(clientId);
  const slotLabel = slot || `${appointmentDate} at ${appointmentTime.slice(0, 5)}`;
  const modeLabel = dbMode === 'online' ? 'online' : 'in-person';
  const intakeNote = intake?.trim() ? ` Note: "${messagePreview(intake, 80)}"` : '';

  await createNotification(clientId, {
    title: 'Consultation Booked',
    body: `Your ${modeLabel} consultation with ${caRow.full_name} is requested for ${slotLabel}.`,
    type: 'appointment',
    link: '/account/appointments',
    audience: 'client',
  });

  await createNotification(caRow.user_id, {
    title: 'New Consultation Request',
    body: `${clientName} requested a ${modeLabel} consultation for ${slotLabel}.${intakeNote}`,
    type: 'appointment',
    link: '/account/appointments',
    audience: 'ca',
  });

  const row = insert.rows[0];
  return {
    success: true,
    appointmentId: row.id,
    professionalName: caRow.full_name,
    caProfileId: caRow.id,
    professionalRole: 'CA',
    slot: slotLabel,
    mode: dbMode,
    status: row.status,
    date: row.appointment_date,
    time: row.appointment_time,
  };
}

export async function getClientAppointments(clientId) {
  const [lawyerRows, caRows] = await Promise.all([
    query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.mode, a.status, a.client_notes AS notes,
              lp.full_name AS professional_name, lp.id AS professional_profile_id, 'Lawyer' AS professional_role
       FROM appointments a
       JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
       WHERE a.client_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [clientId]
    ),
    query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.mode, a.status, a.topic AS notes,
              cp.full_name AS professional_name, cp.id AS professional_profile_id, 'CA' AS professional_role
       FROM ca_appointments a
       JOIN ca_profiles cp ON cp.id = a.ca_prof_id
       WHERE a.client_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [clientId]
    ),
  ]);

  const mapRow = (row) => ({
    id: row.id,
    professionalName: row.professional_name,
    professionalRole: row.professional_role,
    professionalProfileId: row.professional_profile_id,
    date: formatApptDate(row.appointment_date),
    time: row.appointment_time?.slice?.(0, 5) || row.appointment_time,
    mode: row.mode === 'online' ? 'Online' : 'In-Person',
    status: formatApptStatus(row.status),
    caseDescription: row.notes || '',
    clientCity: (row.notes || '').match(/^City:\s*(.+)$/m)?.[1]?.trim() || '',
  });

  return {
    appointments: [
      ...lawyerRows.rows.map(mapRow),
      ...caRows.rows.map(mapRow),
    ].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
  };
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

  await createNotification(clientId, {
    title: 'Subscription Cancelled',
    body: 'Your VLO retainer subscription has been cancelled. You can re-subscribe anytime from the subscriptions page.',
    type: 'billing',
    link: '/account/subscriptions',
    audience: 'client',
  });
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

    const clientName = await getUserDisplayName(clientId);
    await createNotification(lawyerUserId, {
      title: 'New Client Review',
      body: `${clientName} submitted a ${rating}-star review for your services.`,
      type: 'review',
      link: '/account/profile',
      audience: 'lawyer',
    });
  }

  return { success: true, rating, comment, threadId };
}

export async function getLawyers(filters = {}) {
  let sql = `
    SELECT lp.id, lp.user_id, lp.full_name AS name, lp.city, lp.practice_area AS "practiceArea",
           lp.language, lp.languages, lp.practice_areas AS "practiceAreas",
           COALESCE(NULLIF(lp.full_bio, ''), lp.short_bio, '') AS bio,
           lp.online_fee, lp.inperson_fee, lp.verification_stat,
           COALESCE(NULLIF(lp.photo, ''), lp.documents->>'profilePhoto', '') AS image,
           COALESCE(AVG(lr.rating), 5)::numeric(3,1) AS stars
    FROM lawyer_profiles lp
    INNER JOIN users u ON u.id = lp.user_id AND u.is_active = TRUE
    LEFT JOIN lawyer_reviews lr ON lr.lawyer_id = lp.id AND lr.is_approved = TRUE
    WHERE COALESCE(lp.is_suspended, FALSE) = FALSE`;
  const params = [];

  if (filters.verifiedOnly) {
    sql += ` AND lp.verification_stat = 'verified'`;
  } else {
    sql += ` AND COALESCE(lp.verification_stat, 'pending') IN ('verified', 'pending')`;
  }

  if (filters.city) {
    params.push(filters.city);
    sql += ` AND LOWER(lp.city) = LOWER($${params.length})`;
  }
  if (filters.practice) {
    params.push(`%${filters.practice}%`);
    sql += ` AND (
      LOWER(COALESCE(lp.practice_area, '')) LIKE LOWER($${params.length})
      OR LOWER(COALESCE(lp.practice_areas, '')) LIKE LOWER($${params.length})
    )`;
  }
  if (filters.lang) {
    params.push(filters.lang);
    sql += ` AND (
      LOWER(COALESCE(lp.language, '')) = LOWER($${params.length})
      OR LOWER(COALESCE(lp.languages, '')) LIKE LOWER('%' || $${params.length} || '%')
    )`;
  }

  sql += ' GROUP BY lp.id ORDER BY lp.membership_tier DESC NULLS LAST, lp.id';

  const result = await query(sql, params);
  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    city: row.city || 'Pakistan',
    practiceArea: row.practiceArea || 'General practice',
    practiceAreas: row.practiceAreas || '',
    language: row.language || row.languages?.split?.(',')?.[0]?.trim() || 'English',
    languages: row.languages || row.language || 'English',
    stars: Number(row.stars),
    bio: row.bio || '',
    onlineFee: formatPrice(row.online_fee),
    inPersonFee: formatPrice(row.inperson_fee),
    image: row.image || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=256',
    verificationStatus: row.verification_stat === 'verified' ? 'Verified' : 'Pending',
    availableSlots: ['10:00 AM', '11:30 AM', '2:00 PM', '4:00 PM'],
  }));
}

export async function getCas(filters = {}) {
  let sql = `
    SELECT cp.id, cp.user_id, cp.full_name AS name, cp.city, cp.qualification,
           cp.service_areas AS "serviceAreas",
           COALESCE(NULLIF(cp.full_bio, ''), cp.short_bio, '') AS bio,
           cp.online_fee, cp.inperson_fee, cp.fees, cp.verification_stat,
           COALESCE(NULLIF(cp.photo, ''), cp.documents->>'profilePhoto', '') AS image
    FROM ca_profiles cp
    INNER JOIN users u ON u.id = cp.user_id AND u.is_active = TRUE
    WHERE COALESCE(cp.is_suspended, FALSE) = FALSE`;
  const params = [];

  if (filters.verifiedOnly) {
    sql += ` AND cp.verification_stat = 'verified'`;
  } else {
    sql += ` AND COALESCE(cp.verification_stat, 'pending') IN ('verified', 'pending')`;
  }

  if (filters.city) {
    params.push(filters.city);
    sql += ` AND LOWER(cp.city) = LOWER($${params.length})`;
  }
  if (filters.practice) {
    params.push(`%${filters.practice}%`);
    sql += ` AND LOWER(COALESCE(cp.service_areas, '')) LIKE LOWER($${params.length})`;
  }

  sql += ' ORDER BY cp.membership_tier DESC NULLS LAST, cp.id';

  const result = await query(sql, params);
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    name: row.name,
    city: row.city || 'Pakistan',
    qualification: row.qualification || 'Chartered Accountant',
    serviceAreas: row.serviceAreas || '',
    bio: row.bio || '',
    onlineFee: formatPrice(row.online_fee || row.fees),
    inPersonFee: formatPrice(row.inperson_fee),
    image: row.image || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=256',
    verificationStatus: row.verification_stat === 'verified' ? 'Verified' : 'Pending',
    role: 'CA',
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

async function getUserDisplayName(userId) {
  const result = await query(
    'SELECT username FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.username || 'Client';
}

export async function createNotification(userId, { title, body, type = 'general', link = '/account', audience = 'client' }) {
  if (!userId || !body?.trim()) return null;

  const result = await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, body AS text, link AS route, audience`,
    [userId, title || 'NexusLexis Update', body.trim(), type, link, audience]
  );
  return result.rows[0] || null;
}

function messagePreview(text, maxLen = 100) {
  const trimmed = (text || '').trim();
  if (!trimmed) return 'Sent an attachment';
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

async function findThreadBetween(userIdA, userIdB) {
  const result = await query(
    `SELECT thread_id FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2)
        OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [userIdA, userIdB]
  );
  return result.rows[0]?.thread_id || null;
}

export async function startMessageThread(clientId, { lawyerProfileId, lawyerUserId, text, attachments = [] }) {
  let recipientUserId = lawyerUserId;

  if (lawyerProfileId) {
    const lawyer = await query(
      'SELECT user_id, full_name FROM lawyer_profiles WHERE id = $1',
      [lawyerProfileId]
    );
    if (!lawyer.rows[0]) throw new Error('Lawyer not found');
    recipientUserId = lawyer.rows[0].user_id;
  }

  if (!recipientUserId) {
    throw new Error('lawyerProfileId or lawyerUserId is required');
  }

  if (Number(recipientUserId) === Number(clientId)) {
    throw new Error('Cannot start a conversation with yourself');
  }

  const recipient = await query(
    'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
    [recipientUserId]
  );
  if (!recipient.rows[0] || !(await userHasLawyerProfile(recipientUserId))) {
    throw new Error('Lawyer not found');
  }

  if (!text?.trim() && attachments.length === 0) {
    throw new Error('Message text or attachments required');
  }

  const existingThreadId = await findThreadBetween(clientId, recipientUserId);
  const threadId = existingThreadId || `t-${clientId}-${recipientUserId}-${Date.now()}`;

  const message = await sendMessage(clientId, threadId, { text, attachments, recipientUserId });
  return { ...message, threadId, created: !existingThreadId };
}

export async function sendLawyerToClientMessage(lawyerUserId, clientUserId, text) {
  return sendProfessionalToClientMessage(lawyerUserId, clientUserId, text);
}

export async function sendProfessionalToClientMessage(professionalUserId, clientUserId, text) {
  if (!professionalUserId || !clientUserId || !text?.trim()) {
    throw new Error('Professional, client, and message text are required');
  }
  if (Number(professionalUserId) === Number(clientUserId)) {
    throw new Error('Cannot message yourself');
  }

  const isLawyer = await userHasLawyerProfile(professionalUserId);
  const isCa = await userHasCaProfile(professionalUserId);
  if (!isLawyer && !isCa) {
    throw new Error('Professional not found');
  }

  const existingThreadId = await findThreadBetween(professionalUserId, clientUserId);
  const threadId = existingThreadId || `t-${clientUserId}-${professionalUserId}-${Date.now()}`;

  return sendMessage(professionalUserId, threadId, {
    text: text.trim(),
    recipientUserId: clientUserId,
    notify: true,
  });
}
