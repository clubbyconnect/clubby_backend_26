const Group = require('../models/group.js'); // Import Group model
const mongoose = require("mongoose");

const GroupController = {
  member: async (req, res) => {
    try {
      const {postId} = req.params;

      if (!postId) {
        return res.status(400).json({error: "Post ID is required"});
      }

      // Find the group by productId and select only members
      const group = await Group.findOne({productId: postId}).populate(
        'members',
        '_id firstName lastName email avatar'
      );

      if (!group) {
        return res.status(404).json({error: "No group found for this post"});
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
  },


  getGroupsForUser: async (req, res) => {
    try {
      const userId = req.User._id;
      let { keyword, page = 1, limit = 20 } = req.body;

      // Ensure `page` and `limit` are numbers
      page = parseInt(page, 10);
      limit = parseInt(limit, 10);
      const skip = (page - 1) * limit;

      // Validate userId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID.' });
      }

      // Convert userId to ObjectId
      const userIdObjectId = new mongoose.Types.ObjectId(userId);

      // Aggregation pipeline to fetch groups with the last message
      const aggregationPipeline = [
        // Match groups where the user is a member
        { $match: { members: { $in: [userIdObjectId] } } },

        // Lookup to fetch product details
        {
          $lookup: {
            from: 'posts',
            localField: 'productId',
            foreignField: '_id',
            as: 'productDetails',
          },
        },
        { $unwind: '$productDetails' },

        // Lookup to fetch the last message for each group
        {
          $lookup: {
            from: 'messages',
            let: { groupId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$groupId', '$$groupId'] } } }, // Match messages by groupId
              { $sort: { createdAt: -1 } }, // Sort by createdAt in descending order
              { $limit: 1 }, // Limit to the last message
              {
                $lookup: {
                  from: 'users',
                  localField: 'senderId',
                  foreignField: '_id',
                  as: 'senderDetails',
                  pipeline: [
                    {
                      $project: {
                        _id: 1, // Include _id
                        firstName: 1, // Include firstName
                        lastName: 1, // Include lastName
                        avatar: 1, // Include avatar
                      },
                    },
                  ],
                },
              },
              {
                $addFields: {
                  senderDetails: { $arrayElemAt: ['$senderDetails', 0] }, // Convert array to object
                },
              },
              {
                $project: {
                  content: 1,
                  type: 1,
                  createdAt: 1,
                  senderId: 1,
                  readBy: 1,
                  senderDetails: 1, // Include senderDetails as an object
                },
              },
            ],
            as: 'lastMessage',
          },
        },
        { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } }, // Unwind lastMessage

        // Add memberCount field (length of the members array)
        {
          $addFields: {
            memberCount: { $size: '$members' }, // Calculate the length of the members array
          },
        },

        // Apply search filtering if keyword is provided
        ...(keyword
          ? [
            {
              $match: {
                'productDetails.itemName': {
                  $regex: keyword,
                  $options: 'i',
                },
              },
            },
          ]
          : []),

        // Sort groups by the last message's createdAt timestamp (descending order)
        { $sort: { 'lastMessage.createdAt': -1 } },

        // Project the required fields
        {
          $project: {
            productImage: '$productDetails.productImage',
            productName: '$productDetails.itemName',
            clubStatus: '$productDetails.clubStatus',
            expiryAt: '$productDetails.expiryAt',
            deletedAt: '$productDetails.deletedAt',
            lastMessage: 1, // Include the last message
            memberCount: 1, // Include the member count
          },
        },

        // Pagination
        { $skip: skip },
        { $limit: limit },
      ];

      // Execute the aggregation pipeline
      const groups = await Group.aggregate(aggregationPipeline);

      // Get total count for pagination metadata
      const totalGroups = await Group.countDocuments({ members: { $in: [userIdObjectId] } });

      return res.status(200).json({
        groups,
        totalPages: Math.ceil(totalGroups / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error('Error fetching groups for user:', error);
      return res.status(500).json({ message: 'Internal server error.' });
    }
  },
};

module.exports = GroupController;
