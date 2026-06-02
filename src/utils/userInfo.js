/**
 * Normalizes user documents for API `userInfo` payloads.
 * Ensures signupMethod and verification flags are always accurate.
 */
function toUserInfo(user, { includeAuthIds = false } = {}) {
  if (!user) return null;

  const raw = typeof user.toObject === "function" ? user.toObject() : { ...user };
  delete raw.password;
  delete raw.refreshToken;

  const hasPhone =
    raw.phoneNumber != null && String(raw.phoneNumber).trim() !== "";

  const signupMethod =
    raw.signupMethod === "phone" || raw.signupMethod === "email"
      ? raw.signupMethod
      : "email";

  const userInfo = {
    ...raw,
    signupMethod,
    emailVerified: raw.emailVerified === true,
    phoneNumberVerified: hasPhone && raw.phoneNumberVerified === true,
  };

  if (!includeAuthIds) {
    delete userInfo.googleAuthId;
    delete userInfo.appleAuthId;
  }

  delete userInfo.otpSkipped;

  return userInfo;
}

module.exports = { toUserInfo };
