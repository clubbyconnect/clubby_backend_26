const CategoryModel = require("../models/Category.js");
const { withCategoryThumbs } = require("./imageUrls.js");

const DEFAULT_IMAGE =
  "https://res.cloudinary.com/dlb8pmzph/image/upload/v1721381426/default%20images/y9yzagqvwgeyk2g1o0bj.png";

async function fetchNormalizedCategories() {
  const categories = await CategoryModel.aggregate([
    { $match: { deletedAt: null } },
    {
      $lookup: {
        from: "subcategories",
        let: { categoryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$category", "$$categoryId"] },
              deletedAt: null,
              name: { $not: { $regex: /^new$/i } },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              image: 1,
              category: 1,
            },
          },
        ],
        as: "subcategories",
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        image: 1,
        isPremium: 1,
        subcategories: 1,
      },
    },
  ]);

  const data = categories.map((cat) => {
    let image =
      typeof cat.image === "string" && cat.image.trim() !== ""
        ? cat.image.trim()
        : DEFAULT_IMAGE;
    if (image.startsWith("http://")) {
      image = image.replace("http://", "https://");
    }
    return withCategoryThumbs({ ...cat, image });
  });

  return {
    data,
    fetchedAt: new Date().toISOString(),
    fingerprint: buildCategoriesFingerprint(data),
  };
}

function buildCategoriesFingerprint(categories) {
  return categories
    .map((c) => {
      const subs = (c.subcategories || [])
        .map((s) => String(s._id))
        .sort()
        .join(",");
      return `${String(c._id)}:${c.name}:${subs}`;
    })
    .sort()
    .join("|");
}

module.exports = {
  fetchNormalizedCategories,
  buildCategoriesFingerprint,
  DEFAULT_IMAGE,
};
