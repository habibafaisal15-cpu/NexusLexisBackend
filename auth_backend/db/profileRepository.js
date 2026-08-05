import { query } from './index.js';



const VERIFICATION_WINDOW_DAYS = 7;



export async function getDashboardUserById(userId) {

  const result = await query(

    `SELECT id, username, email, phone, role, active_role, is_active, date_joined

     FROM users WHERE id = $1`,

    [userId]

  );

  return result.rows[0] || null;

}



export async function updateActiveRole(userId, activeRole) {

  await query(

    'UPDATE users SET active_role = $1 WHERE id = $2',

    [activeRole, userId]

  );

}



export async function updateUserPhone(userId, phone) {

  await query('UPDATE users SET phone = $1 WHERE id = $2', [phone, userId]);

}



export async function updateAuthUserPhone(email, phone) {

  await query(

    'UPDATE auth_users SET phone = $1 WHERE LOWER(email) = LOWER($2)',

    [phone, email]

  );

}



export async function updateUserRole(userId, role) {

  await query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);

}



export async function updateAuthUserRole(email, role) {

  await query(

    'UPDATE auth_users SET role = $1 WHERE LOWER(email) = LOWER($2)',

    [role, email]

  );

}



export async function getClientProfile(userId) {

  const result = await query('SELECT * FROM client_profiles WHERE user_id = $1', [userId]);

  return result.rows[0] || null;

}



export async function upsertClientProfile(userId, data) {

  const existing = await getClientProfile(userId);

  if (existing) {

    const result = await query(

      `UPDATE client_profiles

       SET cnic = $2, address = $3, city = $4, profile_photo = $5, documents = $6, updated_at = CURRENT_TIMESTAMP

       WHERE user_id = $1

       RETURNING *`,

      [

        userId,

        data.cnic || null,

        data.address || null,

        data.city || null,

        data.profilePhoto || null,

        JSON.stringify(data.documents || {})

      ]

    );

    return result.rows[0];

  }



  const result = await query(

    `INSERT INTO client_profiles (user_id, cnic, address, city, profile_photo, documents)

     VALUES ($1, $2, $3, $4, $5, $6)

     RETURNING *`,

    [

      userId,

      data.cnic || null,

      data.address || null,

      data.city || null,

      data.profilePhoto || null,

      JSON.stringify(data.documents || {})

    ]

  );

  return result.rows[0];

}



/** Minimal client enrollment for lawyer/CA accounts — no address/CNIC required. */

export async function ensureClientAccess(userId) {

  const existing = await getClientProfile(userId);

  if (existing) return existing;



  const result = await query(

    `INSERT INTO client_profiles (user_id, documents)

     VALUES ($1, '{}'::jsonb)

     RETURNING *`,

    [userId]

  );

  return result.rows[0];

}



export async function getLawyerProfile(userId) {

  const result = await query(

    `SELECT lp.*, u.email

     FROM lawyer_profiles lp

     JOIN users u ON u.id = lp.user_id

     WHERE lp.user_id = $1`,

    [userId]

  );

  return result.rows[0] || null;

}



function buildLawyerFields(data, userId, existing = null) {

  const practiceArea = Array.isArray(data.practiceAreas)

    ? data.practiceAreas[0] || 'General practice'

    : data.practiceArea || 'General practice';

  const languages = Array.isArray(data.languages)

    ? data.languages.join(', ')

    : data.language || 'English';

  const practiceAreas = Array.isArray(data.practiceAreas)

    ? data.practiceAreas.join(', ')

    : practiceArea;

  const cnic = data.cnic || existing?.cnic || `LP-${userId}`;

  const documents = {

    profilePhoto: data.profilePhoto || null,

    barCertificate: data.barCertificate || null,

    cnicFront: data.cnicFront || null,

    cnicBack: data.cnicBack || null

  };



  return { practiceArea, languages, practiceAreas, cnic, documents };

}



