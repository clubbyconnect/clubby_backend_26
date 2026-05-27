const { getUserMembership, memberIdString } = require("./groupMembership.js");

const MAX_JOIN_ATTEMPTS = 2;

const REJOIN_WARNING_MESSAGE =
  "You were part of this club but left. You can request to join again — this is your second and final chance. If you leave again, this post will no longer appear on your home feed.";

const EXHAUSTED_REJOIN_MESSAGE =
  "You have already used both chances to join this club. This post will not appear on your home feed.";

function getLeftEntry(group, userId) {
  const uid = String(userId);
  return (group?.leftMembers || []).find(
    (entry) => memberIdString(entry.user) === uid,
  );
}

/** @returns {{ isLeft: boolean, leaveCount: number, canRejoin: boolean, feedHidden: boolean, leftAt: Date|null }} */
function getUserLeftInfo(group, userId) {
  const membership = getUserMembership(group, userId);
  if (membership.status !== "left") {
    return {
      isLeft: false,
      leaveCount: 0,
      canRejoin: true,
      feedHidden: false,
      leftAt: null,
    };
  }

  const entry = getLeftEntry(group, userId);
  const leaveCount = entry?.leaveCount ?? 1;

  return {
    isLeft: true,
    leaveCount,
    canRejoin: leaveCount < MAX_JOIN_ATTEMPTS,
    feedHidden: leaveCount >= MAX_JOIN_ATTEMPTS,
    leftAt: entry?.leftAt ?? membership.leftAt ?? null,
  };
}

function isGroupMember(group, userId) {
  const uid = String(userId);
  return (group?.members || []).some(
    (member) => memberIdString(member) === uid,
  );
}

function isGroupAdmin(group, userId) {
  if (!group?.adminId) return false;
  return memberIdString(group.adminId) === String(userId);
}

/**
 * Visitor-facing request UI on post detail.
 * Overrides stale "accepted" when user is no longer in members.
 * Post owners / group admins never receive join-request visitor status.
 */
function resolveVisitorRequestState(group, userId, clubRequest, options = {}) {
  if (options.isPostOwner || (group && isGroupAdmin(group, userId))) {
    return {
      requestStatus: null,
      membershipStatus: "active",
      leaveCount: 0,
      canRejoin: true,
      feedHidden: false,
      rejoinMessage: null,
    };
  }
  if (!group) {
    return {
      requestStatus: clubRequest?.status ?? null,
      membershipStatus: "none",
      leaveCount: 0,
      canRejoin: true,
      feedHidden: false,
      rejoinMessage: null,
    };
  }

  const membership = getUserMembership(group, userId);
  if (membership.status === "active" || isGroupMember(group, userId)) {
    return {
      requestStatus: null,
      membershipStatus: "active",
      leaveCount: 0,
      canRejoin: true,
      feedHidden: false,
      rejoinMessage: null,
    };
  }

  const leftInfo = getUserLeftInfo(group, userId);

  if (leftInfo.isLeft) {
    if (!leftInfo.canRejoin) {
      return {
        requestStatus: "exhausted",
        membershipStatus: "left",
        leaveCount: leftInfo.leaveCount,
        canRejoin: false,
        feedHidden: true,
        rejoinMessage: EXHAUSTED_REJOIN_MESSAGE,
      };
    }

    return {
      requestStatus: clubRequest?.status === "pending" ? "pending" : null,
      membershipStatus: "left",
      leaveCount: leftInfo.leaveCount,
      canRejoin: true,
      feedHidden: false,
      rejoinMessage: REJOIN_WARNING_MESSAGE,
    };
  }

  return {
    requestStatus: clubRequest?.status ?? null,
    membershipStatus: "none",
    leaveCount: 0,
    canRejoin: true,
    feedHidden: false,
    rejoinMessage: null,
  };
}

async function getFeedExcludedPostIds(userId, Group) {
  const userObjectId =
    typeof userId === "string"
      ? require("mongoose").Types.ObjectId.createFromHexString(userId)
      : userId;

  const groups = await Group.find({
    "leftMembers.user": userObjectId,
  }).select("productId leftMembers");

  return groups
    .filter((group) => {
      const entry = getLeftEntry(group, userObjectId);
      if (!entry || entry.rejoinedAt) {
        return false;
      }
      return (entry.leaveCount ?? 1) >= MAX_JOIN_ATTEMPTS;
    })
    .map((group) => group.productId);
}

module.exports = {
  MAX_JOIN_ATTEMPTS,
  REJOIN_WARNING_MESSAGE,
  EXHAUSTED_REJOIN_MESSAGE,
  getUserLeftInfo,
  resolveVisitorRequestState,
  getFeedExcludedPostIds,
  isGroupMember,
  isGroupAdmin,
};
