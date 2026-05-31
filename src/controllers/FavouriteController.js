const mongoose = require("mongoose");
const User = require("../models/User.js");
const Post = require("../models/Post.js");
const {
  VALID_ACTIVITY_STATUSES,
  buildClubStatusMatch,
  buildActivityPostRow,
  activityPostEnrichmentStages,
} = require("../utils/activityPost.js");
const { buildPublicFeedPostMatch } = require("../utils/postVisibility.js");

exports.addToFavourites = async (req, res) => {
  try {
    const userId = req.User._id;
    const { productId } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ message: "User ID and Product ID are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const productIndex = user.favourites.indexOf(productId);

    if (productIndex !== -1) {
      user.favourites.splice(productIndex, 1);
      await user.save();
      return res.status(200).json({
        message: "Product removed from favourites",
        isLiked: false,
        productId,
      });
    }

    user.favourites.push(productId);
    await user.save();

    res.status(200).json({
      message: "Product added to favourites",
      isLiked: true,
      productId,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getFilteredFavoriteProducts = async (req, res) => {
  try {
    const userId = req.User._id;
    const { lat, lon, status, page = 1, limit = 10 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);

    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    if (status && !VALID_ACTIVITY_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use one of: ${VALID_ACTIVITY_STATUSES.join(", ")}`,
      });
    }

    const user = await User.findById(userId).select("favourites").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.favourites || user.favourites.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          totalItems: 0,
          currentPage: parseInt(page, 10),
          totalPages: 0,
          pageSize: parseInt(limit, 10),
        },
      });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);
    const favouriteIds = user.favourites.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const statusMatch = status
      ? { deletedAt: null, ...buildClubStatusMatch(status) }
      : buildPublicFeedPostMatch();

    const aggregatePipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [parsedLon, parsedLat] },
          distanceField: "distance",
          spherical: true,
          maxDistance: 5000000,
          key: "store_location.coordinates",
        },
      },
      {
        $match: {
          _id: { $in: favouriteIds },
          ...statusMatch,
        },
      },
      ...activityPostEnrichmentStages(userIdObjectId),
    ];
    if (!status) {
      aggregatePipeline.push({ $match: { "groupInfo.isActive": { $ne: false } } });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const countPipeline = [...aggregatePipeline, { $count: "total" }];
    const totalResult = await Post.aggregate(countPipeline);
    const total = totalResult[0]?.total ?? 0;

    aggregatePipeline.push({ $skip: skip }, { $limit: limitNum });

    const filteredFavoriteProducts = await Post.aggregate(aggregatePipeline);

    const data = filteredFavoriteProducts.map((post) => {
      const ownerId = post.postOwnerId?._id ?? post.postOwnerId;
      const isOwner = String(ownerId) === String(userId);
      const role = isOwner ? "created" : "joined";

      return buildActivityPostRow(post, {
        role,
        viewerUserId: userId,
        defaultPostStatus: isOwner ? "I Created" : undefined,
      });
    });

    res.status(200).json({
      success: true,
      data,
      pagination: {
        totalItems: total,
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        pageSize: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching filtered favorite products:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