export async function submitLawyerApplication(userId, data) {

  const existing = await getLawyerProfile(userId);

  if (existing?.verification_stat === 'pending') {

    throw new Error('Your lawyer application is already under review');

  }

  if (existing?.verification_stat === 'verified') {

    throw new Error('Your lawyer profile is already verified');

  }



  const { practiceArea, languages, practiceAreas, cnic, documents } = buildLawyerFields(data, userId, existing);

  const submittedAt = new Date();

  const reviewDeadline = new Date(submittedAt.getTime() + VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);



  if (existing) {

    const result = await query(

      `UPDATE lawyer_profiles SET

         full_name = $2, photo = $3, cnic = $4, bar_council_name = $5, bar_council_num = $6,

         verification_stat = 'pending', verification_submitted_at = $7, verification_review_deadline = $8,

         city = $9, practice_area = $10, practice_areas = $11,

         language = $12, languages = $13, short_bio = $14, full_bio = $15, office_address = $16,

         online_fee = $17, inperson_fee = $18, consultation_mode = $19, documents = $20

       WHERE user_id = $1

       RETURNING *`,

      [

        userId,

        data.fullName || existing.full_name,

        data.profilePhoto || existing.photo,

        cnic,

        data.barCouncilName,

        data.barCouncilNumber,

        submittedAt,

        reviewDeadline,

        data.city,

        practiceArea,

        practiceAreas,

        languages.split(',')[0]?.trim() || 'English',

        languages,

        data.shortBio || null,

        data.fullBio || null,

        data.officeAddress || null,

        data.onlineFee,

        data.inPersonFee,

        data.consultationMode || 'Both',

        JSON.stringify(documents)

      ]

    );

    return result.rows[0];

  }



  const result = await query(

    `INSERT INTO lawyer_profiles (

       user_id, full_name, photo, cnic, bar_council_name, bar_council_num,

       verification_stat, verification_submitted_at, verification_review_deadline,

       city, practice_area, practice_areas, language, languages,

       short_bio, full_bio, office_address, online_fee, inperson_fee, consultation_mode, documents

     ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)

     RETURNING *`,

    [

      userId,

      data.fullName,

      data.profilePhoto || null,

      cnic,

      data.barCouncilName,

      data.barCouncilNumber,

      submittedAt,

      reviewDeadline,

      data.city,

      practiceArea,

      practiceAreas,

      languages.split(',')[0]?.trim() || 'English',

      languages,

      data.shortBio || null,

      data.fullBio || null,

      data.officeAddress || null,

      data.onlineFee,

      data.inPersonFee,

      data.consultationMode || 'Both',

      JSON.stringify(documents)

    ]

  );

  return result.rows[0];

}



export async function setLawyerVerificationStatus(userId, status) {

  await query(

    `UPDATE lawyer_profiles SET verification_stat = $2 WHERE user_id = $1`,

    [userId, status]

  );

}



export async function getCAProfile(userId) {

  const result = await query('SELECT * FROM ca_profiles WHERE user_id = $1', [userId]);

  return result.rows[0] || null;

}



function buildCAFields(data, existing = null) {

  const serviceAreas = Array.isArray(data.serviceAreas)

    ? data.serviceAreas.join(', ')

    : data.serviceAreas || '';

  const documents = {

    photo: data.photo || null,

    caCertificate: data.caCertificate || null,

    cnicFront: data.cnicFront || null,

    cnicBack: data.cnicBack || null

  };

  return { serviceAreas, documents };

}



