const DELETE_ACCOUNT_REASONS = [
  "I don't use it anymore",
  "Privacy concerns",
  "Too many notifications",
  "Found a better app",
  "Other",
];

const DELETION_GRACE_MS = 90 * 24 * 60 * 60 * 1000;

const getDeletionDaysRemaining = (user) => {
  if (!user || user.accountStatus !== "pending_deletion" || !user.deletionScheduledAt) {
    return null;
  }
  const msLeft = new Date(user.deletionScheduledAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
};

const isDeletionGraceExpired = (user) =>
  user?.accountStatus === "pending_deletion" &&
  user.deletionScheduledAt &&
  Date.now() >= new Date(user.deletionScheduledAt).getTime();

const assertLoginAllowed = (user) => {
  if (user?.deletedAt && user?.deactivatedByAdminId) {
    return {
      ok: false,
      status: 403,
      error: "Your account has been deactivated by an admin.",
    };
  }
  if (isDeletionGraceExpired(user)) {
    return {
      ok: false,
      status: 403,
      error: "Your account deletion grace period has expired.",
    };
  }
  return { ok: true };
};

const pickDeleteOtpContact = (user) => {
  const hasEmail = user.email != null && String(user.email).trim() !== "";
  const hasPhone =
    user.phoneNumber != null && String(user.phoneNumber).trim() !== "";

  if (user.emailVerified && hasEmail) {
    return { channel: "email", email: String(user.email).trim().toLowerCase() };
  }
  if (user.phoneNumberVerified && hasPhone) {
    const digits = String(user.phoneNumber).replace(/\D/g, "");
    return { channel: "sms", phoneNumber: digits };
  }
  if (hasEmail) {
    return { channel: "email", email: String(user.email).trim().toLowerCase() };
  }
  if (hasPhone) {
    const digits = String(user.phoneNumber).replace(/\D/g, "");
    return { channel: "sms", phoneNumber: digits };
  }
  return null;
};

module.exports = {
  DELETE_ACCOUNT_REASONS,
  DELETION_GRACE_MS,
  getDeletionDaysRemaining,
  isDeletionGraceExpired,
  assertLoginAllowed,
  pickDeleteOtpContact,
};
