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

module.exports = { isValidObjectId };