export async function submitCAApplication(userId, data) {

  const existing = await getCAProfile(userId);

  if (existing?.verification_stat === 'pending') {

    throw new Error('Your CA application is already under review');

  }

  if (existing?.verification_stat === 'verified') {

    throw new Error('Your CA profile is already verified');

  }



  const { serviceAreas, documents } = buildCAFields(data, existing);

  const submittedAt = new Date();

  const reviewDeadline = new Date(submittedAt.getTime() + VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);



  if (existing) {

    const result = await query(

      `UPDATE ca_profiles SET

         full_name = $2, photo = $3, cnic = $4, qualification = $5, city = $6, fees = $7,

         verification_stat = 'pending', verification_submitted_at = $8, verification_review_deadline = $9,

         icap_membership_no = $10, service_areas = $11, availability = $12, documents = $13

       WHERE user_id = $1

       RETURNING *`,

      [

        userId,

        data.fullName || existing.full_name,

        data.photo || null,

        data.cnic,

        data.qualification,

        data.city,

        data.fees,

        submittedAt,

        reviewDeadline,

        data.icapMembershipNo || null,

        serviceAreas,

        data.availability || null,

        JSON.stringify(documents)

      ]

    );

    return result.rows[0];

  }



  const result = await query(

    `INSERT INTO ca_profiles (

       user_id, full_name, photo, cnic, qualification, city, fees,

       verification_stat, verification_submitted_at, verification_review_deadline,

       icap_membership_no, service_areas, availability, documents

     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13)

     RETURNING *`,

    [

      userId,

      data.fullName,

      data.photo || null,

      data.cnic,

      data.qualification,

      data.city,

      data.fees,

      submittedAt,

      reviewDeadline,

      data.icapMembershipNo || null,

      serviceAreas,

      data.availability || null,

      JSON.stringify(documents)

    ]

  );

  return result.rows[0];

}



export async function setCAVerificationStatus(userId, status) {

  await query(

    `UPDATE ca_profiles SET verification_stat = $2 WHERE user_id = $1`,

    [userId, status]

  );

}



export async function listPendingLawyerApplications() {

  const result = await query(

    `SELECT lp.user_id, lp.full_name, lp.city, lp.verification_stat,

            lp.verification_submitted_at, lp.verification_review_deadline,

            u.username, u.email

     FROM lawyer_profiles lp

     JOIN users u ON u.id = lp.user_id

     WHERE lp.verification_stat = 'pending'

     ORDER BY lp.verification_submitted_at ASC`

  );

  return result.rows;

}



export async function listPendingCAApplications() {

  const result = await query(

    `SELECT cp.user_id, cp.full_name, cp.city, cp.verification_stat,

            cp.verification_submitted_at, cp.verification_review_deadline,

            u.username, u.email

     FROM ca_profiles cp

     JOIN users u ON u.id = cp.user_id

     WHERE cp.verification_stat = 'pending'

     ORDER BY cp.verification_submitted_at ASC`

  );

  return result.rows;

}



export async function getLawyerApplicationForAdmin(userId) {

  const result = await query(

    `SELECT lp.*, u.username, u.email, u.phone

     FROM lawyer_profiles lp

     JOIN users u ON u.id = lp.user_id

     WHERE lp.user_id = $1 AND lp.verification_stat = 'pending'`,

    [userId]

  );

  return result.rows[0] || null;

}



export async function getCAApplicationForAdmin(userId) {

  const result = await query(

    `SELECT cp.*, u.username, u.email, u.phone

     FROM ca_profiles cp

     JOIN users u ON u.id = cp.user_id

     WHERE cp.user_id = $1 AND cp.verification_stat = 'pending'`,

    [userId]

  );

  return result.rows[0] || null;

}



export function mapVerification(prof) {

  if (!prof) {

    return { status: 'None', submittedAt: null, reviewDeadline: null, daysRemaining: null };

  }



  const statusMap = {

    verified: 'Approved',

    pending: 'Pending',

    rejected: 'Rejected'

  };



  const deadline = prof.verification_review_deadline

    ? new Date(prof.verification_review_deadline)

    : null;

  const daysRemaining = deadline

    ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))

    : null;



  return {

    status: statusMap[prof.verification_stat] || 'Pending',

    submittedAt: prof.verification_submitted_at || null,

    reviewDeadline: prof.verification_review_deadline || null,

    daysRemaining

  };

}



