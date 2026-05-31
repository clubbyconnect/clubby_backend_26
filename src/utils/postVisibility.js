const { memberIdString } = require("./groupMembership.js");
const { isPostOwner } = require("./postOwnership.js");

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

function isGroupAdmin(group, userId) {
  if (!group?.adminId) return false;
  return memberIdString(group.adminId) === String(userId);
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

module.exports = {
  INACTIVE_OR_WRAPPED_STATUSES,
  buildExcludeOwnPostsMatch,
  buildPublicFeedPostMatch,
  canViewInactivePostDetails,
  getUnavailablePostReason,
  isCurrentGroupMember,
  isInactiveOrWrappedStatus,
};
