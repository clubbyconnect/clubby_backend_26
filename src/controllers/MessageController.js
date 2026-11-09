const uploadOnCloudinary = require("../utils/Cloudinary.js");
const Group = require('../models/Group.js');
const Message = require('../models/Message.js');
const User = require('../models/User.js');
const { getIO } = require("../sockets/Chat.js");

const admin = require("../utils/Firebase.js")
const { addNotification } = require("./NotificationController.js");
const { getUserMembership, getMembershipAudit } = require("../utils/groupMembership.js");


exports.sendMessage = async (req, res) => {
    const imageFile = req.files?.image ? req.files.image[0] : null;
    const audioFile = req.files?.audio ? req.files.audio[0] : null;
    const videoFile = req.files?.video ? req.files.video[0] : null;
    const { groupId, messageType, messageContent } = req.body;
    const userId = req.User._id;

    try {
        const group = await Group.findById(groupId).populate('productId'); // Populate the related Post

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

        const membership = getUserMembership(group, userId);
        if (membership.status !== "active") {
            return res.status(403).json({
                error:
                    membership.status === "left"
                        ? "You're no longer part of this group. New messages are hidden."
                        : "You are not a member of this group.",
                membershipStatus: membership.status,
                readOnly: membership.status === "left",
            });
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

        const io = getIO();
        if (io) {
            const payload = {
                ...newMessage.toObject?.() ?? newMessage,
                groupId: groupId.toString(),
            };
            io.to(groupId.toString()).emit("newMessage", payload);
            group.members.forEach((member) => {
                io.to(member.toString()).emit("recentChats", payload);
            });
        }


        // const result = await checkUserFCMAndDevice(userId);

        // if (result.status) {
        //     console.log("User has FCM Token:", result.fcmToken);

        //     let message = {
        //         token: result.fcmToken,
        //         notification: {
        //             title: `New Message from ${groupId}`,
        //             body: `${userId}: ${messageType === 'image' ? 'sent an image' : messageType === 'audio' ? 'sent an audio' : messageType === 'video' ? 'sent an video' : finalMessageContent}`
        //         }
        //     };

        //     admin.messaging().send(message)
        //         .then(response => {
        //             console.log('Successfully sent message:', response);
        //         })
        //         .catch(error => {
        //             console.error('Error sending message:', error);
        //         });

        // } else {
        //     console.log("User does not have a valid FCM Token or Device Type.");
        // }

        const sender = await User.findById(userId).select('firstName').lean();
        const senderLabel = sender?.firstName || 'Someone';
        const groupTitle =
            group.productName?.trim() ||
            post?.itemName?.trim() ||
            'Group chat';
        const preview =
            messageType === 'image'
                ? 'sent a photo'
                : messageType === 'audio'
                    ? 'sent a voice message'
                    : messageType === 'video'
                        ? 'sent a video'
                        : String(finalMessageContent || '').trim();

        for (const member of group.members) {
            const memberId = member?._id ?? member;
            if (String(memberId) === String(userId)) {
                continue;
            }
            const success = await addNotification(
                groupTitle,
                `${senderLabel}: ${preview}`,
                memberId,
                'Message',
                `clubby://Message/${groupId}`,
                groupId,
                'Group',
            );
        }


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
            const io = getIO();
            if (io) {
                io.to(message.groupId.toString()).emit("messageRead", { messageId, userId });
            }
        }

        return res.status(200).json({ message: "Message marked as read." });
    } catch (error) {
        console.error("Error marking message as read:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getMessagesForGroup = async (req, res) => {
    const { groupId } = req.params;
    const userId = req.User._id;

    try {
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        const membership = getUserMembership(group, userId);
        if (membership.status === "none") {
            return res.status(403).json({ message: "You do not have access to this group." });
        }

        const query = { groupId };
        if (membership.status === "left" && membership.leftAt) {
            query.createdAt = { $lte: membership.leftAt };
        }

        const messages = await Message.find(query)
            .populate('senderId', 'firstName lastName userName avatar UserRating')
            .sort({ createdAt: 1 });

        return res.status(200).json({
            messages,
            groupId: group._id,
            membershipStatus: membership.status,
            leftAt: membership.leftAt,
            readOnly: membership.status === "left",
            membershipAudit: getMembershipAudit(group, userId),
        });
    } catch (error) {
        console.error("Error fetching messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.sendSystemMessageHandler = async (req, res) => {
    const { groupId, content } = req.body;

    if (!groupId || !content) {
        return res.status(400).json({ message: "groupId and content are required." });
    }

    try {
        await exports.sendSystemMessage(groupId, content);
        return res.status(200).json({ message: "System message sent." });
    } catch (error) {
        console.error("Error sending system message:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.sendSystemMessage = async (groupId, content) => {
    try {
        const newMessage = await Message.create({
            groupId,
            content,
            type: "system",
        });

        const io = getIO();
        if (io) {
            io.to(groupId.toString()).emit("newMessage", newMessage);
        }

        return newMessage;
    } catch (error) {
        console.error("sendSystemMessage failed (non-fatal):", error?.stack || error);
        return null;
    }
};
