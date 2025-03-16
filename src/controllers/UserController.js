const User = require("../models/User.js");
const Post = require("../models/Post.js");
const {sendSystemMessage} = require("./MessageController");
const Admin = require("../models/Admin");


module.exports = {
  getUsers: async (req, res) => {
    try {
      const {page = 1, limit = 10, keyword = "", status} = req.body;
      const skip = (page - 1) * limit;

      const query = {};

      // Keyword Search (on first name, last name, and email)
      if (keyword) {
        query.$or = [{firstName: {$regex: keyword, $options: "i"}}, {lastName: {$regex: keyword, $options: "i"}}, {email: {$regex: keyword, $options: "i"}}];
      }

      if (status) {
        if (status === "deactivated") {
          query.deletedAt = {$ne: null};
        } else if (status === "paid") {
          // "paid" status filter will be added in the future
        }
      }
      const users = await User.find(query)
        .sort({createdAt: -1})
        .skip(skip)
        .limit(parseInt(limit))
        .select("firstName lastName email userName avatar createdAt deletedAt");

      const totalUsers = await User.countDocuments(query);

      return res.status(200).json({
        message: "Users fetched successfully", data: users, pagination: {
          currentPage: parseInt(page), totalPages: Math.ceil(totalUsers / limit), totalUsers
        }
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({message: error.message || "Internal server error."});
    }
  },

  getUserDetails: async (req, res) => {
    try {
      const {id} = req.params;
      if (!id) {
        return res.status(400).json({error: "User ID is required"});
      }

      // Fetch the user details
      const user = await User.findById(id).lean();
      if (!user) {
        return res.status(404).json({error: "User not found"});
      }

      let deactivatedByAdmin = null;
      if (user.deactivatedByAdminId) {
        deactivatedByAdmin = await Admin.findById(user.deactivatedByAdminId).select("name image").lean();
      }

      return res.status(200).json({
        message: "User details fetched successfully", data: {...user, deactivatedByAdmin},
      });

    } catch (error) {
      console.error("Error in getUserDetails:", error);
      return res.status(500).json({error: error.message || "Internal Server Error"});
    }
  },

  deactivateUser: async (req, res) => {
    try {
      const {id} = req.params;
      const {note} = req.body;
      const adminId = req.Admin?._id;

      if (!id) {
        return res.status(400).json({error: "User ID is required."});
      }
      if (!note || note.trim().length === 0) {
        return res.status(400).json({error: "Deactivation note is required."});
      }

      // Check if the user exists
      const existingUser = await User.findById(id);
      if (!existingUser) {
        return res.status(404).json({error: "User not found."});
      }

      // Find all posts where the user is the owner
      const posts = await Post.find({postOwnerId: id});

      if (posts.length > 0) {
        const groupIds = posts.map(post => post.groupId).filter(groupId => groupId); // Remove nulls

        // Soft delete all posts by updating `deletedAt`
        await Post.updateMany({postOwnerId: id}, {
          deletedAt: new Date(), deactivatedByAdminId: adminId, deactivationNote: 'The post owner has been deactivated.'
        });

        // Send system messages to all affected groups
        await Promise.all(groupIds.map(groupId => sendSystemMessage(groupId, "Group has been deactivated as the post owner's account has been deactivated.")));
      }

      // Soft delete the user
      await User.findByIdAndUpdate(id, {
        deletedAt: new Date(), deactivatedByAdminId: adminId, deactivationNote: note,
      }, {new: true});

      return res.status(200).json({message: "User and associated posts deactivated successfully."});
    } catch (error) {
      console.error("Error in deactivateUser:", error);
      return res.status(500).json({error: error.message || "Internal server error."});
    }
  }
}
