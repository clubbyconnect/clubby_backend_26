const { memberIdString } = require("./groupMembership.js");
const { isPostOwner } = require("./postOwnership.js");
const { isGroupAdmin } = require("./clubRejoin.js");

const INACTIVE_OR_WRAPPED_STATUSES = ["Inactive", "Wrap", "WrapDeal"];

function isInactiveOrWrappedStatus(clubStatus) {
  return INACTIVE_OR_WRAPPED_STATUSES.includes(String(clubStatus || ""));
}

function buildPublicFeedPostMatch(now = new Date()) {
  return {
    deletedAt: null,
    expiryAt: { $gte: now },
    clubStatus: { $nin: INACTIVE_OR_WRAPPED_STATUSES },
  };
}

function buildExcludeOwnPostsMatch(userObjectId) {
  return {
    $or: [
      { postOwnerId: { $exists: true, $nin: [null, userObjectId] } },
      { postOwnerId: { $exists: false }, userId: { $ne: userObjectId } },
      { postOwnerId: null, userId: { $ne: userObjectId } },
    ],
  };
}

function isCurrentGroupMember(group, userId) {
  const uid = String(userId);
  return (group?.members || []).some((member) => memberIdString(member) === uid);
}

function getUnavailablePostReason(post, group, now = new Date()) {
  if (!post) return null;
  if (post.deletedAt) {
    return {
      code: "POST_INACTIVE",
      message: "This post is no longer active.",
    };
  }
  if (post.expiryAt && new Date(post.expiryAt).getTime() < now.getTime()) {
    return {
      code: "POST_EXPIRED",
      message: "This post has expired.",
    };
  }
  if (isInactiveOrWrappedStatus(post.clubStatus)) {
    return {
      code: "POST_INACTIVE",
      message: "This post is inactive or wrapped.",
    };
  }
  if (group?.isActive === false) {
    return {
      code: "GROUP_INACTIVE",
      message: "This group is inactive.",
    };
  }
  return null;
}

function canViewInactivePostDetails(post, group, userId) {
  if (!getUnavailablePostReason(post, group)) {
    return true;
  }
  return (
    isCurrentGroupMember(group, userId) ||
    isGroupAdmin(group, userId) ||
    isPostOwner(post, userId)
  );
}

/** Post owner or group admin — same rule as Messages Manage + My post. */
function canManageClubRequests(post, group, userId) {
  return isPostOwner(post, userId) || isGroupAdmin(group, userId);
}

function postAcceptsJoinRequests(post, group, now = new Date()) {
  if (!post) return false;
  if (post.deletedAt) return false;
  if (post.deactivatedByAdminId) return false;
  if (isInactiveOrWrappedStatus(post.clubStatus)) return false;
  if (group?.isActive === false) return false;
  if (post.expiryAt && new Date(post.expiryAt).getTime() < now.getTime()) {
    return false;
  }
  return true;
}

module.exports = {
  INACTIVE_OR_WRAPPED_STATUSES,
  buildExcludeOwnPostsMatch,
  buildPublicFeedPostMatch,
  canManageClubRequests,
  canViewInactivePostDetails,
  getUnavailablePostReason,
  isCurrentGroupMember,
  isInactiveOrWrappedStatus,
  postAcceptsJoinRequests,
};
