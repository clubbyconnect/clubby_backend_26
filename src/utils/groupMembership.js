const mongoose = require("mongoose");

function memberIdString(member) {
  return String(member?._id ?? member);
}

/** @returns {{ status: 'active'|'left'|'none', leftAt: Date|null }} */
function getUserMembership(group, userId) {
  const uid = String(userId);
  const isMember = (group.members || []).some(
    (member) => memberIdString(member) === uid,
  );
  if (isMember) {
    return { status: "active", leftAt: null };
  }

  const leftEntry = (group.leftMembers || []).find(
    (entry) => memberIdString(entry.user) === uid,
  );
  if (leftEntry) {
    return { status: "left", leftAt: leftEntry.leftAt || null };
  }

  return { status: "none", leftAt: null };
}

function appendMembershipEvent(entry, event) {
  if (!entry.membershipHistory) {
    entry.membershipHistory = [];
  }
  entry.membershipHistory.push({
    event,
    at: new Date(),
  });
}

function getLeftMemberEntry(group, userId) {
  const uid = String(userId);
  return (group.leftMembers || []).find(
    (entry) => memberIdString(entry.user) === uid,
  );
}

/**
 * Audit helper — detect leave/rejoin cycles on the same Group document.
 * @returns {{ leaveCount, rejoinCount, wasInClubTwice, membershipStints, history, leftAt, rejoinedAt }}
 */
function getMembershipAudit(group, userId) {
  const membership = getUserMembership(group, userId);
  const entry = getLeftMemberEntry(group, userId);
  const history = entry?.membershipHistory ?? [];
  const rejoinCount = history.filter((h) => h.event === "rejoined").length;
  const leaveCount = entry?.leaveCount ?? 0;

  const activeStint = membership.status === "active" ? 1 : 0;
  const membershipStints = rejoinCount + activeStint;

  return {
    leaveCount,
    rejoinCount,
    wasInClubTwice: rejoinCount >= 1,
    membershipStints,
    history,
    leftAt: entry?.leftAt ?? membership.leftAt ?? null,
    rejoinedAt: entry?.rejoinedAt ?? null,
    currentlyActive: membership.status === "active",
    currentlyLeft: membership.status === "left",
  };
}

/** Keeps leaveCount so a second leave can mark the user as exhausted. */
function markUserRejoined(group, userObjectId) {
  const uid = userObjectId.toString();
  const existing = getLeftMemberEntry(group, userObjectId);
  if (existing) {
    const now = new Date();
    existing.rejoinedAt = now;
    appendMembershipEvent(existing, "rejoined");
    console.info("[membership] rejoined", {
      groupId: String(group._id),
      userId: uid,
      leaveCount: existing.leaveCount,
      rejoinCount: (existing.membershipHistory || []).filter(
        (h) => h.event === "rejoined",
      ).length,
    });
  }
}

function recordUserLeft(group, userObjectId) {
  const uid = userObjectId.toString();
  const existing = (group.leftMembers || []).find(
    (entry) => memberIdString(entry.user) === uid,
  );

  if (existing) {
    existing.leftAt = new Date();
    existing.leaveCount = (existing.leaveCount ?? 1) + 1;
    delete existing.rejoinedAt;
    appendMembershipEvent(existing, "left");
    console.info("[membership] left", {
      groupId: String(group._id),
      userId: uid,
      leaveCount: existing.leaveCount,
    });
  } else {
    if (!group.leftMembers) {
      group.leftMembers = [];
    }
    const leftAt = new Date();
    const row = {
      user: userObjectId,
      leftAt,
      leaveCount: 1,
      membershipHistory: [{ event: "left", at: leftAt }],
    };
    group.leftMembers.push(row);
    console.info("[membership] left (first)", {
      groupId: String(group._id),
      userId: uid,
      leaveCount: 1,
    });
  }

  group.members = (group.members || []).filter(
    (member) => !new mongoose.Types.ObjectId(member?._id ?? member).equals(userObjectId),
  );
}

const LEFT_GROUP_PREVIEW = "You're no longer part of this group";
const LEFT_GROUP_LABEL = "Left group";

module.exports = {
  getUserMembership,
  getMembershipAudit,
  getLeftMemberEntry,
  recordUserLeft,
  markUserRejoined,
  memberIdString,
  LEFT_GROUP_PREVIEW,
  LEFT_GROUP_LABEL,
};
