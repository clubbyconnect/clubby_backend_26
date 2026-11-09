const { isPostOwner } = require("./postOwnership.js");
const { getUserMembership } = require("./groupMembership.js");

const VALID_ACTIVITY_ROLES = ["created", "joined", "transferred"];
const VALID_ACTIVITY_STATUSES = ["Active", "Inactive"];

function normalizeClubStatus(clubStatus) {
  if (clubStatus === "Created") return "Active";
  if (clubStatus === "WrapDeal" || clubStatus === "Wrap") return "Inactive";
  return clubStatus;
}

function buildClubStatusMatch(status) {
  if (!status) return {};
  if (status === "Active") {
    return { clubStatus: { $in: ["Active", "Created"] } };
  }
  if (status === "Inactive") {
    return { clubStatus: { $in: ["Inactive", "WrapDeal", "Wrap"] } };
  }
  return {};
}

/**
 * Shared card shape for My Posts, Join Requested, New Admin, Liked Posts.
 */
function buildActivityPostRow(post, options = {}) {
  const {
    role = "created",
    viewerUserId,
    defaultPostStatus,
  } = options;

  const clubStatus = normalizeClubStatus(post.clubStatus);
  const memberCount = post.memberCount ?? 0;
  const clubMembers = post.clubMembers ?? 0;
  const spotsOpen =
    post.spotsOpen ?? Math.max(0, clubMembers - memberCount);
  const isFull = post.isFull ?? spotsOpen <= 0;
  const pendingRequestCount = post.pendingRequestCount ?? 0;
  const viewerIsPostOwner = isPostOwner(post, viewerUserId);
  // Join Requested never shows Manage; created + transferred owners always can.
  const canManageRequests =
    role === "joined"
      ? false
      : viewerIsPostOwner || Boolean(post.canManageRequests);

  let membershipStatus = "none";
  if (post.groupInfo) {
    membershipStatus = getUserMembership(post.groupInfo, viewerUserId).status;
  }

  // Aggregation / accept flow: members win over stale leftMembers (ex-creator rejoin)
  if (post.isGroupMember === true) {
    membershipStatus = "active";
  } else if (post.isViewerLeft === true) {
    membershipStatus = "left";
  }

  const isGroupMember =
    post.isGroupMember === true || membershipStatus === "active";

  let requestStatus = post.requestStatus ?? null;
  if (isGroupMember) {
    requestStatus = "accepted";
  } else if (membershipStatus === "left") {
    const clubStatus = String(
      post.viewerRequestStatus ?? requestStatus ?? "",
    ).toLowerCase();
    if (clubStatus === "pending" || clubStatus === "exhausted") {
      requestStatus = clubStatus;
    } else if (requestStatus !== "pending" && requestStatus !== "exhausted") {
      requestStatus = post.viewerRequestStatus ?? requestStatus;
    }
  }

  const postStatusByRole = {
    created: "I Created",
    joined: "I Joined",
    transferred: "Admin Transferred",
  };

  let postStatus = defaultPostStatus ?? postStatusByRole[role] ?? post.postStatus;
  if (role === "joined") {
    if (requestStatus === "pending") {
      postStatus = "Pending";
    } else if (requestStatus === "accepted" || isGroupMember) {
      postStatus = "I Joined";
    }
  }

  return {
    _id: post._id,
    userId: post.userId,
    postOwnerId: post.postOwnerId,
    itemName: post.itemName,
    postStatus,
    clubStatus,
    status: clubStatus,
    createdAt: post.createdAt,
    distance: post.distance,
    categoryName: post.categoryName,
    categoryImage: post.categoryImage,
    subCategoryName: post.subCategoryName,
    subCategoryImage: post.subCategoryImage,
    groupInfo: post.groupInfo,
    groupId: post.groupId ?? post.groupInfo?._id ?? null,
    size: post.size,
    store_location: post.store_location,
    additionalInformation: post.additionalInformation,
    clubMembers,
    clubToJoin: post.clubToJoin ?? spotsOpen,
    memberCount,
    spotsOpen,
    isFull,
    memberCapacityLabel: `${memberCount}/${clubMembers}`,
    pendingRequestCount,
    hasPendingRequests: pendingRequestCount > 0,
    canManageRequests,
    isPostOwner: viewerIsPostOwner,
    isGroupMember,
    requestStatus,
    membershipStatus,
    productImage: post.productImage,
    price: post.price,
    price_type: post.price_type,
    offerType: post.offerType,
    expiryAt: post.expiryAt,
    post_type: post.post_type,
    location:
      post.location ??
      post.store_location?.name ??
      (typeof post.store_location === "string" ? post.store_location : undefined),
  };
}

