const mongoose = require('mongoose');
const User = require("../models/User.js");
const post = require("../models/Post.js");
const Report = require('../models/ReportSchema.js');
const Group = require('../models/Group.js');
const Message = require('../models/Message.js');


exports.removeUserFromGroup = async (req, res) => {
    const { groupId, removeUserId, adminId } = req.body;

    if (!groupId || !removeUserId || !adminId) {
        return res.status(400).json({ message: 'groupId, userId, and adminId are required.' });
    }

    try {
        // Find the group by groupId
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        // Check if the admin is the person making the request
        if (!group.adminId.equals(adminId)) {
            return res.status(403).json({ message: "You are not authorized to remove users from this group." });
        }

        // Check if the user is a member of the group
        const isMember = group.members.includes(removeUserId);
        if (!isMember) {
            return res.status(403).json({ message: "User is not a member of this group." });
        }

        // Remove the user from the group's members array
        group.members = group.members.filter(member => !member.equals(removeUserId));
        await group.save();

        // Send system message to notify the group about the removal
        const user = await User.findById(removeUserId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const userFirstName = user.firstName || "User";

        await exports.sendSystemMessage(group._id, `${userFirstName} has been removed from the group by Admin.`);

        // Return success response
        return res.status(200).json({ message: `${userFirstName} has been removed from the group.`, group });

    } catch (error) {
        console.error("Error removing user from group:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getFirst4MediaMessages = async (req, res) => {
    const { groupId } = req.params;

    try {
        // Retrieve the latest 4 media messages (image or video) for the given groupId
        const messages = await Message.find({
            groupId,
            type: { $in: ['image', 'video'] }
        })
            .sort({ createdAt: -1 }) // Sort by latest messages first
            .limit(4)  // Limit to 4 messages
            .populate('senderId', 'firstName avatar'); // Populate senderId to get username

        return res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching latest 4 media messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getAllMediaMessages = async (req, res) => {
    const { groupId } = req.params;

    try {
        // Retrieve all media messages (image or video) for the given groupId
        const messages = await Message.find({
            groupId,
            type: { $in: ['image', 'video'] }
        })
            .populate('senderId', 'firstName avatar') // Populate senderId to get username
            .sort({ createdAt: -1 }); // Sort messages by latest first

        // Group messages by date
        // const groupedMessages = messages.reduce((acc, message) => {
        //   const date = moment(message.createdAt).format('YYYY-MM-DD'); // Format date
        //   if (!acc[date]) {
        //     acc[date] = [];
        //   }
        //   acc[date].push(message);
        //   return acc;
        // }, {});

        return res.status(200).json({ media: messages });
    } catch (error) {
        console.error("Error fetching all media messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.wrapDeal = async (req, res) => {
    const { groupId, reviews } = req.body;
    console.log("groupId, reviews ", groupId, reviews);

    try {
        // Find the group to get the associated post (product)
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        // Fetch the associated post (product)
        const product = await post.findById(group.productId);

        if (!product) {
            return res.status(404).json({ message: "Post not found." });
        }

        // Check if the post is already "Wrap" or "Inactive"
        if (product.clubStatus === "Wrap" || product.clubStatus === "Inactive") {
            return res.status(403).json({
                message: "No action performed as the group is Inactive or already Wrapped.",
            });
        }
        console.log('product is ', product)

        // Update the post (product) status to "Wrap"
        await post.findByIdAndUpdate(group.productId, { clubStatus: "Wrap" });

        // Process reviews if they exist
        if (reviews) {
            for (const review of reviews) {
                const user = await User.findById(review.userId);
                if (!user) continue;

                // Adjust the new rating based on current rating
                const currentRating = user.UserRating || 0;
                const newRating =
                    currentRating === 0 ? review.rating : review.rating / 2;
                console.log(
                    "Current rating:",
                    currentRating,
                    "New rating:",
                    newRating,
                    "Review rating:",
                    review.rating
                );

                // Update user's rating
                await User.findByIdAndUpdate(review.userId, {
                    $inc: { UserRating: newRating },
                });
            }
        }

        await exports.sendSystemMessage(groupId, `Deal has been wrapped.`);
        res
            .status(200)
            .json({ message: "Group and post wrapped successfully, ratings updated." });
    } catch (error) {
        console.error("Error in wrapDeal:", error);
        res.status(500).json({
            error: "An error occurred while updating the group and post status.",
        });
    }
};

exports.sortReports = async (req, res) => {

    try {
        // Determine the sort field based on the query
        let sortCriteria = {};
        sortCriteria = { reportedAt: -1 };  // Descending order for reportedAt


        // Retrieve sorted reports
        const reports = await Report.find().sort(sortCriteria);

        // Return sorted reports
        return res.status(200).json(reports);
    } catch (error) {
        console.error("Error sorting reports:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getAllReports = async (req, res) => {
    try {
        // Retrieve all reports
        const reports = await Report.find()
            .populate('groupId', 'productName')  // Populate group name
            .populate('userId', 'firstName avatar');  // Populate user info

        // Return reports in the response
        return res.status(200).json(reports);
    } catch (error) {
        console.error("Error fetching all reports:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.createReport = async (req, res) => {
    const { groupId, userId, title, details } = req.body;
    console.log('groupId, userId, title, details ', groupId, userId, title, details)
    try {
        // Validate required fields
        if (!groupId || !userId || !title || !details) {
            return res.status(400).json({ message: "All fields are required." });
        }

        // Create the new report
        const newReport = new Report({
            groupId,
            userId,
            title,
            details,
        });

        // Save the report to the database
        await newReport.save();

        // Return success response
        return res.status(201).json({ message: "Report created successfully.", report: newReport });
    } catch (error) {
        console.error("Error creating report:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};
