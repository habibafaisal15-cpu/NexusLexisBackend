import * as repo from '../db/profileRepository.js';

function lawyerMessages(stat) {
  if (stat === 'verified') return 'Your lawyer account is verified. You can access the dashboard.';
  if (stat === 'pending') return 'Your lawyer application is under review. Dashboard access will unlock after approval.';
  if (stat === 'rejected') return 'Your lawyer application was rejected. Please resubmit the registration form.';
  return 'Account created. Complete your lawyer registration form to continue.';
}

function caMessages(stat) {
  if (stat === 'verified') return 'Your CA account is verified. You can access the dashboard.';
  if (stat === 'pending') return 'Your CA application is under review. Dashboard access will unlock after approval.';
  if (stat === 'rejected') return 'Your CA application was rejected. Please resubmit the registration form.';
  return 'Account created. Complete your CA registration form to continue.';
}

export async function getAccountAccessMeta(authUser, dashboardUser = null) {
  const role = authUser?.role || 'client';
  const userId = dashboardUser?.id;

  if (role === 'client' || role === 'admin') {
    return {
      accountRole: role,
      verificationStatus: 'Approved',
      canAccessDashboard: true,
      nextStep: 'dashboard',
      message: null,
      pendingVerificationRole: null,
    };
  }

  if (role === 'lawyer' && userId) {
    const profile = await repo.getLawyerProfile(userId);
    if (!profile) {
      return {
        accountRole: 'lawyer',
        verificationStatus: 'ApplicationRequired',
        canAccessDashboard: false,
        nextStep: 'complete_lawyer_application',
        message: lawyerMessages(null),
        pendingVerificationRole: 'Lawyer',
      };
    }
    const verification = repo.mapVerification(profile);
    const canAccess = profile.verification_stat === 'verified';
    return {
      accountRole: 'lawyer',
      verificationStatus: verification.status === 'None' ? 'ApplicationRequired' : verification.status,
      canAccessDashboard: canAccess,
      nextStep: canAccess
        ? 'dashboard'
        : profile.verification_stat === 'pending'
          ? 'verification_pending'
          : 'complete_lawyer_application',
      message: lawyerMessages(profile.verification_stat),
      pendingVerificationRole: profile.verification_stat === 'pending' ? 'Lawyer' : null,
      verificationSubmittedAt: verification.submittedAt,
      verificationReviewDeadline: verification.reviewDeadline,
    };
  }

  if (role === 'ca' && userId) {
    const profile = await repo.getCAProfile(userId);
    if (!profile) {
      return {
        accountRole: 'ca',
        verificationStatus: 'ApplicationRequired',
        canAccessDashboard: false,
        nextStep: 'complete_ca_application',
        message: caMessages(null),
        pendingVerificationRole: 'CA',
      };
    }
    const verification = repo.mapVerification(profile);
    const canAccess = profile.verification_stat === 'verified';
    return {
      accountRole: 'ca',
      verificationStatus: verification.status === 'None' ? 'ApplicationRequired' : verification.status,
      canAccessDashboard: canAccess,
      nextStep: canAccess
        ? 'dashboard'
        : profile.verification_stat === 'pending'
          ? 'verification_pending'
          : 'complete_ca_application',
      message: caMessages(profile.verification_stat),
      pendingVerificationRole: profile.verification_stat === 'pending' ? 'CA' : null,
      verificationSubmittedAt: verification.submittedAt,
      verificationReviewDeadline: verification.reviewDeadline,
    };
  }

  return {
    accountRole: role,
    verificationStatus: 'Approved',
    canAccessDashboard: true,
    nextStep: 'dashboard',
    message: null,
    pendingVerificationRole: null,
  };
}
