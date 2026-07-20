import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query } from './index.js';
import { createNotification, getUnreadMessageCount, sendProfessionalToClientMessage } from './repository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STORE_FILE = join(DATA_DIR, 'professional-store.json');

function loadStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STORE_FILE)) {
    const initial = { lawyerCases: {}, lawyerTeams: {}, caTaxProfiles: {}, caDocuments: {}, caRetainers: {} };
    writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(readFileSync(STORE_FILE, 'utf-8'));
}

function saveStore(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function tierLabel(tier) {
  if (!tier) return 'Basic';
  return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
}

function apptStatusLabel(status) {
  const map = {
    pending: 'Pending',
    confirmed: 'Accepted',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };
  return map[status] || status;
}

function apptStatusToDb(status) {
  const map = {
    Pending: 'pending',
    Accepted: 'confirmed',
    Declined: 'cancelled',
    Cancelled: 'cancelled',
    Completed: 'completed'
  };
  return map[status] || status?.toLowerCase();
}

export async function getUserById(userId) {
  const result = await query(
    'SELECT id, username, email, role, phone FROM users WHERE id = $1 AND is_active = TRUE',
    [userId]
  );
  return result.rows[0] || null;
}

export async function getLawyerProfileByUserId(userId) {
  const result = await query(
    `SELECT lp.*, u.username, u.email
     FROM lawyer_profiles lp
     JOIN users u ON u.id = lp.user_id
     WHERE lp.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function ensureLawyerProfile(userId) {
  let profile = await getLawyerProfileByUserId(userId);
  if (profile) return profile;

  const user = await getUserById(userId);
  if (!user) return null;

  const result = await query(
    `INSERT INTO lawyer_profiles (
      user_id, full_name, cnic, bar_council_name, bar_council_num, verification_stat,
      membership_tier, city, practice_area, language, short_bio, full_bio,
      online_fee, inperson_fee, monthly_enquiry, monthly_lex_ai
    ) VALUES ($1, $2, '35201-0000000-0', 'Punjab Bar Council', 'PBC-PENDING', 'verified',
      'gold', 'Lahore', 'Corporate Law', 'English', 'Legal professional on NexusLexis.',
      'Experienced advocate serving clients through the NexusLexis platform.',
      2500, 4000, 0, 0)
    RETURNING *`,
    [userId, user.username]
  );
  return result.rows[0];
}

export async function getCaProfileByUserId(userId) {
  const result = await query(
    `SELECT cp.*, u.username, u.email
     FROM ca_profiles cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function ensureCaProfile(userId) {
  let profile = await getCaProfileByUserId(userId);
  if (profile) return profile;

  const user = await getUserById(userId);
  if (!user) return null;

  const result = await query(
    `INSERT INTO ca_profiles (
      user_id, full_name, cnic, qualification, city, fees, verification_stat,
      membership_tier, icap_membership_no, short_bio, full_bio, online_fee, inperson_fee, monthly_leads
    ) VALUES ($1, $2, '35202-0000000-0', 'FCA', 'Karachi', 5000, 'verified',
      'gold', 'ICAP-PENDING', 'Chartered accountant on NexusLexis.',
      'Experienced CA serving clients through the NexusLexis platform.',
      4000, 6000, 0)
    RETURNING *`,
    [userId, user.username]
  );
  return result.rows[0];
}

export async function getLawyerDashboard(userId) {
  const profile = await ensureLawyerProfile(userId);
  if (!profile) return null;

  const [appts, orders, notifs, unreadMessages, todayAppts, pendingAppts] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count FROM appointments
       WHERE lawyer_prof_id = $1 AND status IN ('pending', 'confirmed')`,
      [profile.id]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM service_orders
       WHERE assigned_prof_id = $1 AND status IN ('processing', 'in_progress')`,
      [userId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1 AND audience = 'lawyer' AND is_read = FALSE`,
      [userId]
    ),
    getUnreadMessageCount(userId),
    query(
      `SELECT COUNT(*)::int AS count FROM appointments
       WHERE lawyer_prof_id = $1 AND appointment_date = CURRENT_DATE
       AND status IN ('pending', 'confirmed')`,
      [profile.id]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM appointments
       WHERE lawyer_prof_id = $1 AND status = 'pending'`,
      [profile.id]
    )
  ]);

  const lexLimit = profile.membership_tier === 'premium' ? 50 : profile.membership_tier === 'gold' ? 25 : 10;
  const lexUsed = profile.monthly_lex_ai || 0;

  return {
    stats: {
      profileViews: profile.monthly_enquiry || 0,
      newEnquiries: pendingAppts.rows[0]?.count || 0,
      upcomingAppointments: appts.rows[0]?.count || 0,
      scheduledToday: todayAppts.rows[0]?.count || 0,
      lexSearchesRemaining: Math.max(0, lexLimit - lexUsed),
      enquiriesUsed: profile.monthly_enquiry || 0
    },
    pendingOrders: orders.rows[0]?.count || 0,
    unreadNotifications: notifs.rows[0]?.count || 0,
    unreadMessages: typeof unreadMessages === 'number' ? unreadMessages : 0
  };
}

export async function getLawyerSubscription(userId) {
  const profile = await ensureLawyerProfile(userId);
  const tier = tierLabel(profile?.membership_tier || 'basic');
  const sub = await query(
    `SELECT tier, status, monthly_fee, next_billing FROM lawyer_subscriptions
     WHERE lawyer_id = $1 ORDER BY id DESC LIMIT 1`,
    [profile?.id]
  ).then((r) => r.rows[0]);

  return {
    tier,
    subscriptionTier: tier,
    status: sub?.status || 'active',
    monthlyFee: sub?.monthly_fee || 0,
    nextBilling: sub?.next_billing || null
  };
}

export async function getLawyerNotifications(userId) {
  const result = await query(
    `SELECT id, title, body AS text, link AS route, notification_type AS type, created_at AS createdAt
     FROM notifications
     WHERE user_id = $1 AND audience = 'lawyer' AND is_read = FALSE
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );
  return { notifications: result.rows };
}

export async function getLawyerAppointments(userId) {
  const profile = await getLawyerProfileByUserId(userId);
  if (!profile) {
    return { appointments: [] };
  }

  const result = await query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.mode, a.status, a.meeting_link,
            a.client_notes, u.username AS client_name, u.email AS client_email, u.phone AS client_phone
     FROM appointments a
     JOIN users u ON u.id = a.client_id
     WHERE a.lawyer_prof_id = $1
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [profile.id]
  );

  return {
    appointments: result.rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      clientPhone: row.client_phone,
      date: row.appointment_date,
      dateLabel: new Date(row.appointment_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }),
      time: row.appointment_time?.slice?.(0, 5) || row.appointment_time,
      slot: row.appointment_time?.slice?.(0, 5) || row.appointment_time,
      mode: row.mode === 'online' ? 'Online' : 'In-Person',
      consultationMode: row.mode === 'online' ? 'Online' : 'In-Person',
      status: apptStatusLabel(row.status),
      meetingLink: row.meeting_link,
      notes: row.client_notes || ''
    }))
  };
}

export async function updateLawyerAppointment(userId, appointmentId, status) {
  const profile = await ensureLawyerProfile(userId);
  const dbStatus = apptStatusToDb(status);
  const appt = await query(
    `SELECT a.client_id, a.appointment_date, a.appointment_time, a.mode, lp.full_name AS lawyer_name
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     WHERE a.id = $1 AND a.lawyer_prof_id = $2`,
    [appointmentId, profile.id]
  );

  if (!appt.rows[0]) {
    throw new Error('Appointment not found');
  }

  await query(
    `UPDATE appointments SET status = $1
     WHERE id = $2 AND lawyer_prof_id = $3`,
    [dbStatus, appointmentId, profile.id]
  );

  const statusLabel = apptStatusLabel(dbStatus);
  const slotLabel = `${appt.rows[0].appointment_date} at ${String(appt.rows[0].appointment_time).slice(0, 5)}`;
  const modeLabel = appt.rows[0].mode === 'online' ? 'online' : 'in-person';
  const lawyerName = appt.rows[0].lawyer_name || 'Your lawyer';

  let title = 'Appointment Update';
  let body = `Your consultation on ${slotLabel} is now ${statusLabel}.`;

  if (status === 'Accepted' || dbStatus === 'confirmed') {
    title = 'Consultation Accepted';
    body = `${lawyerName} accepted your ${modeLabel} consultation for ${slotLabel}.`;
  } else if (status === 'Declined' || (dbStatus === 'cancelled' && status === 'Declined')) {
    title = 'Consultation Declined';
    body = `${lawyerName} declined your ${modeLabel} consultation for ${slotLabel}.`;
  } else if (status === 'Cancelled') {
    title = 'Consultation Cancelled';
    body = `${lawyerName} cancelled your ${modeLabel} consultation for ${slotLabel}.`;
  }

  await createNotification(appt.rows[0].client_id, {
    title,
    body,
    type: 'appointment',
    link: '/account/messages',
    audience: 'client',
  });

  if (status === 'Accepted' || dbStatus === 'confirmed') {
    const clientId = appt.rows[0].client_id;
    if (Number(userId) !== Number(clientId)) {
      const confirmationText =
        `Your ${modeLabel} consultation on ${slotLabel} is confirmed. ` +
        'Reply here if you have any questions before we meet.';
      try {
        await sendProfessionalToClientMessage(userId, clientId, confirmationText);
      } catch (err) {
        console.error('[appointments] confirmation message failed:', err.message);
      }
    }
  }

  return { success: true, status: statusLabel };
}

export async function getLawyerOrders(userId) {
  const result = await query(
    `SELECT so.id, so.order_number, so.status, so.intake_form_data, so.expected_delivery,
            s.name AS service_name, u.username AS client_name
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     JOIN users u ON u.id = so.client_id
     WHERE so.assigned_prof_id = $1
     ORDER BY so.expected_delivery DESC`,
    [userId]
  );

  return {
    orders: result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      clientName: row.client_name,
      serviceName: row.service_name,
      templateName: row.service_name,
      status: row.status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      deadline: row.expected_delivery,
      intakeForm: row.intake_form_data,
      formData: row.intake_form_data
    }))
  };
}

export async function getLawyerProfile(userId) {
  const profile = await ensureLawyerProfile(userId);
  return {
    profile: {
      fullName: profile.full_name,
      name: profile.full_name,
      photoUrl: profile.photo,
      avatarUrl: profile.photo,
      city: profile.city,
      shortBio: profile.short_bio,
      fullBio: profile.full_bio,
      bio: profile.full_bio,
      officeAddress: profile.office_address || '',
      barCouncilName: profile.bar_council_name,
      barCouncilNumber: profile.bar_council_num,
      barNumber: profile.bar_council_num,
      practiceAreas: profile.practice_area ? [profile.practice_area] : [],
      languages: profile.language ? [profile.language] : ['English'],
      onlineFee: Number(profile.online_fee),
      inPersonFee: Number(profile.inperson_fee),
      consultationFeeOnline: Number(profile.online_fee),
      consultationFeeInPerson: Number(profile.inperson_fee),
      consultationModes: ['Online', 'In-Person'],
      verificationStatus: profile.verification_stat === 'verified' ? 'Approved' : 'Pending',
      tier: tierLabel(profile.membership_tier)
    }
  };
}

export async function updateLawyerProfile(userId, payload) {
  const profile = await ensureLawyerProfile(userId);
  const practiceArea = Array.isArray(payload.practiceAreas)
    ? payload.practiceAreas[0]
    : payload.practiceAreas;
  const language = Array.isArray(payload.languages)
    ? payload.languages.join(', ')
    : payload.languages;

  await query(
    `UPDATE lawyer_profiles SET
      full_name = COALESCE($1, full_name),
      short_bio = COALESCE($2, short_bio),
      full_bio = COALESCE($3, full_bio),
      city = COALESCE($4, city),
      bar_council_num = COALESCE($5, bar_council_num),
      bar_council_name = COALESCE($6, bar_council_name),
      practice_area = COALESCE($7, practice_area),
      language = COALESCE($8, language),
      online_fee = COALESCE($9, online_fee),
      inperson_fee = COALESCE($10, inperson_fee)
     WHERE user_id = $11`,
    [
      payload.fullName || null,
      payload.shortBio || null,
      payload.fullBio || null,
      payload.city || null,
      payload.barCouncilNumber || null,
      payload.barCouncilName || null,
      practiceArea || null,
      language || null,
      payload.onlineFee != null ? Number(payload.onlineFee) : null,
      payload.inPersonFee != null ? Number(payload.inPersonFee) : null,
      userId
    ]
  );

  if (payload.officeAddress) {
    await query(
      'UPDATE lawyer_profiles SET office_address = $1 WHERE user_id = $2',
      [payload.officeAddress, userId]
    ).catch(() => {});
  }

  return getLawyerProfile(userId);
}

export async function getLawyerCases(userId) {
  const store = loadStore();
  const key = String(userId);
  if (!store.lawyerCases[key]) {
    store.lawyerCases[key] = [];
  }
  return { cases: store.lawyerCases[key] };
}

export async function saveLawyerCase(userId, payload, caseId = null) {
  const store = loadStore();
  const key = String(userId);
  if (!store.lawyerCases[key]) store.lawyerCases[key] = [];

  if (caseId) {
    const idx = store.lawyerCases[key].findIndex((c) => c.id === Number(caseId));
    if (idx >= 0) store.lawyerCases[key][idx] = { ...store.lawyerCases[key][idx], ...payload, id: Number(caseId) };
  } else {
    const id = Date.now();
    store.lawyerCases[key].push({ id, ...payload });
  }
  saveStore(store);
  return getLawyerCases(userId);
}

export async function deleteLawyerCase(userId, caseId) {
  const store = loadStore();
  const key = String(userId);
  store.lawyerCases[key] = (store.lawyerCases[key] || []).filter((c) => c.id !== Number(caseId));
  saveStore(store);
  return { success: true };
}

export async function getLawyerLexUsage(userId) {
  const profile = await ensureLawyerProfile(userId);
  const limit = profile.membership_tier === 'premium' ? 50 : profile.membership_tier === 'gold' ? 25 : 10;
  const used = profile.monthly_lex_ai || 0;
  return {
    remaining: Math.max(0, limit - used),
    lexSearchesRemaining: Math.max(0, limit - used),
    limit,
    monthlyLimit: limit,
    used
  };
}

export async function incrementLawyerLexUsage(userId) {
  const profile = await ensureLawyerProfile(userId);
  await query(
    'UPDATE lawyer_profiles SET monthly_lex_ai = COALESCE(monthly_lex_ai, 0) + 1 WHERE id = $1',
    [profile.id]
  );
}

export async function getVloSubscribers(userId) {
  const result = await query(
    `SELECT DISTINCT u.id, u.username AS name, u.email, vs.status AS subscription_status
     FROM vlo_subscriptions vs
     JOIN users u ON u.id = vs.client_id
     WHERE vs.assigned_lawyer_id = $1 OR vs.status = 'active'
     ORDER BY u.username`,
    [userId]
  );
  return { subscribers: result.rows };
}

export async function getVloMattersForSubscriber(userId, subscriberId) {
  const result = await query(
    `SELECT vm.id, vm.title, vm.description, vm.status, vm.lawyer_notes, vm.created_at
     FROM vlo_matters vm
     JOIN vlo_subscriptions vs ON vs.id = vm.subscription_id
     WHERE vs.client_id = $1
     ORDER BY vm.created_at DESC`,
    [subscriberId]
  );
  return { matters: result.rows };
}

export async function getLawyerClients(userId) {
  const result = await query(
    `SELECT DISTINCT u.id, u.username AS name, u.email
     FROM appointments a
     JOIN lawyer_profiles lp ON lp.id = a.lawyer_prof_id
     JOIN users u ON u.id = a.client_id
     WHERE lp.user_id = $1
     UNION
     SELECT DISTINCT u.id, u.username AS name, u.email
     FROM service_orders so
     JOIN users u ON u.id = so.client_id
     WHERE so.assigned_prof_id = $1`,
    [userId]
  );
  return { clients: result.rows };
}

export async function getLawyerEarnings(userId) {
  const profile = await ensureLawyerProfile(userId);
  const orders = await query(
    `SELECT COUNT(*)::int AS count FROM service_orders
     WHERE assigned_prof_id = $1 AND status = 'completed'`,
    [userId]
  );
  return {
    totalEarnings: (orders.rows[0]?.count || 0) * 15000,
    platformEarnings: `Rs. ${((orders.rows[0]?.count || 0) * 15000).toLocaleString('en-PK')}`,
    completedOrders: orders.rows[0]?.count || 0,
    tier: tierLabel(profile.membership_tier),
    monthlyBreakdown: []
  };
}

export async function getLawyerTeam(userId) {
  const store = loadStore();
  const key = String(userId);
  if (!store.lawyerTeams[key]) {
    store.lawyerTeams[key] = [];
  }
  return { team: store.lawyerTeams[key] };
}

export async function addLawyerTeamMember(userId, payload) {
  const store = loadStore();
  const key = String(userId);
  if (!store.lawyerTeams[key]) store.lawyerTeams[key] = [];
  const member = { id: Date.now(), ...payload };
  store.lawyerTeams[key].push(member);
  saveStore(store);
  return { member };
}

export async function removeLawyerTeamMember(userId, memberId) {
  const store = loadStore();
  const key = String(userId);
  store.lawyerTeams[key] = (store.lawyerTeams[key] || []).filter((m) => m.id !== Number(memberId));
  saveStore(store);
  return { success: true };
}

// ─── CA ─────────────────────────────────────────────────────────────────────

function parseServiceAreas(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // comma-separated fallback
  }
  return String(text).split(',').map((s) => s.trim()).filter(Boolean);
}

function stringifyServiceAreas(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function daysUntil(dateStr) {
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
}

function orderStatusLabel(status) {
  return status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || status;
}

export async function getCaDashboard(userId) {
  const profile = await ensureCaProfile(userId);
  if (!profile) return null;

  const [clients, taxPending, consultQueue, completedOrders] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT client_id)::int AS count FROM (
         SELECT client_id FROM ca_appointments WHERE ca_prof_id = $1
         UNION SELECT client_id FROM service_orders WHERE assigned_prof_id = $2 AND client_id IS NOT NULL
         UNION SELECT client_id FROM ca_retainers WHERE ca_prof_id = $1 AND client_id IS NOT NULL
         UNION SELECT client_id FROM ca_tax_profiles WHERE ca_prof_id = $1 AND client_id IS NOT NULL
       ) AS clients`,
      [profile.id, userId]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM ca_tax_profiles
       WHERE ca_prof_id = $1 AND tax_status NOT IN ('Filed', 'filed')`,
      [profile.id]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM ca_appointments
       WHERE ca_prof_id = $1 AND status IN ('pending', 'confirmed')`,
      [profile.id]
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM service_orders
       WHERE assigned_prof_id = $1 AND status = 'completed'`,
      [userId]
    )
  ]);

  const earnings = (completedOrders.rows[0]?.count || 0) * 15000;

  return {
    stats: {
      activeClients: clients.rows[0]?.count || 0,
      taxFilingsPending: taxPending.rows[0]?.count || 0,
      consultationQueue: consultQueue.rows[0]?.count || 0,
      platformEarnings: `Rs. ${earnings.toLocaleString('en-PK')}`,
      leadsUsed: profile.monthly_leads || 0
    }
  };
}

export async function getCaSubscription(userId) {
  const profile = await ensureCaProfile(userId);
  const tier = tierLabel(profile?.membership_tier || 'basic');
  const sub = await query(
    `SELECT tier, status, monthly_fee, next_billing FROM ca_subscriptions
     WHERE ca_id = $1 ORDER BY id DESC LIMIT 1`,
    [profile?.id]
  ).then((r) => r.rows[0]);

  return {
    tier,
    subscriptionTier: tier,
    status: sub?.status || 'active',
    monthlyFee: sub?.monthly_fee || 0,
    nextBilling: sub?.next_billing || null
  };
}

export async function getCaNotifications(userId) {
  const result = await query(
    `SELECT id, title, body AS text, link AS route, notification_type AS type, created_at AS createdAt
     FROM notifications
     WHERE user_id = $1 AND audience = 'ca' AND is_read = FALSE
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );
  return { notifications: result.rows };
}

export async function getCaComplianceDeadlines(userId) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `SELECT id, title, client_name, due_date, status
     FROM ca_compliance_deadlines
     WHERE ca_prof_id = $1
     ORDER BY due_date ASC`,
    [profile.id]
  );

  return {
    deadlines: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      clientName: row.client_name,
      dueDate: row.due_date,
      status: row.status,
      daysRemaining: daysUntil(row.due_date)
    }))
  };
}

