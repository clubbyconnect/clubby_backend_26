const PostModel = require("../models/Post");
const ClubRequest = require("../models/clubRequest");
const User = require("../models/user");
const Group = require("../models/group");
const {sendSystemMessage} = require("./user.controller");
const post = require("../models/Post");
const {sendPushNotification} = require("./data.controller");

const ClubRequestController = {
  list: async (req, res) => {
    try {
      const {productId} = req.params;
      if (!productId) {
        return res.status(400).json({error: "Product ID is required"});
      }
      const userId = req.User._id;
      const postData = await PostModel.findById(productId);

      if (!postData) {
        return res.status(404).json({error: "Post not found"});
      }

      if (!postData.postOwnerId.equals(userId)) {
        return res.status(403).json({error: "You are not authorized to view requests for this post"});
      }

      const clubRequests = await ClubRequest.find({postId: productId})
        .populate("requester", "firstName lastName email avatar gender");

      return res.status(200).json({
        message: "Request list retrieved successfully",
        requests: clubRequests.map((request) => ({
          _id: request._id,
          requester: request.requester,
          createdAt: request.createdAt,
          status: request.status
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
      const {postId} = req.params;
      const requesterId = req.User?._id;

      if (!postId) {
        return res.status(400).json({error: "Post ID is required."});
      }

      const postData = await post.findById(postId);
      if (!postData) return res.status(404).json({error: "Post not found."});

      const postOwnerId = postData.postOwnerId;
      if (!postOwnerId) return res.status(404).json({error: "Post owner not found."});

      if (requesterId.toString() === postOwnerId.toString()) {
        return res.status(400).json({error: "You cannot send a club request to your own post."});
      }

      const existingRequest = await ClubRequest.findOne({requester: requesterId, postId});
      if (existingRequest) {
        if (existingRequest.status === "accepted") {
          return res.status(400).json({error: "You have already joined this club."});
        }
        if (existingRequest.status === "declined") {
          return res.status(400).json({error: "Your join request was declined."});
        }
        return res.status(400).json({error: "You have already sent a join request."});
      }


      // Fetch the associated group
      const group = await Group.findOne({productId: postId});
      if (group) {
        // Check if group has reached its max size
        if (group.members.length >= postData.clubMembers) {
          return res.status(400).json({error: "The group is already full. You cannot send a club request."});
        }
        // Check if requester is already in the group
        if (group.members.includes(requesterId)) {
          return res.status(400).json({error: "You are already a member of this group."});
        }
      }

      await new ClubRequest({requester: requesterId, postId}).save();


      const postOwner = await User.findById(postOwnerId);
      if (postOwner?.fcmToken) {
        await sendPushNotification({
          token: postOwner.fcmToken,
          notification: {
            title: "New Club Request",
            body: `You have received a club request for your post "${postData.title}".`,
          },
          data: {postId: postId.toString(), requesterId: requesterId.toString()},
        });
      }
      return res.status(200).json({message: "Club request sent successfully."});
    } catch (error) {
      return res.status(500).json({error: "Internal server error."});
    }
  },


  handleClubRequest: async (req, res) => {
    try {
      const {requesterId, postId, status} = req.body;
      const userId = req.User._id;

      if (!requesterId || !postId || !status) {
        return res.status(400).json({error: "requesterId, postId, and status are required."});
      }

      if (!["accepted", "declined"].includes(status)) {
        return res.status(400).json({error: "Invalid status. Must be 'accepted' or 'declined'."});
      }

      const postData = await PostModel.findById(postId);
      if (!postData) {
        return res.status(404).json({error: "Post Not Found"});
      }

      if (!postData.postOwnerId.equals(userId)) {
        return res.status(403).json({error: "You are not authorized to view requests for this post"});
      }

      const requester = await User.findById(requesterId);
      if (!requester) {
        return res.status(404).json({error: "Requester Not Found"});
      }

      const pendingRequest = await ClubRequest.findOne({requester: requesterId, postId});
      if (!pendingRequest) {
        return res.status(400).json({error: "Pending Request Not Found"});
      }

      if (pendingRequest.status === status) {
        return res.status(400).json({error: `Club request already ${status}.`});
      }

      pendingRequest.status = status;
      pendingRequest.updatedAt = Date.now();
      await pendingRequest.save();

      if (status === "accepted") {
        console.log("inside accepted")
        const group = await Group.findOne({productId: postId});
        if (!group) {
          return res.status(404).json({error: "Group not found for this post."});
        }

        // Check if group has reached its max size
        if (group.members.length >= postData.clubMembers) {
          return res.status(400).json({error: "The group is full. Cannot add more members."});
        }

        if (group.members.includes(requesterId)) {
          return res.status(400).json({error: "Requester is already a member of the group."});
        }

        group.members.push(requesterId);
        await group.save();
        await sendSystemMessage(group._id, `${requester.firstName || "User"} has been added to the group.`);

        return res.status(200).json({message: "Club request accepted and user added to the group.", group});
      }

      return res.status(200).json({message: "Club request declined successfully."});

    } catch (error) {
      console.error("Error handling club request:", error);
      return res.status(500).json({message: "Internal server error."});
    }
  }
};

module.exports = ClubRequestController;
