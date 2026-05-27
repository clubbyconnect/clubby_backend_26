/**
 * Backend activity list filter tests (ex-creator rejoin).
 * Run: node scripts/test-activity-post-filters.js
 */

const {
  filterActivityPostsByRole,
  buildActivityPostRow,
} = require("../src/utils/activityPost.js");

const CREATOR = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ADMIN = "bbbbbbbbbbbbbbbbbbbbbbbb";
const POST_ID = "cccccccccccccccccccccccc";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function rawPost(overrides = {}) {
  return {
    _id: POST_ID,
    userId: CREATOR,
    postOwnerId: ADMIN,
    itemName: "Mango",
    clubStatus: "Active",
    memberCount: 2,
    clubMembers: 4,
    spotsOpen: 2,
    isGroupMember: false,
    requestStatus: "pending",
    membershipStatus: "left",
    groupInfo: {
      members: [ADMIN],
      leftMembers: [{ user: CREATOR, leftAt: new Date() }],
    },
    ...overrides,
  };
}

function row(overrides = {}) {
  return buildActivityPostRow(rawPost(overrides), {
    role: "joined",
    viewerUserId: CREATOR,
  });
}

console.log("\n--- buildActivityPostRow (joined, ex-creator) ---\n");

const pendingRow = row({
  requestStatus: "pending",
  isViewerLeft: true,
  membershipStatus: "left",
});
assert("pending rejoin → requestStatus pending", pendingRow.requestStatus === "pending");
assert("pending rejoin → not group member", pendingRow.isGroupMember === false);

const acceptedRow = row({
  requestStatus: "accepted",
  isGroupMember: true,
  isViewerLeft: false,
  membershipStatus: "active",
  groupInfo: {
    members: [ADMIN, CREATOR],
    leftMembers: [{ user: CREATOR, leftAt: new Date(), rejoinedAt: new Date() }],
  },
});
assert("after accept → requestStatus accepted", acceptedRow.requestStatus === "accepted");
assert("after accept → isGroupMember true", acceptedRow.isGroupMember === true);

console.log("\n--- filterActivityPostsByRole (created) ---\n");

const createdPosts = [
  row({ requestStatus: "pending" }),
  row({ requestStatus: "accepted", isGroupMember: true, membershipStatus: "active" }),
  buildActivityPostRow(
    { ...rawPost(), userId: CREATOR, postOwnerId: CREATOR },
    { role: "created", viewerUserId: CREATOR },
  ),
];

const createdFiltered = filterActivityPostsByRole(createdPosts, "created", CREATOR);
assert(
  "created: only still-owner post remains",
  createdFiltered.length === 1 && String(createdFiltered[0].postOwnerId) === CREATOR,
);

console.log("\n--- Summary ---\n");
console.log(`Passed: ${passed}, Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