export async function getCaTaxProfiles(userId) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `SELECT tp.id, tp.business_name, tp.client_email, tp.ntn, tp.secp_registration,
            tp.tax_status, tp.filing_count, tp.tax_year
     FROM ca_tax_profiles tp
     WHERE tp.ca_prof_id = $1
     ORDER BY tp.created_at DESC`,
    [profile.id]
  );

  const profiles = await Promise.all(result.rows.map(async (row) => {
    const filings = await query(
      `SELECT tc.original_name AS period, tc.uploaded_at
       FROM ca_tax_challans tc
       WHERE tc.tax_profile_id = $1
       ORDER BY tc.uploaded_at DESC LIMIT 5`,
      [row.id]
    );
    return {
      id: row.id,
      businessName: row.business_name,
      clientName: row.business_name,
      clientEmail: row.client_email,
      ntn: row.ntn,
      secpRegistration: row.secp_registration,
      taxStatus: row.tax_status,
      status: row.tax_status,
      filingCount: row.filing_count,
      returnsFiled: row.filing_count,
      taxYear: row.tax_year,
      recentFilings: filings.rows.map((f) => ({
        period: f.period,
        status: 'Uploaded'
      }))
    };
  }));

  return { profiles };
}

export async function uploadCaTaxChallan(userId, profileId, file) {
  const profile = await ensureCaProfile(userId);
  const owned = await query(
    'SELECT id FROM ca_tax_profiles WHERE id = $1 AND ca_prof_id = $2',
    [profileId, profile.id]
  );
  if (!owned.rows[0]) {
    throw new Error('Tax profile not found');
  }

  await query(
    `INSERT INTO ca_tax_challans (tax_profile_id, file_path, original_name)
     VALUES ($1, $2, $3)`,
    [profileId, file.path || file.filename, file.originalname || file.filename]
  );

  return { success: true, profileId: Number(profileId), file: file.originalname || file.filename };
}

