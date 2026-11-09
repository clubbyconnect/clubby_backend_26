const mongoose = require("mongoose");
const PostModel = require("../models/Post.js");
const Post = require("../models/Post");
const ClubRequest = require("../models/ClubRequest.js");
const User = require("../models/User.js");
const Group = require("../models/Group.js");
const { sendSystemMessage } = require("../controllers/MessageController.js");
const { sendPushNotification } = require("../utils/Firebase.js");
const checkUserFCMAndDevice = require("../utils/FcmCheck.js");
const { addNotification } = require("../controllers/NotificationController.js");
const { markUserRejoined } = require("../utils/groupMembership.js");
const { isGroupMember } = require("../utils/clubRejoin.js");
const { getUnavailablePostReason, canManageClubRequests } = require("../utils/postVisibility.js");

const toPostObjectId = (postId) =>
  mongoose.Types.ObjectId.isValid(postId)
    ? new mongoose.Types.ObjectId(postId)
    : postId;

async function processClubRequestAction({ actingUserId, requesterId, postId, status }) {
  if (!requesterId || !postId || !status) {
    return {
      ok: false,
      statusCode: 400,
      error: "requesterId, postId, and status are required.",
    };
  }

  if (!["accepted", "declined"].includes(status)) {
    return {
      ok: false,
      statusCode: 400,
      error: "Invalid status. Must be 'accepted' or 'declined'.",
    };
  }

  const postData = await PostModel.findById(postId);
  if (!postData) {
    return { ok: false, statusCode: 404, error: "Post Not Found" };
  }

  const postObjectId = toPostObjectId(postId);
  const groupForAuth = await Group.findOne({ productId: postObjectId })
    .select("adminId isActive members")
    .lean();

  if (!canManageClubRequests(postData, groupForAuth, actingUserId)) {
    return {
      ok: false,
      statusCode: 403,
      error: "You are not authorized to accept or decline requests for this post.",
      code: "NOT_POST_OWNER",
    };
  }

  const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

  const requester = await User.findById(requesterObjectId);
  if (!requester) {
    return { ok: false, statusCode: 404, error: "Requester Not Found" };
  }

  const pendingRequest = await ClubRequest.findOne({
    requester: requesterObjectId,
    postId: postObjectId,
    status: "pending",
  });
  if (!pendingRequest) {
    return {
      ok: false,
      statusCode: 404,
      error: "This join request is no longer pending. It may have been cancelled.",
      code: "REQUEST_NOT_PENDING",
    };
  }

  if (pendingRequest.status !== "pending") {
    return {
      ok: false,
      statusCode: 400,
      error: `This request has already been ${pendingRequest.status}.`,
    };
  }

  let groupForAccepted = null;
  if (status === "accepted") {
    groupForAccepted = await Group.findOne({ productId: postId });
    if (!groupForAccepted) {
      return { ok: false, statusCode: 404, error: "Group not found for this Post." };
    }

    const unavailableReason = getUnavailablePostReason(postData, groupForAccepted);
    if (unavailableReason) {
      return {
        ok: false,
        statusCode: 403,
        error: unavailableReason.message,
        code: unavailableReason.code,
      };
    }

    if (groupForAccepted.members.length >= postData.clubMembers) {
      return { ok: false, statusCode: 400, error: "The group is full. Cannot add more members." };
    }

    if (isGroupMember(groupForAccepted, requesterObjectId)) {
      return { ok: false, statusCode: 400, error: "Requester is already a member of the group." };
    }
  }

  pendingRequest.status = status;
  pendingRequest.updatedAt = Date.now();
  await pendingRequest.save();

  const postInformation = await Post.findOne({ _id: postId }).select("itemName").lean();
  if (!postInformation) {
    return { ok: false, statusCode: 404, error: "Post not found" };
  }

  const itemName = postInformation.itemName;

  if (status === "accepted") {
    const group = groupForAccepted;

    markUserRejoined(group, requesterObjectId);
    group.members.push(requesterObjectId);
    await group.save();
    await sendSystemMessage(group._id, `${requester.firstName || "User"} has been added to the group.`);

    const fcmResult = await checkUserFCMAndDevice(requesterId);

    if (fcmResult.status) {
      await sendPushNotification({
        token: fcmResult.fcmToken,
        notification: {
          title: `Your Request for ${itemName} is Accepted! 🎉`,
          body: `Great news! Your request for ${itemName} has been accepted. Go ahead and seal the deal! 🤝`,
        },
      });
    }

    await addNotification(
      `Your Request for ${itemName} is Accepted! 🎉`,
      `Great news! Your request for ${itemName} has been accepted. You can now chat in the group.`,
      requesterObjectId,
      "AccptReq",
      `clubby://product/${postId}`,
      postId,
      "Product",
    );

    return {
      ok: true,
      message: "Club request accepted and user added to the group.",
      group,
      requesterId: String(requesterId),
      postId: String(postId),
      status,
      requestId: String(pendingRequest._id),
    };
  }

  const fcmResult = await checkUserFCMAndDevice(requesterId);

  if (fcmResult.status) {
    await sendPushNotification({
      token: fcmResult.fcmToken,
      notification: {
        title: `Request Declined for ${itemName}`,
        body: `Unfortunately, your request for ${itemName} was declined. Don't worry—there are plenty of great deals waiting for you! 🔍`,
      },
    });
  }

  await addNotification(
    `Request Declined for ${itemName}`,
    `Unfortunately, your request for ${itemName} was declined.`,
    requesterObjectId,
    "DecReq",
    `clubby://product/${postId}`,
    postId,
    "Product",
  );

  return {
    ok: true,
    message: "Club request declined successfully.",
    requesterId: String(requesterId),
    postId: String(postId),
    status,
    requestId: String(pendingRequest._id),
  };
}

module.exports = { processClubRequestAction, toPostObjectId };
