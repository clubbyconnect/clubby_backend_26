const Group = require('../models/Group'); // Import Group model

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
  }
};

module.exports = GroupController;