export async function getCaOrders(userId) {
  const result = await query(
    `SELECT so.id, so.order_number, so.status, so.intake_form_data, so.expected_delivery, so.milestone,
            s.name AS service_name, u.username AS client_name
     FROM service_orders so
     JOIN services s ON s.id = so.service_id
     JOIN users u ON u.id = so.client_id
     WHERE so.assigned_prof_id = $1
     ORDER BY so.expected_delivery DESC`,
    [userId]
  );

  return {
    orders: result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      clientName: row.client_name,
      serviceName: row.service_name,
      packageName: row.service_name,
      status: orderStatusLabel(row.status),
      milestone: row.milestone || 'Documents Verified',
      deadline: row.expected_delivery,
      intakeForm: row.intake_form_data,
      formData: row.intake_form_data
    }))
  };
}

export async function updateCaOrderMilestone(userId, orderId, milestone) {
  const result = await query(
    `UPDATE service_orders SET milestone = $1
     WHERE id = $2 AND assigned_prof_id = $3
     RETURNING id, milestone`,
    [milestone, orderId, userId]
  );
  if (!result.rows[0]) {
    throw new Error('Order not found');
  }
  return { success: true, orderId: Number(orderId), milestone: result.rows[0].milestone };
}

export async function getCaDocuments(userId) {
  const profile = await ensureCaProfile(userId);
  const foldersResult = await query(
    `SELECT id, category, client_name, storage_bytes
     FROM ca_document_folders
     WHERE ca_prof_id = $1
     ORDER BY category, client_name`,
    [profile.id]
  );

  const folders = await Promise.all(foldersResult.rows.map(async (folder) => {
    const docs = await query(
      `SELECT id, name, status, esign_session_id
       FROM ca_documents WHERE folder_id = $1 ORDER BY name`,
      [folder.id]
    );
    return {
      id: folder.id,
      category: folder.category,
      clientName: folder.client_name,
      documents: docs.rows.map((d) => ({
        id: d.id,
        name: d.name,
        fileName: d.name,
        status: d.status,
        esignSessionId: d.esign_session_id
      }))
    };
  }));

  const storageResult = await query(
    `SELECT COALESCE(SUM(storage_bytes), 0)::bigint AS total
     FROM ca_document_folders WHERE ca_prof_id = $1`,
    [profile.id]
  );
  const storageUsedGb = Number((storageResult.rows[0]?.total || 0) / (1024 ** 3)).toFixed(2);

  return { folders, storageUsedGb: Number(storageUsedGb) };
}

