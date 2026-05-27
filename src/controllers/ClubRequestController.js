const mongoose = require("mongoose");
const PostModel = require("../models/Post.js");
const ClubRequest = require("../models/ClubRequest.js");
const User = require("../models/User.js");
const Group = require("../models/Group.js");
const { sendSystemMessage } = require("./MessageController.js");
const Post = require("../models/Post");
const { sendPushNotification } = require("../utils/Firebase.js");
const checkUserFCMAndDevice = require("../utils/FcmCheck.js")
const { addNotification } = require("./NotificationController.js");
const Notification = require("../models/Notification.js");
const { emitToRoom } = require("../sockets/Chat.js");
const { isPostOwner, isSameId } = require("../utils/postOwnership.js");
const {
  getUserLeftInfo,
  isGroupMember,
  REJOIN_WARNING_MESSAGE,
  EXHAUSTED_REJOIN_MESSAGE,
} = require("../utils/clubRejoin.js");
const { markUserRejoined, getMembershipAudit } = require("../utils/groupMembership.js");

const toPostObjectId = (postId) =>
  mongoose.Types.ObjectId.isValid(postId)
    ? new mongoose.Types.ObjectId(postId)
    : postId;

const ClubRequestController = {
  list: async (req, res) => {
    try {
      const { productId } = req.params;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      const userId = req.User._id;
      const postData = await PostModel.findById(productId);

      if (!postData) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (!isPostOwner(postData, userId)) {
        return res.status(403).json({
          error: "You are not authorized to view requests for this post.",
          code: "NOT_POST_OWNER",
        });
      }

      const postObjectId = toPostObjectId(productId);
      const clubRequests = await ClubRequest.find({
        postId: postObjectId,
      })
        .populate("requester", "firstName lastName email avatar gender")
        .sort({ createdAt: -1 });

      const group = await Group.findOne({ productId: postObjectId })
        .select("members leftMembers isActive")
        .lean();
      const memberCount = group?.members?.length ?? 0;
      const clubSize = postData.clubMembers ?? 0;
      const spotsOpen = Math.max(0, clubSize - memberCount);
      const isExpired =
        Boolean(postData.expiryAt) &&
        new Date(postData.expiryAt).getTime() < Date.now();
      const isAdminDeactivated = Boolean(postData.deactivatedByAdminId);
      const isOwnerInactive =
        postData.clubStatus === "Inactive" ||
        postData.clubStatus === "Wrap" ||
        group?.isActive === false;
      const isDeleted = Boolean(postData.deletedAt);
      const isFull = spotsOpen === 0;
      const canAcceptMore =
        !isFull &&
        !isExpired &&
        !isAdminDeactivated &&
        !isDeleted &&
        !isOwnerInactive;

      const statusOrder = { pending: 0, accepted: 1, declined: 2 };
      const sortedRequests = [...clubRequests].sort((a, b) => {
        const orderA = statusOrder[a.status] ?? 9;
        const orderB = statusOrder[b.status] ?? 9;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const pendingCount = clubRequests.filter((r) => r.status === "pending").length;

      return res.status(200).json({
        message: "Request list retrieved successfully",
        pendingCount,
        postSummary: {
          clubMembers: clubSize,
          memberCount,
          spotsOpen,
          clubStatus: postData.clubStatus,
          expiryAt: postData.expiryAt,
          isExpired,
          isAdminDeactivated,
          isOwnerInactive: isOwnerInactive && !isAdminDeactivated,
          isDeleted,
          isFull,
          canAcceptMore,
          deactivationNote: postData.deactivationNote ?? null,
        },
        requests: sortedRequests.map((request) => ({
          _id: request._id,
          requester: request.requester,
          createdAt: request.createdAt,
          status: request.status,
          updatedAt: request.updatedAt,
          membershipAudit: group
            ? getMembershipAudit(group, request.requester?._id ?? request.requester)
            : null,
        })),
      });
    } catch (error) {
      console.error("Error retrieving request list:", error);
      return res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  },

  sendClubRequest: async (req, res) => {
    try {
      const { postId } = req.params;
      const requesterId = req.User?._id;

      if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Valid post ID is required." });
      }

      const postData = await Post.findById(postId);
      if (!postData) return res.status(404).json({ error: "Post not found." });

      const postOwnerId = postData.postOwnerId;
      if (!postOwnerId) return res.status(404).json({ error: "Post owner not found." });

      if (requesterId.toString() === postOwnerId.toString()) {
        return res.status(400).json({ error: "You cannot send a club request to your own Post." });
      }

      const postObjectId = new mongoose.Types.ObjectId(postId);
      const group = await Group.findOne({ productId: postId });
      const leftInfo = group ? getUserLeftInfo(group, requesterId) : null;

      if (leftInfo?.feedHidden) {
        return res.status(403).json({
          error: EXHAUSTED_REJOIN_MESSAGE,
          code: "REJOIN_EXHAUSTED",
        });
      }

      const existingRequest = await ClubRequest.findOne({
        requester: requesterId,
        postId: postObjectId,
      });

      if (group) {
        if (group.members.length >= postData.clubMembers) {
          return res.status(400).json({ error: "The group is already full. You cannot send a club request." });
        }
        if (isGroupMember(group, requesterId)) {
          return res.status(400).json({ error: "You are already a member of this group." });
        }
      }

      let isRejoinRequest = false;

      if (existingRequest) {
        if (existingRequest.status === "accepted" && group && !isGroupMember(group, requesterId)) {
          if (!leftInfo?.canRejoin) {
            return res.status(403).json({
              error: EXHAUSTED_REJOIN_MESSAGE,
              code: "REJOIN_EXHAUSTED",
            });
          }
          existingRequest.status = "pending";
          existingRequest.updatedAt = Date.now();
          await existingRequest.save();
          isRejoinRequest = true;
        } else if (existingRequest.status === "declined") {
          existingRequest.status = "pending";
          existingRequest.updatedAt = Date.now();
          await existingRequest.save();
          isRejoinRequest = true;
        } else if (existingRequest.status === "pending") {
          return res.status(400).json({ error: "You have already sent a join request." });
        } else if (existingRequest.status === "accepted") {
          return res.status(400).json({ error: "You have already joined this club." });
        }
      }

      if (!existingRequest) {
        await new ClubRequest({ requester: requesterId, postId: postObjectId }).save();
        if (leftInfo?.isLeft && leftInfo?.canRejoin) {
          isRejoinRequest = true;
        }
      }
      //postOwnerId
      const postInformation = await Post.findOne({ _id: postId })
        .select("itemName")
        .lean();

      if (!postInformation) {
        return { error: "Post not found" };
      }

      const requesterInfo = await User.findOne({ _id: requesterId })
        .select("firstName")
        .lean();

      if (!requesterInfo) {
        return { error: "Requester not found" };
      }

      const itemName = postInformation.itemName;
      const requesterFirstName = requesterInfo.firstName;


      const result = await checkUserFCMAndDevice(postOwnerId);

      if (result.status) {
        console.log("User has FCM Token:", result.fcmToken);

        let message = {
          token: result.fcmToken,
          notification: {
            title: `New Request for ${itemName}! 🎉`,
            body: `${requesterFirstName} is interested in your product group! Take a look and make something amazing happen! ✨`
          }

        };

        await sendPushNotification(message);

      } else {
        console.log("User does not have a valid FCM Token or Device Type.");
      }

      //add notification 
      const success = await addNotification(
        `New Request for ${itemName}! 🎉`,
        `${requesterFirstName} is interested in your product group! Review and accept or decline the request.`,
        postOwnerId,
        "JoinReq",
        `clubby://product/${postId}`,
        postId,
        "Product",
        { requesterId: String(requesterId) },
      );
      if (!success) {
        console.log("Error adding notification to controller");
      }

      return res.status(200).json({
        message: isRejoinRequest
          ? "Rejoin request sent. Waiting for the post owner."
          : "Club request sent successfully.",
        requestStatus: "pending",
        rejoinMessage: isRejoinRequest ? REJOIN_WARNING_MESSAGE : null,
        isRejoin: isRejoinRequest,
      });
    } catch (error) {
      console.log('Error is ', error)
      return res.status(500).json({ error: "Internal server error." });
    }
  },

  cancelClubRequest: async (req, res) => {
    try {
      const { postId } = req.params;
      const requesterId = req.User?._id;

      if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Valid post ID is required." });
      }

      const postData = await Post.findById(postId);
      if (!postData) {
        return res.status(404).json({ error: "Post not found." });
      }

      const postObjectId = new mongoose.Types.ObjectId(postId);
      const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

      const pendingRequest = await ClubRequest.findOne({
        requester: requesterObjectId,
        postId: { $in: [postObjectId, postId] },
        status: "pending",
      });

      if (!pendingRequest) {
        const anyRequest = await ClubRequest.findOne({
          requester: requesterObjectId,
          postId: { $in: [postObjectId, postId] },
        });
        if (anyRequest?.status === "accepted") {
          return res.status(400).json({
            error: "You are already in this club. Leave the group to withdraw.",
          });
        }
        if (anyRequest?.status === "declined") {
          return res.status(200).json({
            message: "No active request.",
            requestStatus: null,
          });
        }
        return res.status(404).json({ error: "No pending join request to cancel." });
      }

      await ClubRequest.deleteMany({
        requester: requesterObjectId,
        postId: { $in: [postObjectId, postId] },
        status: "pending",
      });

      const postOwnerId = postData.postOwnerId?._id ?? postData.postOwnerId;
      if (postOwnerId) {
        await Notification.deleteMany({
          userId: postOwnerId,
          notificationType: "JoinReq",
          refId: postObjectId,
          $or: [
            { "customData.requesterId": requesterObjectId },
            { "customData.requesterId": String(requesterId) },
          ],
        });
        emitToRoom(String(postOwnerId), "clubRequestCancelled", {
          postId: String(postId),
          requesterId: String(requesterId),
        });
      }

      return res.status(200).json({
        message: "Join request cancelled successfully.",
        requestStatus: null,
      });
    } catch (error) {
      console.error("Error cancelling club request:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  },

  handleClubRequest: async (req, res) => {
    try {
      const { requesterId, postId, status } = req.body;
      const userId = req.User._id;

      if (!requesterId || !postId || !status) {
        return res.status(400).json({ error: "requesterId, postId, and status are required." });
      }

      if (!["accepted", "declined"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'accepted' or 'declined'." });
      }

      const postData = await PostModel.findById(postId);
      if (!postData) {
        return res.status(404).json({ error: "Post Not Found" });
      }

      if (!isPostOwner(postData, userId)) {
        return res.status(403).json({
          error: "You are not authorized to accept or decline requests for this post.",
          code: "NOT_POST_OWNER",
        });
      }

      const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

      const requester = await User.findById(requesterObjectId);
      if (!requester) {
        return res.status(404).json({ error: "Requester Not Found" });
      }

      const postObjectId = toPostObjectId(postId);
      const pendingRequest = await ClubRequest.findOne({
        requester: requesterObjectId,
        postId: postObjectId,
        status: "pending",
      });
      if (!pendingRequest) {
        return res.status(404).json({
          error: "This join request is no longer pending. It may have been cancelled.",
          code: "REQUEST_NOT_PENDING",
        });
      }

      if (pendingRequest.status !== "pending") {
        return res.status(400).json({
          error: `This request has already been ${pendingRequest.status}.`,
        });
      }

      pendingRequest.status = status;
      pendingRequest.updatedAt = Date.now();
      await pendingRequest.save();

      const postInformation = await Post.findOne({ _id: postId })
        .select("itemName")
        .lean();

      if (!postInformation) {
        return { error: "Post not found" };
      }

      const itemName = postInformation.itemName;

      if (status === "accepted") {
        console.log("inside accepted")
        const group = await Group.findOne({ productId: postId });
        if (!group) {
          return res.status(404).json({ error: "Group not found for this Post." });
        }

        // Check if group has reached its max size
        if (group.members.length >= postData.clubMembers) {
          return res.status(400).json({ error: "The group is full. Cannot add more members." });
        }

        if (isGroupMember(group, requesterObjectId)) {
          return res.status(400).json({ error: "Requester is already a member of the group." });
        }

        markUserRejoined(group, requesterObjectId);
        group.members.push(requesterObjectId);
        await group.save();
        await sendSystemMessage(group._id, `${requester.firstName || "User"} has been added to the group.`);


        const result = await checkUserFCMAndDevice(requesterId);

        if (result.status) {
          console.log("User has FCM Token:", result.fcmToken);

          let message = {
            token: result.fcmToken,
            notification: {
              title: `Your Request for ${itemName} is Accepted! 🎉`,
              body: `Great news! Your request for ${itemName} has been accepted. Go ahead and seal the deal! 🤝`
            }


          };

          await sendPushNotification(message);

        } else {
          console.log("User does not have a valid FCM Token or Device Type.");
        }

        //add notification 
        await addNotification(
          `Your Request for ${itemName} is Accepted! 🎉`,
          `Great news! Your request for ${itemName} has been accepted. You can now chat in the group.`,
          requesterObjectId,
          "AccptReq",
          `clubby://product/${postId}`,
          postId,
          "Product",
        );


        return res.status(200).json({ message: "Club request accepted and user added to the group.", group });
      }



      const result = await checkUserFCMAndDevice(requesterId);

      if (result.status) {
        console.log("User has FCM Token:", result.fcmToken);

        let message = {
          token: result.fcmToken,
          notification: {
            title: `Request Declined for ${itemName}`,
            body: `Unfortunately, your request for ${itemName} was declined. Don't worry—there are plenty of great deals waiting for you! 🔍`
          }



        };

        await sendPushNotification(message);

      } else {
        console.log("User does not have a valid FCM Token or Device Type.");
      }

      //add notification 
      await addNotification(
        `Request Declined for ${itemName}`,
        `Unfortunately, your request for ${itemName} was declined.`,
        requesterObjectId,
        "DecReq",
        `clubby://product/${postId}`,
        postId,
        "Product",
      );


      return res.status(200).json({ message: "Club request declined successfully." });

    } catch (error) {
      console.error("Error handling club request:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  }
};

module.exports = ClubRequestController;
