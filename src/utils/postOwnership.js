const User = require("../models/User.js");

const isSameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Canonical owner id — always use postOwnerId (not userId). */
function getOwnerId(post) {
  if (!post) return null;
  const owner = post.postOwnerId;
  if (owner && typeof owner === "object" && owner._id != null) {
    return owner._id;
  }
  return owner ?? null;
}

function isPostOwner(post, userId) {
  return isSameId(getOwnerId(post), userId);
}

async function normalizePostOwner(postOwnerId) {
  if (!postOwnerId) return null;

  if (typeof postOwnerId === "object" && postOwnerId._id != null) {
    return {
      _id: postOwnerId._id,
      firstName: postOwnerId.firstName ?? "",
      lastName: postOwnerId.lastName ?? "",
    };
  }

  const ownerDoc = await User.findById(postOwnerId).select("firstName lastName").lean();
  if (!ownerDoc) {
    return { _id: postOwnerId, firstName: "", lastName: "" };
  }

  return {
    _id: ownerDoc._id,
    firstName: ownerDoc.firstName ?? "",
    lastName: ownerDoc.lastName ?? "",
  };
}

module.exports = {
  isSameId,
  getOwnerId,
  isPostOwner,
  normalizePostOwner,
};
