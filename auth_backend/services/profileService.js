import { findUserByEmail } from './authService.js';

import { signToken, buildTokenPayloadFromBundle } from '../middleware/auth.js';

import * as repo from '../db/profileRepository.js';



function normalizeClientBody(body) {

  return {

    cnic: body.cnic || null,

    address: body.address || null,

    city: body.city || null,

    profilePhoto: body.profilePhoto || body.profile_photo || null,

    documents: body.documents || {}

  };

}



function normalizeLawyerBody(body, fullName) {

  return {

    fullName: body.fullName || fullName,

    profilePhoto: body.profilePhoto || null,

    barCertificate: body.barCertificate || null,

    cnicFront: body.cnicFront || null,

    cnicBack: body.cnicBack || null,

    cnic: body.cnic || null,

    barCouncilName: body.barCouncilName,

    barCouncilNumber: body.barCouncilNumber,

    city: body.city,

    practiceAreas: body.practiceAreas || [],

    languages: body.languages || [],

    shortBio: body.shortBio || null,

    fullBio: body.fullBio || null,

    officeAddress: body.officeAddress || null,

    onlineFee: Number(body.onlineFee),

    inPersonFee: Number(body.inPersonFee),

    consultationMode: body.consultationMode || 'Both'

  };

}



function normalizeCABody(body, fullName) {

  return {

    fullName: body.fullName || fullName,

    photo: body.photo || null,

    caCertificate: body.caCertificate || null,

    cnicFront: body.cnicFront || null,

    cnicBack: body.cnicBack || null,

    cnic: body.cnic,

    icapMembershipNo: body.icapMembershipNo || null,

    qualification: body.qualification,

    city: body.city,

    serviceAreas: body.serviceAreas || [],

    fees: Number(body.fees),

    availability: body.availability || null

  };

}



export async function getProfileForUser(userId, email) {

  const bundle = await repo.getFullProfileBundle(userId);

  if (!bundle) {

    throw new Error('User profile not found');

  }



  const authUser = await findUserByEmail(email);

  return formatProfileResponse(bundle, authUser);

}



export function formatProfileResponse(bundle, authUser = null) {

  const {

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

    canApplyAsLawyer,

    canApplyAsCA,

    canApplyAsClient,

    accountRoleKey

  } = bundle;



  const roleLabels = { client: 'Client', lawyer: 'Lawyer', ca: 'CA', admin: 'Admin' };

  const activeRole = roleLabels[activeRoleKey] || 'Client';



  let pendingVerificationRole = null;

  if (lawyerVerification.status === 'Pending') pendingVerificationRole = 'Lawyer';

  else if (caVerification.status === 'Pending') pendingVerificationRole = 'CA';



  return {

    id: String(user.id),

    dashboardUserId: user.id,

    name: user.username,

    email: user.email,

    phone: user.phone || authUser?.phone || '',

    role: activeRole,

    roleKey: activeRoleKey,

    activeRole,

    activeRoleKey,

    profileCompleted,

    verificationStatus,

    pendingVerificationRole,

    clientProfile: clientProfile || null,

    lawyerProfile: lawyerProfile || null,

    caProfile: caProfile || null,

    lawyerVerification,

    caVerification,

    canApplyAsLawyer,

    canApplyAsCA,

    canApplyAsClient,

    accountRoleKey: accountRoleKey || user?.role || activeRoleKey,

    canSwitchToLawyer,

    canSwitchToCA,

    canSwitchToClient,

    availableRoles

  };

}



export async function saveClientProfile(userId, email, body) {

  const data = normalizeClientBody(body);

  if (body.phone) {

    await repo.updateUserPhone(userId, body.phone);

    await repo.updateAuthUserPhone(email, body.phone);

  }

  const clientProfile = await repo.upsertClientProfile(userId, data);

  await repo.updateActiveRole(userId, 'client');

  const bundle = await repo.getFullProfileBundle(userId);

  return formatProfileResponse({ ...bundle, clientProfile }, await findUserByEmail(email));

}