/** Reusable aggregation stages after initial $match */
function activityPostEnrichmentStages(userIdObjectId) {
  return [
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryDetails",
      },
    },
    { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "subcategories",
        localField: "subCategory",
        foreignField: "_id",
        as: "subCategoryDetails",
      },
    },
    { $unwind: { path: "$subCategoryDetails", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "groups",
        localField: "_id",
        foreignField: "productId",
        as: "groupInfo",
      },
    },
    { $unwind: { path: "$groupInfo", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "clubrequests",
        let: { postId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$postId", "$$postId"] },
                  { $eq: ["$requester", userIdObjectId] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "viewerClubRequest",
      },
    },
    {
      $lookup: {
        from: "clubrequests",
        let: { postId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$postId", "$$postId"] },
              status: "pending",
            },
          },
          { $count: "count" },
        ],
        as: "ownerPendingRequests",
      },
    },
    {
      $addFields: {
        memberCount: { $size: { $ifNull: ["$groupInfo.members", []] } },
        isViewerLeft: {
          $and: [
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$groupInfo.leftMembers", []] },
                      as: "lm",
                      cond: {
                        $eq: [
                          { $toString: "$$lm.user" },
                          { $toString: userIdObjectId },
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
            {
              $not: {
                $in: [
                  userIdObjectId,
                  { $ifNull: ["$groupInfo.members", []] },
                ],
              },
            },
          ],
        },
        viewerRequestStatus: {
          $arrayElemAt: ["$viewerClubRequest.status", 0],
        },
        pendingRequestCount: {
          $ifNull: [{ $arrayElemAt: ["$ownerPendingRequests.count", 0] }, 0],
        },
        groupId: "$groupInfo._id",
        canManageRequests: {
          $eq: [
            { $toString: "$postOwnerId" },
            { $toString: userIdObjectId },
          ],
        },
      },
    },
    {
      $addFields: {
        isGroupMember: {
          $cond: {
            if: "$isViewerLeft",
            then: false,
            else: {
              $in: [userIdObjectId, { $ifNull: ["$groupInfo.members", []] }],
            },
          },
        },
        requestStatus: {
          $cond: {
            if: {
              $and: [
                { $in: [userIdObjectId, { $ifNull: ["$groupInfo.members", []] }] },
                { $not: "$isViewerLeft" },
              ],
            },
            then: "accepted",
            else: "$viewerRequestStatus",
          },
        },
        spotsOpen: {
          $max: [0, { $subtract: ["$clubMembers", "$memberCount"] }],
        },
      },
    },
    {
      $addFields: {
        isFull: { $lte: ["$spotsOpen", 0] },
        clubToJoin: "$spotsOpen",
      },
    },
    {
      $project: {
        _id: 1,
        userId: 1,
        postOwnerId: 1,
        itemName: 1,
        createdAt: 1,
        price: 1,
        price_type: 1,
        offerType: 1,
        expiryAt: 1,
        post_type: 1,
        store_location: 1,
        productImage: 1,
        categoryName: "$categoryDetails.name",
        categoryImage: "$categoryDetails.image",
        subCategoryName: "$subCategoryDetails.name",
        subCategoryImage: "$subCategoryDetails.image",
        location: { $ifNull: ["$store_location.name", ""] },
        distance: {
          $cond: {
            if: { $lt: ["$distance", 1] },
            then: 0,
            else: { $divide: ["$distance", 1000] },
          },
        },
        groupInfo: 1,
        groupId: 1,
        size: 1,
        additionalInformation: 1,
        clubStatus: 1,
        clubMembers: 1,
        clubToJoin: 1,
        memberCount: 1,
        spotsOpen: 1,
        isFull: 1,
        pendingRequestCount: 1,
        canManageRequests: 1,
        isGroupMember: 1,
        requestStatus: 1,
        viewerRequestStatus: 1,
        isViewerLeft: 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ];
}

/** Join Requested must include pending rejoin rows even without geo index on the post. */
function buildJoinedRoleAggregatePipeline({
  roleMatch,
  statusMatch,
  userIdObjectId,
  parsedPage,
  parsedLimit,
}) {
  return [
    {
      $match: {
        deletedAt: null,
        ...roleMatch,
        ...statusMatch,
      },
    },
    ...activityPostEnrichmentStages(userIdObjectId),
    {
      $addFields: {
        distance: { $literal: 0 },
      },
    },
    { $skip: (parsedPage - 1) * parsedLimit },
    { $limit: parsedLimit },
  ];
}

function isExCreatorNotOwner(post, viewerUserId) {
  const viewer = String(viewerUserId);
  const creatorId = String(post.userId?._id ?? post.userId ?? "");
  const ownerId = String(post.postOwnerId?._id ?? post.postOwnerId ?? "");
  return (
    creatorId === viewer &&
    ownerId !== "" &&
    ownerId !== viewer
  );
}

function hasPendingJoinRequest(post) {
  const requestStatus = String(post.requestStatus ?? "").toLowerCase();
  const postStatus = String(post.postStatus ?? "").toLowerCase();
  return (
    requestStatus === "pending" ||
    postStatus === "pending" ||
    postStatus === "requested"
  );
}

/** My post = still owner, or non-transferred creator only — never ex-creator archive. */
function shouldIncludeOnCreatedActivityRow(post, viewerUserId) {
  const viewer = String(viewerUserId);
  if (String(post.userId?._id ?? post.userId) !== viewer) {
    return false;
  }
  if (isExCreatorNotOwner(post, viewer)) {
    return false;
  }
  if (String(post.postOwnerId?._id ?? post.postOwnerId) === viewer) {
    return true;
  }
  if (hasPendingJoinRequest(post) || post.isGroupMember === true) {
    return false;
  }
  return true;
}

function filterActivityPostsByRole(posts, role, viewerUserId) {
  if (role === "created") {
    return posts.filter((post) =>
      shouldIncludeOnCreatedActivityRow(post, viewerUserId),
    );
  }
  return posts;
}

module.exports = {
  VALID_ACTIVITY_ROLES,
  VALID_ACTIVITY_STATUSES,
  normalizeClubStatus,
  buildClubStatusMatch,
  buildActivityPostRow,
  activityPostEnrichmentStages,
  buildJoinedRoleAggregatePipeline,
  filterActivityPostsByRole,
};