export async function triggerCaDocumentESign(userId, documentId) {
  const profile = await ensureCaProfile(userId);
  const doc = await query(
    `SELECT d.id FROM ca_documents d
     JOIN ca_document_folders f ON f.id = d.folder_id
     WHERE d.id = $1 AND f.ca_prof_id = $2`,
    [documentId, profile.id]
  );
  if (!doc.rows[0]) {
    throw new Error('Document not found');
  }

  const sessionId = `ca-esign-${documentId}-${Date.now()}`;
  await query(
    `UPDATE ca_documents SET esign_session_id = $1, status = 'Pending Signature'
     WHERE id = $2`,
    [sessionId, documentId]
  );

  return { success: true, sessionId };
}

export async function getCaRetainers(userId) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `SELECT id, company_name, plan, billing_cycle, status, monthly_fee
     FROM ca_retainers
     WHERE ca_prof_id = $1
     ORDER BY company_name`,
    [profile.id]
  );

  return {
    retainers: result.rows.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      clientName: row.company_name,
      plan: row.plan,
      billingCycle: row.billing_cycle,
      status: row.status,
      monthlyFee: row.monthly_fee != null ? Number(row.monthly_fee) : null
    }))
  };
}

export async function getCaRetainerTasks(userId, retainerId) {
  const profile = await ensureCaProfile(userId);
  const retainer = await query(
    'SELECT id FROM ca_retainers WHERE id = $1 AND ca_prof_id = $2',
    [retainerId, profile.id]
  );
  if (!retainer.rows[0]) {
    return { tasks: [] };
  }

  const result = await query(
    `SELECT id, title, due_date, frequency, completed
     FROM ca_retainer_tasks
     WHERE retainer_id = $1
     ORDER BY due_date ASC NULLS LAST, id ASC`,
    [retainerId]
  );

  return {
    tasks: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      frequency: row.frequency,
      completed: row.completed,
      status: row.completed ? 'Completed' : 'In Progress'
    }))
  };
}

