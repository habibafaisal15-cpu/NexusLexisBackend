import * as repo from '../db/profileRepository.js';
import { resolveDocumentForAdmin } from './verificationDocumentService.js';

function parseDocuments(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function formatLawyerApplication(row) {
  const documents = parseDocuments(row.documents);

  const docFields = {
    profilePhoto: documents.profilePhoto || row.photo || null,
    barCertificate: documents.barCertificate || null,
    cnicFront: documents.cnicFront || null,
    cnicBack: documents.cnicBack || null,
  };

  const resolvedDocuments = Object.fromEntries(
    Object.entries(docFields).map(([key, value]) => [key, resolveDocumentForAdmin(value, key)])
  );

  return {
    userId: row.user_id,
    type: 'lawyer',
    name: row.full_name || row.username,
    email: row.email,
    phone: row.phone || '',
    city: row.city,
    submittedAt: row.verification_submitted_at,
    reviewDeadline: row.verification_review_deadline,
    status: row.verification_stat,
    barCouncilName: row.bar_council_name,
    barCouncilNumber: row.bar_council_num,
    practiceAreas: row.practice_areas || row.practice_area,
    languages: row.languages || row.language,
    shortBio: row.short_bio,
    fullBio: row.full_bio,
    officeAddress: row.office_address,
    onlineFee: row.online_fee,
    inPersonFee: row.inperson_fee,
    consultationMode: row.consultation_mode,
    documents: resolvedDocuments,
  };
}

function formatCAApplication(row) {
  const documents = parseDocuments(row.documents);

  const docFields = {
    photo: documents.photo || row.photo || null,
    caCertificate: documents.caCertificate || null,
    cnicFront: documents.cnicFront || null,
    cnicBack: documents.cnicBack || null,
  };

  const resolvedDocuments = Object.fromEntries(
    Object.entries(docFields).map(([key, value]) => [key, resolveDocumentForAdmin(value, key)])
  );

  return {
    userId: row.user_id,
    type: 'ca',
    name: row.full_name || row.username,
    email: row.email,
    phone: row.phone || '',
    city: row.city,
    submittedAt: row.verification_submitted_at,
    reviewDeadline: row.verification_review_deadline,
    status: row.verification_stat,
    cnic: row.cnic,
    icapMembershipNo: row.icap_membership_no,
    qualification: row.qualification,
    serviceAreas: row.service_areas,
    fees: row.fees,
    availability: row.availability,
    documents: resolvedDocuments,
  };
}

export async function listPendingApplications() {
  const [lawyers, cas] = await Promise.all([
    repo.listPendingLawyerApplications(),
    repo.listPendingCAApplications(),
  ]);

  return {
    applications: [
      ...lawyers.map((row) => formatApplicationSummary(row, 'lawyer')),
      ...cas.map((row) => formatApplicationSummary(row, 'ca')),
    ].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
  };
}

function formatApplicationSummary(row, type) {
  return {
    userId: row.user_id,
    name: row.full_name || row.username,
    email: row.email,
    type,
    city: row.city,
    submittedAt: row.verification_submitted_at,
    reviewDeadline: row.verification_review_deadline,
    status: row.verification_stat,
  };
}

export async function getApplicationDetails(userId, type) {
  if (type === 'lawyer') {
    const row = await repo.getLawyerApplicationForAdmin(userId);
    if (!row) {
      throw new Error('Pending lawyer application not found');
    }
    return { application: formatLawyerApplication(row) };
  }

  if (type === 'ca') {
    const row = await repo.getCAApplicationForAdmin(userId);
    if (!row) {
      throw new Error('Pending CA application not found');
    }
    return { application: formatCAApplication(row) };
  }

  throw new Error('Invalid application type');
}

export async function approveApplication(userId, type) {
  if (type === 'lawyer') {
    const profile = await repo.getLawyerProfile(userId);
    if (!profile) throw new Error('Lawyer application not found');
    if (profile.verification_stat !== 'pending') {
      throw new Error(`Cannot approve lawyer application in status: ${profile.verification_stat}`);
    }
    await repo.setLawyerVerificationStatus(userId, 'verified');
    return {
      success: true,
      userId,
      type,
      status: 'verified',
      verificationStatus: 'Approved',
      canReapply: false,
      nextStep: 'dashboard',
    };
  }

  if (type === 'ca') {
    const profile = await repo.getCAProfile(userId);
    if (!profile) throw new Error('CA application not found');
    if (profile.verification_stat !== 'pending') {
      throw new Error(`Cannot approve CA application in status: ${profile.verification_stat}`);
    }
    await repo.setCAVerificationStatus(userId, 'verified');
    return {
      success: true,
      userId,
      type,
      status: 'verified',
      verificationStatus: 'Approved',
      canReapply: false,
      nextStep: 'dashboard',
    };
  }

  throw new Error('Invalid application type');
}

export async function rejectApplication(userId, type) {
  if (type === 'lawyer') {
    const profile = await repo.getLawyerProfile(userId);
    if (!profile) throw new Error('Lawyer application not found');
    if (profile.verification_stat === 'rejected') {
      return {
        success: true,
        userId,
        type,
        status: 'rejected',
        verificationStatus: 'Rejected',
        canReapply: true,
        canApplyAsLawyer: true,
        nextStep: 'complete_lawyer_application',
        message: 'Your lawyer application was rejected. You can update your details and apply for verification again.',
      };
    }
    if (profile.verification_stat !== 'pending') {
      throw new Error(`Cannot reject lawyer application in status: ${profile.verification_stat}`);
    }
    await repo.setLawyerVerificationStatus(userId, 'rejected');
    return {
      success: true,
      userId,
      type,
      status: 'rejected',
      verificationStatus: 'Rejected',
      canReapply: true,
      canApplyAsLawyer: true,
      nextStep: 'complete_lawyer_application',
      message: 'Your lawyer application was rejected. You can update your details and apply for verification again.',
    };
  }

  if (type === 'ca') {
    const profile = await repo.getCAProfile(userId);
    if (!profile) throw new Error('CA application not found');
    if (profile.verification_stat === 'rejected') {
      return {
        success: true,
        userId,
        type,
        status: 'rejected',
        verificationStatus: 'Rejected',
        canReapply: true,
        canApplyAsCA: true,
        nextStep: 'complete_ca_application',
        message: 'Your CA application was rejected. You can update your details and apply for verification again.',
      };
    }
    if (profile.verification_stat !== 'pending') {
      throw new Error(`Cannot reject CA application in status: ${profile.verification_stat}`);
    }
    await repo.setCAVerificationStatus(userId, 'rejected');
    return {
      success: true,
      userId,
      type,
      status: 'rejected',
      verificationStatus: 'Rejected',
      canReapply: true,
      canApplyAsCA: true,
      nextStep: 'complete_ca_application',
      message: 'Your CA application was rejected. You can update your details and apply for verification again.',
    };
  }

  throw new Error('Invalid application type');
}
