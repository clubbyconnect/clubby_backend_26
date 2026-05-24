const Group = require('../models/Group.js'); // Import Group model
const mongoose = require("mongoose");
const User = require("../models/User.js");
const Post = require("../models/Post.js");
const ClubRequest = require("../models/ClubRequest.js");
const { sendPushNotification } = require('../utils/Firebase.js');
const { getIO } = require("../sockets/Chat.js");
const { sendSystemMessage } = require("./MessageController.js");
const Report = require("../models/ReportSchema.js");
const { withProductThumb } = require("../utils/imageUrls.js");



exports.groupMember = async (req, res) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ error: "Post ID is required" });
    }

    // Find the group by productId and select only members
    const postObjectId = mongoose.Types.ObjectId.isValid(postId)
      ? new mongoose.Types.ObjectId(postId)
      : postId;
    const group = await Group.findOne({
      productId: { $in: [postObjectId, postId] },
    }).populate(
      'members',
      '_id firstName lastName email avatar'
    );

    if (!group) {
      return res.status(404).json({ error: "No group found for this Post" });
    }

    return res.status(200).json({
      message: "Group members retrieved successfully",
      members: group.members, // Return members with `_id`
    });

  } catch (error) {
    console.error("Error fetching members:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
};

exports.getGroupsForUser = async (req, res) => {
  const startedAt = Date.now();
  try {
    const userId = req.User._id;
    let { keyword, page = 1, limit = 20, since } = req.body;

    page = parseInt(page, 10) || 1;
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID.' });
    }

    const userIdObjectId = new mongoose.Types.ObjectId(userId);
    const sinceDate = since ? new Date(since) : null;
    const hasValidSince = sinceDate && !isNaN(sinceDate.getTime());

    const aggregationPipeline = [
      { $match: { members: { $in: [userIdObjectId] } } },
      {
        $lookup: {
          from: 'posts',
          localField: 'productId',
          foreignField: '_id',
          as: 'productDetails',
          pipeline: [
            {
              $project: {
                itemName: 1,
                productImage: 1,
                clubStatus: 1,
                expiryAt: 1,
                deletedAt: 1,
              },
            },
          ],
        },
      },
      { $unwind: '$productDetails' },
      {
        $lookup: {
          from: 'messages',
          let: { groupId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$groupId', '$$groupId'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                content: 1,
                createdAt: 1,
                readBy: 1,
              },
            },
          ],
          as: 'lastMessage',
        },
      },
      { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          memberCount: { $size: '$members' },
          sortAt: { $ifNull: ['$lastMessage.createdAt', '$updatedAt'] },
        },
      },
    ];

    if (keyword) {
      aggregationPipeline.push({
        $match: {
          'productDetails.itemName': {
            $regex: keyword,
            $options: 'i',
          },
        },
      });
    }

    if (hasValidSince) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { 'lastMessage.createdAt': { $gte: sinceDate } },
            { updatedAt: { $gte: sinceDate } },
          ],
        },
      });
    }

    aggregationPipeline.push(
      { $sort: { sortAt: -1 } },
      {
        $project: {
          _id: 1,
          productImage: '$productDetails.productImage',
          productName: '$productDetails.itemName',
          clubStatus: '$productDetails.clubStatus',
          expiryAt: '$productDetails.expiryAt',
          lastMessage: {
            text: '$lastMessage.content',
            createdAt: '$lastMessage.createdAt',
            readBy: '$lastMessage.readBy',
          },
          memberCount: 1,
        },
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    );

    const [facetResult] = await Group.aggregate(aggregationPipeline);
    const totalGroups = facetResult?.metadata?.[0]?.total ?? 0;
    const groups = (facetResult?.data ?? []).map((group) => {
      const withThumb = withProductThumb({
        ...group,
        productImage: group.productImage,
      });
      return {
        _id: withThumb._id,
        productName: withThumb.productName,
        productImage: withThumb.productImage,
        productImageThumb: withThumb.productImageThumb,
        clubStatus: withThumb.clubStatus,
        memberCount: withThumb.memberCount,
        expiryAt: withThumb.expiryAt,
        lastMessage: withThumb.lastMessage?.createdAt
          ? {
              ...withThumb.lastMessage,
              content: withThumb.lastMessage.text,
            }
          : null,
      };
    });

    const durationMs = Date.now() - startedAt;
    if (durationMs >= 500) {
      console.warn(`[slow-query] POST myGroups ${durationMs}ms page=${page}`);
    }

    return res.status(200).json({
      groups,
      totalItems: totalGroups,
      totalPages: Math.ceil(totalGroups / limit),
      currentPage: page,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching groups for user:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};


exports.createOrJoinGroup = async (req, res) => {
  const { productId, productName, limit, adminId, userId } = req.body;

  try {
    // Accepting club request
    const { requesterId, postId } = req.body;
    const recipientId = req.User._id;

    if (requesterId) {
      const postData = await Post.findById(postId);
      if (!postData) {
        return res.status(404).json({ error: "Post Not Found" });
      }

      if (postData.userId.equals(requesterId)) {
        return res.status(400).json({
          message: "You cannot use your userId as requesterId to Accept ClubRequest",
        });
      }

      const requester = await User.findById(requesterId);
      if (!requester) {
        return res.status(404).json({ error: "Requester Not Found" });
      }

      const pendingRequest = await ClubRequest.findOne({
        requester: requesterId,
        recipient: recipientId,
        postId,
      });

      if (!pendingRequest) {
        return res.status(400).json({ error: "Pending Request Not Found" });
      }

      if (pendingRequest.status === "accepted") {
        return res.status(400).json({ error: "Club request already accepted" });
      }

      pendingRequest.status = "accepted";
      pendingRequest.updatedAt = Date.now();
      await pendingRequest.save();

      // **Push Notification for Club Request Acceptance**
      if (requester.fcmToken) {
        const notificationData = {
          token: requester.fcmToken, // Send notification to the requester
          notification: {
            title: "Club Request Accepted",
            body: `Your club request for Post "${postData.title}" has been accepted.`,
          },
          data: {
            postId: postId.toString(),
            recipientId: recipientId.toString(),
          },
        };

        // Send the push notification
        await sendPushNotification(notificationData);
      }
    }

    // Find the group by productId
    let group = await Group.findOne({ productId });

    // If the group does not exist, create a new group
    if (!group) {
      group = await Group.create({
        productId,
        productName,
        limit,
        adminId: adminId || userId,
        members: [adminId || userId],
      });

      const io = getIO();
      if (io) {
        io.emit("groupCreated", { groupId: group._id, productName, adminId: group.adminId });
      }

      // **Push Notification for Group Creation**
      const admin = await User.findById(adminId || userId); // Find the admin who created the group
      if (admin && admin.fcmToken) {
        const notificationData = {
          token: admin.fcmToken, // Send notification to the admin
          notification: {
            title: "Group Created",
            body: `A new group for product "${productName}" has been created.`,
          },
          data: {
            productId: productId.toString(),
          },
        };

        // Send the push notification
        await sendPushNotification(notificationData);
      }

      return res.status(201).json({ message: "Group created", group });
    }

    // If the group has reached the member limit
    if (group.members.length >= group.limit) {
      if (group.adminId.equals(userId)) {
        return res.status(403).json({
          message: "Group is full. Would you like to deactivate the group?",
          action: "deactivateOption",
        });
      } else {
        return res.status(403).json({ message: "Group is full." });
      }
    }

    // Check if the user is already a member of the group
    const isUserInGroup = group.members.some(member => member.equals(userId));
    if (isUserInGroup) {
      return res.status(400).json({ message: "User already exists in the group." });
    }

    // Add the user to the group
    group.members.push(userId);
    await group.save();

    try {
      await sendSystemMessage(group._id, `${userId} has joined the group.`);
    } catch (error) {
      console.error("Error in sendSystemMessage:", error); // Log the error for more details
    }

    const io = getIO();
    if (io) {
      io.to(group._id).emit("memberJoined", { userId });
    }

    // **Push Notification for User Joining**
    const user = await User.findById(userId); // Find the user who joined the group
    if (user && user.fcmToken) {
      const notificationData = {
        token: user.fcmToken, // Send notification to the user who joined
        notification: {
          title: "New Member Joined",
          body: `You have successfully joined the group for product "${productName}".`,
        },
        data: {
          productId: productId.toString(),
        },
      };

      // Send the push notification
      await sendPushNotification(notificationData);
    }

    return res.status(200).json({ message: "Joined the group", group });
  } catch (error) {
    console.error("Error in create/join group:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.leaveGroup = async (req, res) => {
  const { groupId, userId, newAdminId } = req.body;
  console.log(groupId, userId, newAdminId, "checkedddddddddd");

  if (!groupId || !userId) {
    return res.status(400).json({ message: 'groupId and userId are required.' });
  }

  try {
    const group = await Group.findById(groupId);
    console.log('groupId, userId, newAdminId, group.adminId', groupId, userId, newAdminId, group?.adminId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    // Check if the group is inactive or wrapped
    if (!group.isActive || group.clubStatus === 'Wrap') {
      return res.status(403).json({ message: "Cannot perform action as the group is inactive or wrapped." });
    }

    const productId = group.productId;
    const isMember = group.members.includes(userId);

    if (!isMember) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const userFirstName = user.firstName || "User";
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const productObjectId = new mongoose.Types.ObjectId(productId);

    console.log(userObjectId, "LLLLLLLLLLLLLLLLLLLLLLLLLLLsssssssssss");
    const newAdminObjectId = new mongoose.Types.ObjectId(newAdminId);

    if (group.adminId.equals(userObjectId)) {
      if (!group.isActive) {
        return res.status(403).json({ message: "No action can perform as Group is deactivated." });
      }

      if (newAdminId) {
        const newAdmin = await User.findById(newAdminId);
        if (!newAdmin) {
          return res.status(404).json({ message: "New Admin not found." });
        }

        const newAdminFirstName = newAdmin.firstName || "User";
        console.log('Making Admin working');
        group.adminId = newAdminObjectId;
        group.members = group.members.filter(member => !member.equals(userObjectId));

        const postToUpdate = await Post.findOne({ _id: productObjectId });
        if (postToUpdate) {
          postToUpdate.postOwnerId = newAdminObjectId;
          await postToUpdate.save();
          console.log("Admin updated");
        }

        await group.save();
        await sendSystemMessage(group._id, `${userFirstName} transferred admin rights to ${newAdminFirstName}.`);
        await sendSystemMessage(group._id, `${userFirstName} left the group.`);

        return res.status(200).json({ message: "Admin rights transferred", group });
      } else {
        // Deactivate group if no new admin is specified
        const postToUpdate = await Post.findOne({ _id: productObjectId });
        console.log('Post to be updated is ', postToUpdate, ' productId ', productObjectId);

        if (postToUpdate) {
          postToUpdate.clubStatus = 'Inactive';
          await postToUpdate.save();
          console.log("Post inactive");
        }

        group.isActive = false;
        await group.save();
        await sendSystemMessage(group._id, `${userFirstName} deactivated the group. No one can send messages now.`);

        return res.status(200).json({ message: "Group deactivated" });
      }
    } else {
      console.log("here 2");
      // Normal user leaving the group without voting
      group.members = group.members.filter(member => !member.equals(userObjectId));
      await group.save();
      await sendSystemMessage(group._id, `${userFirstName} has left the group.`);

      return res.status(200).json({ message: "User has left the group", group });
    }
  } catch (error) {
    console.error("Error in leave group:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
exports.isConnected = async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ message: "PostId is required." });
    }
    const group = await Group.findOne({ productId: postId });

    if (!group) {
      return res.status(404).json({ message: "Group not found for this Post." });
    }
    const otherMembers = group.members.filter(
      (memberId) => !memberId.equals(group.adminId)
    );
    if (otherMembers.length > 0) {
      return res.status(200).json({ isConnected: true });
    } else {
      return res.status(200).json({ isConnected: false });
    }
  } catch (error) {
    console.error("Error in isConnected:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.getGroupMembersAndAdmin = async (req, res) => {
  const { groupId } = req.params; // Get groupId from URL params
  console.log("groupId ", groupId);

  try {
    // Find the group by _id (groupId) and populate adminId and members fields
    const group = await Group.findById(groupId)
      .populate("adminId", "firstName avatar") // Populate adminId with admin's firstName and avatar
      .populate("members", "firstName avatar") // Populate members with their firstName and avatar
      .populate("productId", "clubStatus"); // Populate postId with clubStatus

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    const status = group.productId ? group.productId.clubStatus : null;
    const adminDoc = group.adminId;
    const adminId =
      adminDoc?._id ?? adminDoc ?? group.adminId;

    const admin =
      adminDoc && typeof adminDoc.toObject === "function"
        ? { ...adminDoc.toObject(), role: "Admin" }
        : null;

    const members = (group.members || [])
      .filter((member) => member && typeof member.toObject === "function")
      .map((member) => ({
        ...member.toObject(),
        role:
          adminId && member._id.equals(adminId) ? "Admin" : "Member",
      }));

    return res.status(200).json({
      message: "Group details fetched successfully",
      admin,
      members,
      status, // Add status field from Post's clubStatus
    });
  } catch (error) {
    console.error("Error fetching group members and admin:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.getGroupDetails = async (req, res) => {
  const { groupId } = req.params; // Get groupId from URL params
  console.log("groupId hits ", groupId);

  try {
    // Find the group by _id (groupId) and populate productId to fetch product details
    const group = await Group.findById(groupId).populate("productId");

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    console.log('Group is ', group)
    // Fetch the Post associated with the same productId to get productImage
    const posts = await Post.findOne({ _id: group.productId });

    console.log('group.productId is ', group.productId)

    return res.status(200).json({
      message: "Group details fetched successfully",
      groupId: group._id,
      productId: group.productId._id || null,
      groupName: posts.itemName,
      productImage: posts?.productImage || null,
      deletedAt: posts?.deletedAt || null,
      expiryAt: posts?.expiryAt || null,
      clubStatus: posts?.clubStatus || null
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};


exports.getReports = async (req, res) => {
  try {
    const {page = 1, limit = 10} = req.query;
    const skip = (page - 1) * limit;

    const reports = await Report.aggregate([{
      $lookup: {
        from: "users", localField: "userId", foreignField: "_id", as: "user",
      },
    }, {$unwind: "$user"}, {
      $lookup: {
        from: "posts", localField: "groupId", foreignField: "groupId", as: "post",
      },
    }, {$unwind: {path: "$post", preserveNullAndEmptyArrays: true}}, {
      $project: {
        _id: 1, title: 1, details: 1, reportedAt: 1, "user._id": 1, "user.firstName": 1, "user.lastName": 1, "user.avatar": 1, itemName: "$post.itemName", postId: "$post.postId",
      },
    }, {$sort: {reportedAt: -1}}, {$skip: skip}, {$limit: parseInt(limit)},]);

    const totalReports = await Report.countDocuments();

    return res.status(200).json({
      success: true, data: reports, pagination: {
        currentPage: parseInt(page), totalPages: Math.ceil(totalReports / limit), totalReports,
      },
    });

  } catch (error) {
    return res.status(500).json({error: "Internal server error."});
  }
};