export async function updateCaRetainerTask(userId, taskId, payload) {
  const profile = await ensureCaProfile(userId);
  const task = await query(
    `SELECT t.id FROM ca_retainer_tasks t
     JOIN ca_retainers r ON r.id = t.retainer_id
     WHERE t.id = $1 AND r.ca_prof_id = $2`,
    [taskId, profile.id]
  );
  if (!task.rows[0]) {
    throw new Error('Task not found');
  }

  const completed = payload.completed != null ? Boolean(payload.completed) : undefined;
  if (completed != null) {
    await query('UPDATE ca_retainer_tasks SET completed = $1 WHERE id = $2', [completed, taskId]);
  }

  return { success: true, taskId: Number(taskId), completed };
}

export async function getCaAppointments(userId) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.mode, a.status,
            a.meeting_link, a.topic, u.username AS client_name
     FROM ca_appointments a
     JOIN users u ON u.id = a.client_id
     WHERE a.ca_prof_id = $1
     ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [profile.id]
  );

  return {
    appointments: result.rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      date: row.appointment_date,
      dateLabel: new Date(row.appointment_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }),
      time: row.appointment_time?.slice?.(0, 5) || row.appointment_time,
      slot: row.appointment_time?.slice?.(0, 5) || row.appointment_time,
      mode: row.mode === 'online' ? 'Online' : 'In-Person',
      topic: row.topic,
      purpose: row.topic,
      status: apptStatusLabel(row.status),
      meetingLink: row.meeting_link
    }))
  };
}

