/** Normalize mobile / JSON bodies (strings, numbers, stringified arrays). */

function asTrimmedString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isBlank(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return Number.isNaN(value);
  return false;
}

function parsePrice(value) {
  if (isBlank(value)) return { ok: false, error: "Price is required." };
  const num = typeof value === "number" ? value : Number(asTrimmedString(value));
  if (Number.isNaN(num) || num < 9) {
    return { ok: false, error: "Price must be a number of at least 9." };
  }
  return { ok: true, price: num };
}

function parseProductImages(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.filter((url) => typeof url === "string" && url.trim() !== "");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((url) => typeof url === "string" && url.trim() !== "");
      }
    } catch {
      return trimmed.startsWith("http") ? [trimmed] : [];
    }
  }
  return [];
}

module.exports = {
  asTrimmedString,
  isBlank,
  parsePrice,
  parseProductImages,
};
