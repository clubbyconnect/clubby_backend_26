/** Clothing size labels — must match JJ_Frontend src/config/clothingSizes.ts */
const CLOTHING_CATEGORY_NAME = "Clothing";

const CLOTHING_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];

/**
 * @param {string} categoryName
 * @param {string|null|undefined} size
 * @returns {{ ok: true, size: string|null } | { ok: false, error: string }}
 */
function resolvePostSize(categoryName, size) {
  const isClothing =
    typeof categoryName === "string" &&
    categoryName.trim().toLowerCase() === CLOTHING_CATEGORY_NAME.toLowerCase();

  if (!isClothing) {
    return { ok: true, size: null };
  }

  const normalized =
    typeof size === "string" ? size.trim().toUpperCase() : "";

  if (!normalized) {
    return {
      ok: false,
      error:
        "Size is required for Clothing. Allowed values: S, M, L, XL, XXL, XXXL.",
    };
  }

  if (!CLOTHING_SIZES.includes(normalized)) {
    return {
      ok: false,
      error: `Invalid clothing size "${size}". Allowed: ${CLOTHING_SIZES.join(", ")}.`,
    };
  }

  return { ok: true, size: normalized };
}

module.exports = {
  CLOTHING_CATEGORY_NAME,
  CLOTHING_SIZES,
  resolvePostSize,
};