export async function updateCaAppointment(userId, appointmentId, { status, meetingLink } = {}) {
  const profile = await ensureCaProfile(userId);
  const dbStatus = status ? apptStatusToDb(status) : null;

  const appt = await query(
    `SELECT a.client_id, a.appointment_date, a.appointment_time, a.mode, cp.full_name AS ca_name
     FROM ca_appointments a
     JOIN ca_profiles cp ON cp.id = a.ca_prof_id
     WHERE a.id = $1 AND a.ca_prof_id = $2`,
    [appointmentId, profile.id]
  );
  if (!appt.rows[0]) {
    throw new Error('Appointment not found');
  }

  await query(
    `UPDATE ca_appointments SET
      status = COALESCE($1, status),
      meeting_link = COALESCE($2, meeting_link)
     WHERE id = $3 AND ca_prof_id = $4`,
    [dbStatus, meetingLink || null, appointmentId, profile.id]
  );

  if (status) {
    const statusLabel = apptStatusLabel(dbStatus);
    const slotLabel = `${appt.rows[0].appointment_date} at ${String(appt.rows[0].appointment_time).slice(0, 5)}`;
    const modeLabel = appt.rows[0].mode === 'online' ? 'online' : 'in-person';
    const caName = appt.rows[0].ca_name || 'Your chartered accountant';

    let title = 'Appointment Update';
    let body = `Your consultation on ${slotLabel} is now ${statusLabel}.`;

    if (status === 'Accepted' || dbStatus === 'confirmed') {
      title = 'Consultation Accepted';
      body = `${caName} accepted your ${modeLabel} consultation for ${slotLabel}.`;
    } else if (status === 'Declined' || (dbStatus === 'cancelled' && status === 'Declined')) {
      title = 'Consultation Declined';
      body = `${caName} declined your ${modeLabel} consultation for ${slotLabel}.`;
    } else if (status === 'Cancelled') {
      title = 'Consultation Cancelled';
      body = `${caName} cancelled your ${modeLabel} consultation for ${slotLabel}.`;
    }

    await createNotification(appt.rows[0].client_id, {
      title,
      body,
      type: 'appointment',
      link: '/account/messages',
      audience: 'client',
    });

    if (status === 'Accepted' || dbStatus === 'confirmed') {
      const clientId = appt.rows[0].client_id;
      if (Number(userId) !== Number(clientId)) {
        const confirmationText =
          `Your ${modeLabel} consultation on ${slotLabel} is confirmed. ` +
          'Reply here if you have any questions before we meet.';
        try {
          await sendProfessionalToClientMessage(userId, clientId, confirmationText);
        } catch (err) {
          console.error('[appointments] CA confirmation message failed:', err.message);
        }
      }
    }
  }

  return { success: true, appointmentId: Number(appointmentId), status, meetingLink };
}