export function resolveActiveRole(user, lawyerProfile, caProfile, clientProfile = null) {

  if (user.role === 'admin') return 'admin';

  const stored = user.active_role || user.role || 'client';

  const canUseClient = user.role === 'client' || Boolean(clientProfile);

  const canUseLawyer = lawyerProfile?.verification_stat === 'verified';

  const canUseCA = caProfile?.verification_stat === 'verified';



  if (stored === 'client' && canUseClient) return 'client';

  if (stored === 'lawyer' && (canUseLawyer || user.role === 'lawyer')) return 'lawyer';

  if (stored === 'ca' && (canUseCA || user.role === 'ca')) return 'ca';



  if (user.role === 'lawyer') return 'lawyer';

  if (user.role === 'ca') return 'ca';

  return 'client';

}



export async function getFullProfileBundle(userId) {

  const user = await getDashboardUserById(userId);

  if (!user) return null;



  const [clientProfile, lawyerProfile, caProfile] = await Promise.all([

    getClientProfile(userId),

    getLawyerProfile(userId),

    getCAProfile(userId)

  ]);



  const activeRoleKey = resolveActiveRole(user, lawyerProfile, caProfile, clientProfile);

  const lawyerVerification = mapVerification(lawyerProfile);

  const caVerification = mapVerification(caProfile);



  if (user.role === 'admin') {

    return {

      user,

      clientProfile,

      lawyerProfile,

      caProfile,

      activeRoleKey: 'admin',

      lawyerVerification,

      caVerification,

      verificationStatus: 'Approved',

      profileCompleted: true,

      canSwitchToLawyer: false,

      canSwitchToCA: false,

      canSwitchToClient: false,

      availableRoles: ['admin'],

      canApplyAsLawyer: false,

      canApplyAsCA: false,

      canApplyAsClient: false,

      accountRoleKey: 'admin'

    };

  }



  let verificationStatus = 'Approved';

  if (activeRoleKey === 'client') {

    verificationStatus = 'Approved';

  } else if (activeRoleKey === 'lawyer') {

    verificationStatus = lawyerProfile
      ? (lawyerVerification.status === 'None' ? 'Pending' : lawyerVerification.status)
      : 'ApplicationRequired';

  } else if (activeRoleKey === 'ca') {

    verificationStatus = caProfile
      ? (caVerification.status === 'None' ? 'Pending' : caVerification.status)
      : 'ApplicationRequired';

  }



  const hasClientAccess = Boolean(clientProfile);

  const hasClientDetails = Boolean(clientProfile?.address || clientProfile?.city || clientProfile?.cnic);

  const profileCompleted = hasClientAccess

    || Boolean(lawyerProfile)

    || Boolean(caProfile)

    || user.role === 'lawyer'

    || user.role === 'ca'

    || user.role === 'admin';



  const canSwitchToLawyer = lawyerProfile?.verification_stat === 'verified';

  const canSwitchToCA = caProfile?.verification_stat === 'verified';

  const canSwitchToClient = user.role === 'client' || hasClientAccess;



  const availableRoles = [];

  if (canSwitchToClient) availableRoles.push('client');

  if (canSwitchToLawyer) availableRoles.push('lawyer');

  if (canSwitchToCA) availableRoles.push('ca');

  if (user.role === 'lawyer' && !availableRoles.includes('lawyer')) availableRoles.push('lawyer');

  if (user.role === 'ca' && !availableRoles.includes('ca')) availableRoles.push('ca');



  return {

    user,

    clientProfile,

    lawyerProfile,

    caProfile,

    activeRoleKey,

    lawyerVerification,

    caVerification,

    verificationStatus,

    profileCompleted,

    canSwitchToLawyer,

    canSwitchToCA,

    canSwitchToClient,

    availableRoles,

    canApplyAsLawyer: !lawyerProfile || lawyerProfile.verification_stat === 'rejected',

    canApplyAsCA: !caProfile || caProfile.verification_stat === 'rejected',

    canApplyAsClient: (user.role === 'lawyer' || user.role === 'ca') && !hasClientAccess,

    accountRoleKey: user.role

  };

}