export async function signupAsClient(userId, email) {

  const user = await repo.getDashboardUserById(userId);

  if (!user) throw new Error('User not found');

  if (!['client', 'lawyer', 'ca'].includes(user.role)) {

    throw new Error('Client enrollment is not available for this account type');

  }



  const clientProfile = await repo.ensureClientAccess(userId);

  await repo.updateActiveRole(userId, 'client');

  const bundle = await repo.getFullProfileBundle(userId);

  return formatProfileResponse({ ...bundle, clientProfile }, await findUserByEmail(email));

}



export async function applyLawyerProfile(userId, email, body) {

  const user = await repo.getDashboardUserById(userId);

  if (!user) throw new Error('User not found');

  if (user.role !== 'client' && user.role !== 'lawyer' && user.role !== 'admin') {

    throw new Error('Only client, lawyer, or admin accounts can apply for a lawyer profile');

  }



  const required = ['barCouncilName', 'barCouncilNumber', 'city', 'shortBio', 'fullBio', 'officeAddress', 'onlineFee', 'inPersonFee'];

  for (const field of required) {

    if (body[field] === undefined || body[field] === null || body[field] === '') {

      throw new Error(`Missing required field: ${field}`);

    }

  }



  const data = normalizeLawyerBody(body, user.username);

  const lawyerProfile = await repo.submitLawyerApplication(userId, data);

  const bundle = await repo.getFullProfileBundle(userId);

  return formatProfileResponse({ ...bundle, lawyerProfile }, await findUserByEmail(email));

}



export async function applyCAProfile(userId, email, body) {

  const user = await repo.getDashboardUserById(userId);

  if (!user) throw new Error('User not found');

  if (!['client', 'lawyer', 'ca', 'admin'].includes(user.role)) {

    throw new Error('This account type cannot apply for a CA profile');

  }



  const required = ['cnic', 'qualification', 'city', 'fees'];

  for (const field of required) {

    if (body[field] === undefined || body[field] === null || body[field] === '') {

      throw new Error(`Missing required field: ${field}`);

    }

  }



  const data = normalizeCABody(body, user.username);

  const caProfile = await repo.submitCAApplication(userId, data);

  const bundle = await repo.getFullProfileBundle(userId);

  return formatProfileResponse({ ...bundle, caProfile }, await findUserByEmail(email));

}



export async function switchActiveRole(userId, email, targetRole) {

  const bundle = await repo.getFullProfileBundle(userId);

  if (!bundle) throw new Error('User not found');



  const role = String(targetRole || '').toLowerCase();

  if (!['client', 'lawyer', 'ca'].includes(role)) {

    throw new Error('Invalid role');

  }



  if (role === 'lawyer') {

    if (bundle.lawyerProfile?.verification_stat === 'pending') {

      const err = new Error('Lawyer verification is still pending');

      err.code = 'PENDING_VERIFICATION';

      err.pendingRole = 'Lawyer';

      throw err;

    }

    if (!bundle.canSwitchToLawyer) {

      throw new Error('Lawyer profile is not verified yet');

    }

  }



  if (role === 'ca') {

    if (bundle.caProfile?.verification_stat === 'pending') {

      const err = new Error('CA verification is still pending');

      err.code = 'PENDING_VERIFICATION';

      err.pendingRole = 'CA';

      throw err;

    }

    if (!bundle.canSwitchToCA) {

      throw new Error('CA profile is not verified yet');

    }

  }



  if (role === 'client' && !bundle.canSwitchToClient) {

    throw new Error('Client profile is not available');

  }



  await repo.updateActiveRole(userId, role);

  const updated = await repo.getFullProfileBundle(userId);

  const authUser = await findUserByEmail(email);

  return formatProfileResponse(updated, authUser);

}



export function issueTokenForProfile(authUser, bundle) {

  const payload = buildTokenPayloadFromBundle(authUser, bundle);

  return signToken(payload);

}


