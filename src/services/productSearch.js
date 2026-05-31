const PostModel = require("../models/Post.js");
const User = require("../models/User.js");
const Group = require("../models/Group.js");
const mongoose = require("mongoose");
const { getFeedExcludedPostIds } = require("../utils/clubRejoin.js");
const crypto = require("crypto");
const { isValidObjectId } = require("../utils/validators.js");
const { withProductThumb } = require("../utils/imageUrls.js");
const {
  buildExcludeOwnPostsMatch,
  buildPublicFeedPostMatch,
} = require("../utils/postVisibility.js");

async function executeProductSearch(userId, query, options = {}) {
  const {
    productName,
    lon,
    lat,
    gender,
    date,
    offerType,
    clubMembers,
    size,
    sortBy,
    rangeLat,
    rangeLon,
    rangeRadius,
    category,
    subCategory,
    page = 1,
    limit = 30,
  } = query;

  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (parsedPage - 1) * parsedLimit;
  const isDiscovery = !productName || String(productName).trim() === "";
  const userObjectId =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(userId);

  const userDoc = await User.findById(userId).select("favourites").lean();
  const favouriteIds = (userDoc?.favourites || []).map((id) =>
    id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id),
  );

  let matchStage = {
    ...buildPublicFeedPostMatch(),
    ...buildExcludeOwnPostsMatch(userObjectId),
  };

  const excludedPostIds = await getFeedExcludedPostIds(userId, Group);
  if (excludedPostIds.length > 0) {
    matchStage._id = { $nin: excludedPostIds };
  }

  const aggregatePipeline = [];

  if ((rangeLat && rangeLon && rangeRadius) || (lon && lat)) {
    const latitude = parseFloat(rangeLat || lat);
    const longitude = parseFloat(rangeLon || lon);
    let kmRadius = parseFloat(rangeRadius) || 2000;

    if (!isNaN(latitude) && !isNaN(longitude)) {
      kmRadius = Math.max(1, Math.min(kmRadius, 2000));
      const radiusInMeters = kmRadius * 1000;

      aggregatePipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          key: "store_location.coordinates",
        },
      });
    }
  }

  if (productName) {
    matchStage.itemName = { $regex: productName, $options: "i" };
  }

  if (offerType) {
    matchStage.offerType = { $in: offerType.split(",").map((type) => type.trim()) };
  }

  if (clubMembers) {
    matchStage.clubMembers = parseInt(clubMembers, 10);
  }

  if (size) {
    matchStage.size = size;
  }

  if (date) {
    const dateStr = String(date).trim();
    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (dayMatch) {
      const year = parseInt(dayMatch[1], 10);
      const month = parseInt(dayMatch[2], 10) - 1;
      const day = parseInt(dayMatch[3], 10);
      const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const now = new Date();
      const startOfTomorrowUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
      );
      const oldestAllowedUtc = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0, 0),
      );
      if (startDate >= startOfTomorrowUtc || startDate < oldestAllowedUtc) {
        matchStage.createdAt = { $gte: startOfTomorrowUtc, $lt: startOfTomorrowUtc };
      } else {
        const endDate = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
        matchStage.createdAt = { $gte: startDate, $lt: endDate };
      }
    } else {
      const startDate = new Date(dateStr);
      if (!isNaN(startDate.getTime())) {
        matchStage.createdAt = { $gte: startDate };
      }
    }
  }

  if (category) {
    if (!isValidObjectId(category)) {
      return {
        error: {
          status: 400,
          body: {
            success: false,
            message: "Invalid category id",
            received: { category },
          },
        },
      };
    }
    matchStage.category = new mongoose.Types.ObjectId(category);
  }

  if (subCategory) {
    if (!isValidObjectId(subCategory)) {
      return {
        error: {
          status: 400,
          body: {
            success: false,
            message: "Invalid subCategory id",
            received: { subCategory },
          },
        },
      };
    }
    matchStage.subCategory = new mongoose.Types.ObjectId(subCategory);
  }

  if (Object.keys(matchStage).length > 0) {
    aggregatePipeline.push({ $match: matchStage });
  }

  const genderFilter =
    gender && String(gender).trim() !== "" && String(gender).trim() !== "Any"
      ? String(gender).trim()
      : null;
  if (genderFilter) {
    aggregatePipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "postOwnerId",
          foreignField: "_id",
          as: "postOwner",
        },
      },
      { $unwind: "$postOwner" },
      { $match: { "postOwner.gender": genderFilter } },
    );
  }

  aggregatePipeline.push(
    {
      $lookup: {
        from: "groups",
        let: { productId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$productId", "$$productId"] } } },
          { $project: { members: 1, isActive: 1 } },
        ],
        as: "groupInfo",
      },
    },
    { $unwind: { path: "$groupInfo", preserveNullAndEmptyArrays: true } },
    { $match: { "groupInfo.isActive": { $ne: false } } },
  );

  aggregatePipeline.push({
    $addFields: {
      clubToJoin: {
        $cond: {
          if: { $isArray: "$groupInfo.members" },
          then: { $subtract: ["$clubMembers", { $size: "$groupInfo.members" }] },
          else: { $subtract: ["$clubMembers", 1] },
        },
      },
    },
  });

  if (isDiscovery) {
    aggregatePipeline.push({ $match: { clubToJoin: { $gt: 0 } } });
  }

  aggregatePipeline.push({
    $project: {
      _id: 1,
      itemName: 1,
      price: 1,
      createdAt: 1,
      productImage: 1,
      distance: {
        $cond: [
          { $ifNull: ["$distance", false] },
          { $divide: ["$distance", 1000] },
          "$$REMOVE",
        ],
      },
      clubMembers: 1,
      clubToJoin: 1,
      location: { $ifNull: ["$store_location.name", "Unknown"] },
      isLiked: { $in: ["$_id", favouriteIds] },
    },
  });

  const sortOptions = {};
  if (sortBy === "price_high_to_low") {
    sortOptions.price = -1;
  } else if (sortBy === "price_low_to_high") {
    sortOptions.price = 1;
  } else if (sortBy === "newest" || (isDiscovery && !sortBy)) {
    sortOptions.createdAt = -1;
  } else if (sortBy === "distance") {
    sortOptions.distance = 1;
  }
  if (Object.keys(sortOptions).length > 0) {
    aggregatePipeline.push({ $sort: sortOptions });
  }

  aggregatePipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [{ $skip: skip }, { $limit: parsedLimit }],
    },
  });

  const [facetResult] = await PostModel.aggregate(aggregatePipeline);
  const totalProducts = facetResult?.metadata?.[0]?.total ?? 0;
  const totalPages = Math.ceil(totalProducts / parsedLimit) || 1;
  const products = (facetResult?.data ?? []).map(withProductThumb);

  const pagination = {
    totalItems: totalProducts,
    totalPages,
    currentPage: parsedPage,
    itemsPerPage: parsedLimit,
  };

  const etagSource = JSON.stringify({
    q: query,
    total: totalProducts,
    ids: products.map((p) => String(p._id)),
  });
  const etag = `"${crypto.createHash("md5").update(etagSource).digest("hex")}"`;
  const ifNoneMatch = options.ifNoneMatch;
  if (!options.skip304 && ifNoneMatch && ifNoneMatch === etag) {
    return { products: [], pagination, etag, notModified: true };
  }

  return { products, pagination, etag, notModified: false };
}

module.exports = { executeProductSearch };