export async function getCaProfile(userId) {
  const profile = await ensureCaProfile(userId);
  const expertise = parseServiceAreas(profile.service_areas);

  return {
    profile: {
      fullName: profile.full_name,
      name: profile.full_name,
      photoUrl: profile.photo,
      avatarUrl: profile.photo,
      cnic: profile.cnic,
      icapMembershipNo: profile.icap_membership_no,
      membershipNumber: profile.icap_membership_no,
      qualification: profile.qualification,
      city: profile.city,
      officeLocation: profile.office_address || '',
      address: profile.office_address || '',
      shortBio: profile.short_bio || '',
      fullBio: profile.full_bio || '',
      bio: profile.full_bio || '',
      expertise,
      serviceAreas: expertise,
      fees: Number(profile.fees),
      onlineFee: profile.online_fee != null ? Number(profile.online_fee) : Number(profile.fees),
      inPersonFee: profile.inperson_fee != null ? Number(profile.inperson_fee) : Number(profile.fees),
      packagePricing: profile.availability || '',
      verificationStatus: profile.verification_stat === 'verified' ? 'Approved' : 'Pending',
      tier: tierLabel(profile.membership_tier)
    }
  };
}

export async function updateCaProfile(userId, payload) {
  await ensureCaProfile(userId);
  const expertise = payload.expertise != null
    ? stringifyServiceAreas(payload.expertise)
    : null;

  await query(
    `UPDATE ca_profiles SET
      full_name = COALESCE($1, full_name),
      icap_membership_no = COALESCE($2, icap_membership_no),
      qualification = COALESCE($3, qualification),
      city = COALESCE($4, city),
      office_address = COALESCE($5, office_address),
      short_bio = COALESCE($6, short_bio),
      full_bio = COALESCE($7, full_bio),
      service_areas = COALESCE($8, service_areas),
      availability = COALESCE($9, availability),
      fees = COALESCE($10, fees),
      online_fee = COALESCE($11, online_fee),
      inperson_fee = COALESCE($12, inperson_fee)
     WHERE user_id = $13`,
    [
      payload.fullName || null,
      payload.icapMembershipNo || null,
      payload.qualification || null,
      payload.city || null,
      payload.officeLocation || payload.address || null,
      payload.shortBio || null,
      payload.fullBio || payload.bio || null,
      expertise,
      payload.packagePricing || null,
      payload.fees != null ? Number(payload.fees) : null,
      payload.onlineFee != null ? Number(payload.onlineFee) : null,
      payload.inPersonFee != null ? Number(payload.inPersonFee) : null,
      userId
    ]
  );

  return getCaProfile(userId);
}

export async function updateCaProfilePhoto(userId, file) {
  const profile = await ensureCaProfile(userId);
  const photoPath = `/uploads/${file.filename}`;
  await query('UPDATE ca_profiles SET photo = $1 WHERE id = $2', [photoPath, profile.id]);
  return { success: true, photoUrl: photoPath };
}

export async function getCaTeam(userId) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `SELECT id, name, email, role FROM ca_team_members
     WHERE ca_prof_id = $1 ORDER BY created_at ASC`,
    [profile.id]
  );
  return { members: result.rows, team: result.rows };
}

export async function addCaTeamMember(userId, payload) {
  const profile = await ensureCaProfile(userId);
  const result = await query(
    `INSERT INTO ca_team_members (ca_prof_id, name, email, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role`,
    [profile.id, payload.name, payload.email, payload.role || 'Junior CA']
  );
  return { member: result.rows[0] };
}

export async function removeCaTeamMember(userId, memberId) {
  const profile = await ensureCaProfile(userId);
  await query(
    'DELETE FROM ca_team_members WHERE id = $1 AND ca_prof_id = $2',
    [memberId, profile.id]
  );
  return { success: true };
}
