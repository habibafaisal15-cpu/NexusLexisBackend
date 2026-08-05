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
    await repo.setLawyerVerificationStatus(userId, 'verified');
  } else if (type === 'ca') {
    await repo.setCAVerificationStatus(userId, 'verified');
  } else {
    throw new Error('Invalid application type');
  }
  return { success: true, userId, type, status: 'verified' };
}

export async function rejectApplication(userId, type) {
  if (type === 'lawyer') {
    await repo.setLawyerVerificationStatus(userId, 'rejected');
  } else if (type === 'ca') {
    await repo.setCAVerificationStatus(userId, 'rejected');
  } else {
    throw new Error('Invalid application type');
  }
  return { success: true, userId, type, status: 'rejected' };
}
