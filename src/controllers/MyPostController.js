const mongoose = require("mongoose");
const Group = require("../models/Group.js");
const Post = require("../models/Post");
const ClubRequest = require("../models/ClubRequest.js");
const {
  VALID_ACTIVITY_ROLES,
  VALID_ACTIVITY_STATUSES,
  buildClubStatusMatch,
  buildActivityPostRow,
  activityPostEnrichmentStages,
  buildJoinedRoleAggregatePipeline,
  filterActivityPostsByRole,
} = require("../utils/activityPost.js");

async function resolveMemberProductIds(userIdObjectId) {
  const groups = await Group.find({ members: userIdObjectId })
    .select("productId")
    .lean();

  const ids = new Set();
  for (const group of groups) {
    if (!group?.productId) continue;
    const id = group.productId.toString();
    if (mongoose.Types.ObjectId.isValid(id)) {
      ids.add(id);
    }
  }
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
}

async function resolveJoinedAndPendingProductIds(userIdObjectId) {
  const [memberIds, pendingIds] = await Promise.all([
    resolveMemberProductIds(userIdObjectId),
    ClubRequest.find({ requester: userIdObjectId, status: "pending" })
      .distinct("postId"),
  ]);

  const merged = new Set([
    ...memberIds.map((id) => id.toString()),
    ...pendingIds.map((id) => id.toString()),
  ]);

  return [...merged]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

exports.getUserPosts = async (req, res) => {
  try {
    const userId = req.User._id;
    const { lon, lat, status, role = "created", page = 1, limit = 50 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const normalizedRole = String(role).toLowerCase();

    if (
      isNaN(parsedLat) ||
      isNaN(parsedLon) ||
      isNaN(parsedPage) ||
      isNaN(parsedLimit)
    ) {
      return res.status(400).json({ success: false, message: "Invalid parameters" });
    }

    if (!VALID_ACTIVITY_ROLES.includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Use one of: ${VALID_ACTIVITY_ROLES.join(", ")}`,
      });
    }
    const postTypeParam = String(req.query.post_type || "").toLowerCase();
    if (postTypeParam && !["standard", "rapid"].includes(postTypeParam)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post_type. Use "standard" or "rapid".',
      });
    }
    // $ne so older posts without a post_type still count as normal deals
    const postTypeMatch =
      postTypeParam === "rapid"
        ? { post_type: "rapid" }
        : postTypeParam === "standard"
          ? { post_type: { $ne: "rapid" } }
          : {};

    if (status && !VALID_ACTIVITY_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Use one of: ${VALID_ACTIVITY_STATUSES.join(", ")}`,
      });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);

    let roleMatch = {};
    if (normalizedRole === "created") {
      roleMatch = { userId: userIdObjectId };
    } else if (normalizedRole === "transferred") {
      roleMatch = {
        postOwnerId: userIdObjectId,
        userId: { $ne: userIdObjectId },
      };
    } else {
      const joinedProductIds = await resolveJoinedAndPendingProductIds(
        userIdObjectId,
      );
      if (joinedProductIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No posts found",
          role: normalizedRole,
          posts: [],
          currentPage: parsedPage,
        });
      }
      roleMatch = {
        _id: { $in: joinedProductIds },
        postOwnerId: { $ne: userIdObjectId },
      };
    }
    roleMatch = { ...roleMatch, ...postTypeMatch };
    const statusMatch = buildClubStatusMatch(status);

    const aggregatePipeline =
      normalizedRole === "joined"
        ? buildJoinedRoleAggregatePipeline({
            roleMatch,
            statusMatch,
            userIdObjectId,
            parsedPage,
            parsedLimit,
          })
        : [
            {
              $geoNear: {
                near: { type: "Point", coordinates: [parsedLon, parsedLat] },
                distanceField: "distance",
                spherical: true,
                maxDistance: 4500000000,
                key: "store_location.coordinates",
              },
            },
            {
              $match: {
                deletedAt: null,
                ...roleMatch,
                ...statusMatch,
              },
            },
            ...activityPostEnrichmentStages(userIdObjectId),
            { $skip: (parsedPage - 1) * parsedLimit },
            { $limit: parsedLimit },
          ];

    const posts = await Post.aggregate(aggregatePipeline);

    let modifiedPosts = posts.map((post) =>
      buildActivityPostRow(post, {
        role: normalizedRole,
        viewerUserId: userId,
      }),
    );
    modifiedPosts = filterActivityPostsByRole(
      modifiedPosts,
      normalizedRole,
      userId,
    );

    res.status(200).json({
      success: true,
      message:
        modifiedPosts.length > 0
          ? "Posts fetched successfully"
          : "No posts found",
      role: normalizedRole,
      posts: modifiedPosts,
      currentPage: parsedPage,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
