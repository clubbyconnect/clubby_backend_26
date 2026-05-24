const PRODUCT_THUMB = { width: 200, height: 200, crop: "fill", format: "webp", quality: "auto" };
const CATEGORY_THUMB = { width: 80, height: 80, crop: "fill", format: "webp", quality: "auto" };
const AVATAR_THUMB = { width: 80, height: 80, crop: "fill", format: "webp", quality: "auto" };

function buildCloudinaryTransformUrl(url, options = {}) {
  if (!url || typeof url !== "string") return url;

  const normalized = url.startsWith("http://") ? url.replace("http://", "https://") : url;
  if (!normalized.includes("res.cloudinary.com/")) return normalized;

  const {
    width = 200,
    height = 200,
    crop = "fill",
    format = "webp",
    quality = "auto",
  } = options;

  const transformation = `w_${width},h_${height},c_${crop},f_${format},q_${quality}`;
  const uploadMarker = "/upload/";
  const idx = normalized.indexOf(uploadMarker);
  if (idx === -1) return normalized;

  const prefix = normalized.slice(0, idx + uploadMarker.length);
  const afterUpload = normalized.slice(idx + uploadMarker.length);

  if (/w_\d+/.test(afterUpload.split("/")[0] || "")) {
    return normalized;
  }

  return `${prefix}${transformation}/${afterUpload}`;
}

function withProductThumb(product) {
  if (!product) return product;
  return {
    ...product,
    productImageThumb: buildCloudinaryTransformUrl(product.productImage, PRODUCT_THUMB),
  };
}

function withCategoryThumbs(category) {
  if (!category) return category;
  const image = category.image;
  return {
    ...category,
    image,
    imageThumb: buildCloudinaryTransformUrl(image, CATEGORY_THUMB),
    subcategories: (category.subcategories || []).map((sub) => ({
      ...sub,
      imageThumb: buildCloudinaryTransformUrl(sub.image, CATEGORY_THUMB),
    })),
  };
}

module.exports = {
  buildCloudinaryTransformUrl,
  withProductThumb,
  withCategoryThumbs,
  PRODUCT_THUMB,
  CATEGORY_THUMB,
  AVATAR_THUMB,
};
