const mongoose = require("mongoose");

/**
 * Strict ObjectId check.
 * mongoose.Types.ObjectId.isValid is too permissive — it returns true for any
 * 12-char string or 24-char hex. This helper additionally re-stringifies the
 * casted value and compares it back to the original input, so only canonical
 * 24-char hex strings (or actual ObjectId instances) pass.
 */
const isValidObjectId = (v) => {
  if (v === null || v === undefined) return false;
  const str = String(v);
  if (!mongoose.Types.ObjectId.isValid(str)) return false;
  return String(new mongoose.Types.ObjectId(str)) === str;
};

const USERNAME_PATTERN = /^[a-zA-Z0-9._]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;

const parseUsername = (userName) => {
  if (userName == null || String(userName).trim() === "") {
    return { ok: false, message: "userName is required" };
  }

  const trimmed = String(userName).trim();

  if (
    trimmed.length < USERNAME_MIN_LENGTH ||
    trimmed.length > USERNAME_MAX_LENGTH
  ) {
    return {
      ok: false,
      message: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`,
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message:
        "Username can only contain letters, numbers, periods, and underscores",
    };
  }

  return { ok: true, trimmed, userNameLower: trimmed.toLowerCase() };
};

const EMAIL_PATTERN = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

const parseEmail = (email) => {
  if (email == null || String(email).trim() === "") {
    return { ok: false, message: "email is required" };
  }

  const trimmed = String(email).trim().toLowerCase();

  if (!EMAIL_PATTERN.test(trimmed)) {
    return {
      ok: false,
      message: "Please enter a valid email address",
    };
  }

  return { ok: true, trimmed, emailLower: trimmed };
};

module.exports = { isValidObjectId, parseUsername, parseEmail };
