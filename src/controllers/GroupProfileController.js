const mongoose = require("mongoose");
const User = require("../models/User.js");
const Post = require("../models/Post.js");
const Report = require('../models/ReportSchema.js');
const Group = require('../models/Group.js');
const Message = require('../models/Message.js');
const { sendSystemMessage } = require("./MessageController.js");
const { getUserMembership, recordUserLeft } = require("../utils/groupMembership.js");


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

        const removeUserObjectId = new mongoose.Types.ObjectId(removeUserId);
        const isMember = group.members.some((member) =>
            new mongoose.Types.ObjectId(member?._id ?? member).equals(removeUserObjectId),
        );
        if (!isMember) {
            return res.status(403).json({ message: "User is not a member of this group." });
        }

        recordUserLeft(group, removeUserObjectId);
        await group.save();

        // Send system message to notify the group about the removal
        const user = await User.findById(removeUserId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const userFirstName = user.firstName || "User";

        await sendSystemMessage(group._id, `${userFirstName} has been removed from the group by Admin.`);

        // Return success response
        return res.status(200).json({ message: `${userFirstName} has been removed from the group.`, group });

    } catch (error) {
        console.error("Error removing user from group:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getFirst4MediaMessages = async (req, res) => {
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

        const query = {
            groupId,
            type: { $in: ['image', 'video', 'audio', 'file'] },
        };
        if (membership.status === "left" && membership.leftAt) {
            query.createdAt = { $lte: membership.leftAt };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(4)
            .populate('senderId', 'firstName lastName userName avatar UserRating');

        return res.status(200).json({
            messages,
            membershipStatus: membership.status,
            leftAt: membership.leftAt,
            readOnly: membership.status === "left",
        });
    } catch (error) {
        console.error("Error fetching latest 4 media messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.getAllMediaMessages = async (req, res) => {
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

        const query = {
            groupId,
            type: { $in: ['image', 'video', 'audio', 'file'] },
        };
        if (membership.status === "left" && membership.leftAt) {
            query.createdAt = { $lte: membership.leftAt };
        }

        const messages = await Message.find(query)
            .populate('senderId', 'firstName lastName userName avatar UserRating')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            media: messages,
            membershipStatus: membership.status,
            leftAt: membership.leftAt,
            readOnly: membership.status === "left",
        });
    } catch (error) {
        console.error("Error fetching all media messages:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

async function applyWrapReviews(reviews) {
    if (!Array.isArray(reviews)) {
        return;
    }
    for (const review of reviews) {
        const user = await User.findById(review.userId);
        if (!user) continue;
        const currentRating = user.UserRating || 0;
        const newRating =
            currentRating === 0 ? review.rating : review.rating / 2;
        await User.findByIdAndUpdate(review.userId, {
            $inc: { UserRating: newRating },
        });
    }
}

async function finalizeWrapDeal(group, reviews) {
    const product = await Post.findById(group.productId);
    if (!product) {
        return { ok: false, status: 404, message: "Post not found." };
    }
    if (product.clubStatus === "Wrap" || product.clubStatus === "Inactive") {
        return {
            ok: false,
            status: 403,
            message: "No action performed as the group is Inactive or already Wrapped.",
        };
    }
    await Post.findByIdAndUpdate(group.productId, { clubStatus: "Wrap" });
    await applyWrapReviews(reviews);
    await sendSystemMessage(group._id, "Deal has been wrapped.");
    return { ok: true, message: "Group and Post wrapped successfully, ratings updated." };
}

function inferRequiresBillForWrap(post) {
    if (!post) return false;
    if (typeof post.requiresBillForWrap === "boolean") {
        return post.requiresBillForWrap;
    }
    const policyText = String(
        post.returnPolicyText ||
        post.returnExchangePolicy ||
        post.additionalInformation ||
        "",
    ).toLowerCase();
    if (!policyText) return false;
    const hasReturnPolicy = /return|exchange|replace|refund/.test(policyText);
    const requiresReceipt = /bill|receipt|invoice|proof of purchase|purchase proof/.test(
        policyText,
    );
    return hasReturnPolicy && requiresReceipt;
}

function buildWrapVotePayload(group, viewerId, requiresBillForWrap) {
    const memberCount = (group.members || []).length;
    const wrapVotes = group.wrapVotes || [];
    const voteCount = wrapVotes.length;
    const viewerHasVoted = wrapVotes.some((v) =>
        new mongoose.Types.ObjectId(v.userId).equals(viewerId),
    );
    const votedUserIds = wrapVotes.map((v) => String(v.userId));
    return {
        dealBillUrl: group.dealBillUrl || null,
        dealBillUploadedAt: group.dealBillUploadedAt || null,
        wrapVoteCount: voteCount,
        wrapVoteTotal: memberCount,
        wrapVotesComplete: memberCount > 0 && voteCount >= memberCount,
        viewerHasVoted,
        votedUserIds,
        requiresBillForWrap: Boolean(requiresBillForWrap),
    };
}

exports.uploadDealBill = async (req, res) => {
    const { groupId, billUrl } = req.body;

    if (!groupId || !billUrl || typeof billUrl !== "string" || !billUrl.trim()) {
        return res.status(400).json({ message: "groupId and billUrl are required." });
    }

    try {
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        const membership = getUserMembership(group, req.User._id);
        if (membership.status === "left") {
            return res.status(403).json({
                message: "You're no longer part of this group.",
                membershipStatus: "left",
                readOnly: true,
            });
        }
        if (membership.status === "none") {
            return res.status(403).json({ message: "You do not have access to this group." });
        }

        const product = await Post.findById(group.productId);
        if (!product) {
            return res.status(404).json({ message: "Post not found." });
        }
        if (product.clubStatus === "Wrap" || product.clubStatus === "Inactive") {
            return res.status(403).json({
                message: "Cannot upload a bill — the deal is already wrapped or inactive.",
            });
        }

        group.dealBillUrl = billUrl.trim();
        group.dealBillUploadedAt = new Date();
        group.dealBillUploadedBy = req.User._id;
        group.wrapVotes = [];
        await group.save();

        await sendSystemMessage(
            groupId,
            "All members can see the bill. Ask everyone to vote and close the deal.",
        );

        return res.status(200).json({
            message: "Bill uploaded successfully.",
            ...buildWrapVotePayload(
                group,
                req.User._id,
                inferRequiresBillForWrap(product),
            ),
        });
    } catch (error) {
        console.error("Error in uploadDealBill:", error);
        return res.status(500).json({ message: "Failed to upload bill." });
    }
};

exports.voteWrapDeal = async (req, res) => {
    const { groupId, reviews } = req.body;

    if (!groupId) {
        return res.status(400).json({ message: "groupId is required." });
    }

    try {
        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        const membership = getUserMembership(group, req.User._id);
        if (membership.status === "left") {
            return res.status(403).json({
                message: "You're no longer part of this group.",
                membershipStatus: "left",
                readOnly: true,
            });
        }
        if (membership.status === "none") {
            return res.status(403).json({ message: "You do not have access to this group." });
        }

        const product = await Post.findById(group.productId);
        if (!product) {
            return res.status(404).json({ message: "Post not found." });
        }
        const requiresBillForWrap = inferRequiresBillForWrap(product);
        if (product.clubStatus === "Wrap" || product.clubStatus === "Inactive") {
            return res.status(403).json({
                message: "This deal is already wrapped or inactive.",
            });
        }

        if (requiresBillForWrap && !group.dealBillUrl) {
            return res.status(400).json({
                message: "The admin must upload the bill before members can vote to wrap.",
                billRequired: true,
                requiresBillForWrap: true,
            });
        }

        const viewerId = req.User._id;
        const alreadyVoted = (group.wrapVotes || []).some((v) =>
            new mongoose.Types.ObjectId(v.userId).equals(viewerId),
        );

        const isAdmin = group.adminId.equals(viewerId);
        if (isAdmin && Array.isArray(reviews) && reviews.length > 0) {
            group.pendingWrapReviews = reviews;
        }

        if (!alreadyVoted) {
            group.wrapVotes = group.wrapVotes || [];
            group.wrapVotes.push({ userId: viewerId, votedAt: new Date() });
            await group.save();
        } else if (isAdmin && Array.isArray(reviews)) {
            await group.save();
        }

        const memberCount = (group.members || []).length;
        const voteCount = (group.wrapVotes || []).length;
        let wrapped = false;
        let wrapMessage = "Your vote has been recorded.";

        if (voteCount >= memberCount && memberCount > 0) {
            const reviewPayload =
                group.pendingWrapReviews?.length > 0
                    ? group.pendingWrapReviews
                    : isAdmin && Array.isArray(reviews)
                      ? reviews
                      : null;
            const result = await finalizeWrapDeal(group, reviewPayload);
            if (result.ok) {
                wrapped = true;
                wrapMessage = result.message;
            } else {
                return res.status(result.status || 500).json({ message: result.message });
            }
        } else {
            wrapMessage = `Vote recorded (${voteCount}/${memberCount}). Waiting for all members to vote.`;
        }

        const refreshed = await Group.findById(groupId);
        return res.status(200).json({
            message: wrapMessage,
            wrapped,
            ...buildWrapVotePayload(
                refreshed || group,
                viewerId,
                requiresBillForWrap,
            ),
        });
    } catch (error) {
        console.error("Error in voteWrapDeal:", error);
        return res.status(500).json({ message: "Failed to record wrap vote." });
    }
};

/** @deprecated Prefer voteWrapDeal — kept for older app builds */
exports.wrapDeal = async (req, res) => {
    const { groupId } = req.body;
    if (!groupId) {
        return res.status(400).json({ message: "groupId is required." });
    }
    return res.status(400).json({
        message:
            "Wrap requires every member to vote after the admin uploads the bill. Use voteWrapDeal instead.",
        useVoteWrapDeal: true,
    });
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
        const reports = await Report.find()
            .populate('groupId', 'productName productId')
            .populate('postId', 'itemName productImage')
            .populate('userId', 'firstName lastName avatar')
            .sort({ reportedAt: -1 });

        return res.status(200).json(reports);
    } catch (error) {
        console.error("Error fetching all reports:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

exports.createReport = async (req, res) => {
    const { groupId, userId: bodyUserId, title, details, postId: bodyPostId } = req.body;
    const reporterId = req.User._id;
    try {
        if (!groupId || !title || !details) {
            return res.status(400).json({
                message: "groupId, title, and details are required.",
            });
        }

        if (bodyUserId && String(bodyUserId) !== String(reporterId)) {
            return res.status(403).json({ message: "userId must match the authenticated user." });
        }

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found." });
        }

        const postId = bodyPostId || group.productId;
        if (!postId) {
            return res.status(400).json({ message: "postId is required for this report." });
        }
        if (!group.productId) {
            return res.status(400).json({ message: "Group is not linked to a post." });
        }
        if (String(postId) !== String(group.productId)) {
            return res.status(400).json({ message: "postId does not match this group." });
        }

        const membership = getUserMembership(group, req.User._id);
        if (membership.status === "left") {
            return res.status(403).json({
                message: "You're no longer part of this group.",
                membershipStatus: "left",
                readOnly: true,
            });
        }
        if (membership.status === "none") {
            return res.status(403).json({ message: "You do not have access to this group." });
        }

        const newReport = new Report({
            groupId,
            postId,
            userId: reporterId,
            title: String(title).trim(),
            details: String(details).trim(),
        });

        await newReport.save();

        // Return success response
        return res.status(201).json({ message: "Report created successfully.", report: newReport });
    } catch (error) {
        console.error("Error creating report:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};
