const PostModel = require("../models/Post.js");
const ClubRequest = require("../models/ClubRequest.js");
const User = require("../models/User.js");
const Group = require("../models/Group.js");
const { sendSystemMessage } = require("./MessageController.js");
const Post = require("../models/Post");
const { sendPushNotification } = require("../utils/Firebase.js");
const checkUserFCMAndDevice = require("../utils/FcmCheck.js")
const admin = require("../utils/Firebase.js")
const { addNotification } = require("./NotificationController.js");


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

      if (!postData.postOwnerId.equals(userId)) {
        return res.status(403).json({ error: "You are not authorized to view requests for this Post" });
      }

      const clubRequests = await ClubRequest.find({ postId: productId })
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
      const { postId } = req.params;
      const requesterId = req.User?._id;

      if (!postId) {
        return res.status(400).json({ error: "Post ID is required." });
      }

      const postData = await Post.findById(postId);
      if (!postData) return res.status(404).json({ error: "Post not found." });

      const postOwnerId = postData.postOwnerId;
      if (!postOwnerId) return res.status(404).json({ error: "Post owner not found." });

      if (requesterId.toString() === postOwnerId.toString()) {
        return res.status(400).json({ error: "You cannot send a club request to your own Post." });
      }

      const existingRequest = await ClubRequest.findOne({ requester: requesterId, postId });
      if (existingRequest) {
        if (existingRequest.status === "accepted") {
          return res.status(400).json({ error: "You have already joined this club." });
        }
        if (existingRequest.status === "declined") {
          return res.status(400).json({ error: "Your join request was declined." });
        }
        return res.status(400).json({ error: "You have already sent a join request." });
      }


      // Fetch the associated group
      const group = await Group.findOne({ productId: postId });
      if (group) {
        // Check if group has reached its max size
        if (group.members.length >= postData.clubMembers) {
          return res.status(400).json({ error: "The group is already full. You cannot send a club request." });
        }
        // Check if requester is already in the group
        if (group.members.includes(requesterId)) {
          return res.status(400).json({ error: "You are already a member of this group." });
        }
      }

      await new ClubRequest({ requester: requesterId, postId }).save();
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

        admin.messaging().send(message)
          .then(response => {
            console.log('Successfully sent message:', response);
          })
          .catch(error => {
            console.error('Error sending message:', error);
          });

      } else {
        console.log("User does not have a valid FCM Token or Device Type.");
      }

      //add notification 
      const success = addNotification(`New Request for ${itemName}! 🎉`, `${requesterFirstName} is interested in your product group! Take a look and make something amazing happen! ✨`, postOwnerId, "JoinReq", `clubby://product/${postId}`, postId, "Product");
      if (success) {
        console.log('Add notification to controller')
      }
      else {
        console.log('Error adding notification to controller')
      }

      return res.status(200).json({ message: "Club request sent successfully." });
    } catch (error) {
      console.log('Error is ', error)
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

      if (!postData.postOwnerId.equals(userId)) {
        return res.status(403).json({ error: "You are not authorized to view requests for this Post" });
      }

      const requester = await User.findById(requesterId);
      if (!requester) {
        return res.status(404).json({ error: "Requester Not Found" });
      }

      const pendingRequest = await ClubRequest.findOne({ requester: requesterId, postId });
      if (!pendingRequest) {
        return res.status(400).json({ error: "Pending Request Not Found" });
      }

      if (pendingRequest.status === status) {
        return res.status(400).json({ error: `Club request already ${status}.` });
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

        if (group.members.includes(requesterId)) {
          return res.status(400).json({ error: "Requester is already a member of the group." });
        }

        group.members.push(requesterId);
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

          admin.messaging().send(message)
            .then(response => {
              console.log('Successfully sent message:', response);
            })
            .catch(error => {
              console.error('Error sending message:', error);
            });

        } else {
          console.log("User does not have a valid FCM Token or Device Type.");
        }

        //add notification 
        const success = addNotification(`Your Request for ${itemName} is Accepted! 🎉`, `Great news! Your request for ${itemName} has been accepted. Go ahead and seal the deal! 🤝`, requesterId, "AccptReq", `clubby://product/${postId}`, postId, "Product");
        if (success) {
          console.log('Add notification to controller')
        }
        else {
          console.log('Error adding notification to controller')
        }


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

        admin.messaging().send(message)
          .then(response => {
            console.log('Successfully sent message:', response);
          })
          .catch(error => {
            console.error('Error sending message:', error);
          });

      } else {
        console.log("User does not have a valid FCM Token or Device Type.");
      }

      //add notification 
      const success = addNotification(`Request Declined for ${itemName}`, `Unfortunately, your request for ${itemName} was declined. Don't worry—there are plenty of great deals waiting for you! 🔍`, requesterId, "DecReq", `clubby://product/${postId}`, postId, "Product");
      if (success) {
        console.log('Add notification to controller')
      }
      else {
        console.log('Error adding notification to controller')
      }


      return res.status(200).json({ message: "Club request declined successfully." });

    } catch (error) {
      console.error("Error handling club request:", error);
      return res.status(500).json({ error: "Internal server error." });
    }
  }
};

module.exports = ClubRequestController;
