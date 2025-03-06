const mongoose = require('mongoose');
const uploadOnCloudinary = require("../utils/Cloudinary.js");
const Group = require('../models/Group.js');
const Message = require('../models/Message.js');
const { getIO } = require("../sockets/Chat.js");

exports.sendMessage = async (req, res) => {
    console.log('Request body:', req.body);
    console.log('req.file ', req.file);

    const imageFile = req.files?.image ? req.files.image[0] : null;
    const audioFile = req.files?.audio ? req.files.audio[0] : null;
    const videoFile = req.files?.video ? req.files.video[0] : null;

    console.log('Audio file:', audioFile);
    console.log('Image file:', imageFile);
    console.log('Video file:', videoFile);

    const { groupId, messageType, messageContent } = req.body;
    console.log('req.User is ', req.User);
    const userId = req.User._id;

    try {
        const group = await Group.findById(groupId).populate('productId'); // Populate the related post

        if (!group) {
            return res.status(404).json({ error: "Group not found." });
        }

        const post = group.productId; // Fetch the associated post

        if (!post) {
            return res.status(404).json({ error: "Related post not found." });
        }

        // Check if the post's clubStatus is "Inactive" or "Wrap"
        if (post.clubStatus === "Inactive" || post.clubStatus === "Wrap") {
            return res.status(403).json({ error: "No one can send message as Post is Inactive or Wrapped." });
        }

        // Check if the post is expired
        if (new Date(post.expiryAt) < new Date()) {
            return res.status(403).json({ error: "No one can send message as Post is expired." });
        }

        console.log('group is ', group.isActive);

        // Check if the user is a member of the group
        const isMember = group.members.includes(userId);
        if (!isMember) {
            return res.status(403).json({ error: "You are not a member of this group." });
        }

        // Check if the group is active
        if (!group.isActive) {
            return res.status(403).json({ error: "No one can send messages as the group is deactivated." });
        }

        let finalMessageContent = messageContent;

        if (messageType === 'image') {
            const imageLocalPath = imageFile?.path;
            if (!imageLocalPath) {
                return res.status(400).json({ error: "Image file is required for image messages" });
            }

            const cloudinaryResult = await uploadOnCloudinary(imageLocalPath);
            if (!cloudinaryResult || !cloudinaryResult.secure_url) {
                return res.status(500).json({ error: "Failed to upload image to Cloudinary" });
            }

            finalMessageContent = cloudinaryResult.secure_url;
        }

        if (messageType === 'audio') {
            const audioLocalPath = audioFile?.path;
            if (!audioLocalPath) {
                return res.status(400).json({ error: "Audio file is required for audio messages" });
            }

            console.log('audio part...');

            const cloudinaryResult = await uploadOnCloudinary(audioLocalPath);
            if (!cloudinaryResult || !cloudinaryResult.secure_url) {
                return res.status(500).json({ error: "Failed to upload Audio to Cloudinary" });
            }

            console.log('audio part URL ', cloudinaryResult.secure_url);
            finalMessageContent = cloudinaryResult.secure_url;
        }

        if (messageType === 'video') {
            const videoLocalPath = videoFile?.path;
            if (!videoLocalPath) {
                return res.status(400).json({ error: "Video file is required for video messages" });
            }

            const cloudinaryResult = await uploadOnCloudinary(videoLocalPath);
            if (!cloudinaryResult || !cloudinaryResult.secure_url) {
                return res.status(500).json({ error: "Failed to upload video to Cloudinary" });
            }

            finalMessageContent = cloudinaryResult.secure_url;
        }

        const newMessage = await Message.create({
            groupId,
            senderId: userId,
            content: finalMessageContent,
            type: messageType,
        });

        group.messages.push(newMessage._id);
        await group.save();

        // Emit the new message to the group members
        const io = getIO();
        io.to(groupId.toString()).emit("newMessage", newMessage);

        // Emit an event to update the recent chats list for all group members
        group.members.forEach((member) => {
            io.to(member.toString()).emit('recentChats', newMessage);
        });

        return res.status(200).json(newMessage);

    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
};

exports.markMessageAsRead = async (req, res) => {
    const { messageId } = req.body;
    const userId = req.User._id;

    try {
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found." });
        }

        // Use $addToSet to prevent duplicate entries
        const updateResult = await Message.updateOne(
            { _id: messageId, "readBy.userId": { $ne: userId } },
            { $push: { readBy: { userId, readAt: new Date() } } }
        );

        if (updateResult.modifiedCount > 0) {
            // Emit the read receipt to all users in the group only if the update occurred
            const io = getIO();
            io.to(message.groupId.toString()).emit("messageRead", { messageId, userId });
        }

        return res.status(200).json({ message: "Message marked as read." });
    } catch (error) {
        console.error("Error marking message as read:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getMessagesForGroup = async (req, res) => {
    const { groupId } = req.params;

    try {
        // Retrieve all messages for the given groupId
        const messages = await Message.find({ groupId })
            .populate('senderId', 'firstName avatar') // Populate senderId to get username
            .sort({ createdAt: 1 }) // Sort messages by creation date in ascending order (oldest first)

        // Return messages in the response
        return res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.sendSystemMessage = async (groupId, content) => {
    const newMessage = await Message.create({
        groupId,
        content,
        type: "system", // Assuming there's a 'system' type in your Message model
        timestamp: new Date(),
    });

    console.log('In the system message ', groupId.toString())
    const io = getIO(); // Emit the updated admin to the group members
    // Emit groupId and content along with the new message
    io.to(groupId.toString()).emit("newMessage", newMessage);

    console.log(`Emitting new message to.. group ${groupId}:`, newMessage);

};
