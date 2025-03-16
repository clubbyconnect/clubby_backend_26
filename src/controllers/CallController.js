const Call = require('../models/Call');
const Group = require('../models/Group');
const { getIO } = require("../sockets/Chat.js");


// Start a call
exports.startCall = async (req, res) => {
    const { groupId, type } = req.body;
    const io = getIO();


    try {
        let existingCall = await Call.findOne({ groupId, isActive: true });

        if (!existingCall) {
            const call = new Call({ groupId, type });
            await call.save();
            existingCall = call;
        }

        io.to(groupId).emit('call-started', { groupId, type, existingCall });

        setTimeout(async () => {
            const checkCall = await Call.findById(existingCall._id);
            if (checkCall && checkCall.participants.length === 0) {
                await Call.findByIdAndDelete(existingCall._id);
                io.to(groupId).emit('call-ended', { groupId: groupId });
            }
        }, 30000);

        res.status(201).json(existingCall);
    } catch (err) {
        res.status(500).json({ message: 'Error starting call', error: err });
    }
};

// Join a call
exports.joinCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();


    try {
        const userInCall = await Call.findOne({ participants: userId });

        if (userInCall) {
            await Call.findByIdAndUpdate(userInCall._id, { $pull: { participants: userId } });
            if (userInCall.participants.length === 1) {
                await Call.findByIdAndDelete(userInCall._id);
                io.to(userInCall.groupId.toString()).emit('call-ended', { groupId: groupId });
            }
        }

        const call = await Call.findOneAndUpdate(
            { groupId, isActive: true },
            { $addToSet: { participants: userId } },
            { new: true }
        );

        if (call) io.to(groupId).emit('user-joined', { groupId, userId });

        res.status(200).json(call);
    } catch (err) {
        res.status(500).json({ message: 'Error joining call', error: err });
    }
};

// Leave a call
exports.leaveCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();


    try {
        const call = await Call.findOneAndUpdate(
            { groupId, isActive: true },
            { $pull: { participants: userId } },
            { new: true }
        );

        if (call && call.participants.length === 0) {
            await Call.findByIdAndDelete(call._id);
            io.to(groupId).emit('call-ended', { message: 'Call ended as last user left.' });
        } else {
            io.to(groupId).emit('user-left', { userId });
        }

        res.status(200).json({ message: 'User left call' });
    } catch (err) {
        res.status(500).json({ message: 'Error leaving call', error: err });
    }
};

// End Call Manually
exports.endCall = async (req, res) => {
    const { groupId } = req.body;
    const io = getIO();


    try {
        await Call.findOneAndDelete({ groupId });
        io.to(groupId).emit('call-ended', { message: 'Call ended by user.' });

        res.status(200).json({ message: 'Call ended' });
    } catch (err) {
        res.status(500).json({ message: 'Error ending call', error: err });
    }
};

// Cancel Call
exports.cancelCall = async (req, res) => {
    const { groupId } = req.body;
    const io = getIO();


    try {
        const call = await Call.findOneAndDelete({ groupId, isActive: true });
        if (!call) return res.status(404).json({ message: 'No active call to cancel.' });

        io.to(groupId).emit('call-canceled', { message: 'Call was canceled.' });
        res.status(200).json({ message: 'Call canceled' });
    } catch (err) {
        res.status(500).json({ message: 'Error canceling call', error: err });
    }
};

// Reject Call
exports.rejectCall = async (req, res) => {
    const { groupId, userId } = req.body;

    const io = getIO();

    try {
        const call = await Call.findOne({ groupId, isActive: true });
        if (!call) return res.status(404).json({ message: 'No active call to reject.' });

        io.to(groupId).emit('call-rejected', { userId, message: 'Call was rejected by a user.' });
        res.status(200).json({ message: 'Call rejected' });
    } catch (err) {
        res.status(500).json({ message: 'Error rejecting call', error: err });
    }
};




//

// Track call start
exports.trackCallStart = async (req, res) => {
    const { groupId, type, initiatorId } = req.body;
    const io = getIO();

    try {
        // Check for existing active call in this group
        let existingCall = await Call.findOne({ groupId, isActive: true });

        if (!existingCall) {
            // Create new call record
            const call = new Call({
                groupId,
                type,
                initiatorId,
                participants: [initiatorId],
                startTime: new Date()
            });
            await call.save();
            existingCall = call;

            // Optional: Notify group members about call
            io.to(groupId).emit('call-started', {
                groupId,
                type,
                callId: existingCall._id,
                initiatorId
            });
        } else {
            // Update existing call with this participant
            if (!existingCall.participants.includes(initiatorId)) {
                existingCall.participants.push(initiatorId);
                await existingCall.save();
            }
        }

        res.status(201).json(existingCall);
    } catch (err) {
        console.error('Error tracking call start:', err);
        res.status(500).json({ message: 'Error tracking call start', error: err });
    }
};

// Track user joining call
exports.trackJoinCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();

    try {
        // Find active call for this group
        const call = await Call.findOneAndUpdate(
            { groupId, isActive: true },
            { $addToSet: { participants: userId } },
            { new: true }
        );

        if (!call) {
            return res.status(404).json({ message: 'No active call found in this group' });
        }

        // Optional: Notify group about user joining
        io.to(groupId).emit('user-joined-call', {
            groupId,
            userId,
            callId: call._id
        });

        res.status(200).json(call);
    } catch (err) {
        console.error('Error tracking join call:', err);
        res.status(500).json({ message: 'Error tracking join call', error: err });
    }
};

// Track user leaving call
exports.trackLeaveCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();

    try {
        // Update call by removing user from participants
        const call = await Call.findOneAndUpdate(
            { groupId, isActive: true },
            { $pull: { participants: userId } },
            { new: true }
        );

        if (!call) {
            return res.status(404).json({ message: 'No active call found in this group' });
        }

        // Check if there are no participants left
        if (call.participants.length === 0) {
            // End the call if no participants left
            await Call.findByIdAndUpdate(
                call._id,
                {
                    isActive: false,
                    endTime: new Date()
                }
            );

            // Notify group that call has ended
            io.to(groupId).emit('call-ended', {
                groupId,
                callId: call._id,
                reason: 'No participants left'
            });
        } else {
            // Notify group that user left the call
            io.to(groupId).emit('user-left-call', {
                groupId,
                userId,
                callId: call._id
            });
        }

        res.status(200).json({ message: 'Successfully tracked user leaving call' });
    } catch (err) {
        console.error('Error tracking leave call:', err);
        res.status(500).json({ message: 'Error tracking leave call', error: err });
    }
};

// Track call end
exports.trackEndCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();

    try {
        // Find and update the call record
        const call = await Call.findOneAndUpdate(
            { groupId, isActive: true },
            {
                isActive: false,
                endTime: new Date(),
                endedBy: userId
            },
            { new: true }
        );

        if (!call) {
            return res.status(404).json({ message: 'No active call found in this group' });
        }

        // Calculate call duration in seconds
        const duration = Math.round((call.endTime - call.startTime) / 1000);

        // Update the call with duration information
        call.duration = duration;
        await call.save();

        // Notify group members that call has ended
        io.to(groupId).emit('call-ended', {
            groupId,
            callId: call._id,
            endedBy: userId,
            duration: duration
        });

        res.status(200).json({
            message: 'Call ended successfully',
            callDetails: {
                id: call._id,
                duration: duration,
                participants: call.participants.length
            }
        });
    } catch (err) {
        console.error('Error tracking end call:', err);
        res.status(500).json({ message: 'Error tracking end call', error: err });
    }
};

// Get active call in a group
exports.getActiveGroupCall = async (req, res) => {
    const { groupId } = req.params;

    try {
        const call = await Call.findOne({ groupId, isActive: true })
            .populate('participants', 'firstName lastName profileImage')
            .populate('initiatorId', 'firstName lastName profileImage');

        if (!call) {
            return res.status(404).json({ message: 'No active call in this group' });
        }

        res.status(200).json(call);
    } catch (err) {
        console.error('Error getting active group call:', err);
        res.status(500).json({ message: 'Error fetching active call', error: err });
    }
};

// Get call history for a group
exports.getGroupCallHistory = async (req, res) => {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;

    try {
        const calls = await Call.find({ groupId })
            .sort({ startTime: -1 })
            .limit(limit)
            .skip(skip)
            .populate('initiatorId', 'firstName lastName')
            .populate('participants', 'firstName lastName');

        const total = await Call.countDocuments({ groupId });

        res.status(200).json({
            calls,
            pagination: {
                total,
                limit,
                skip,
                hasMore: total > skip + limit
            }
        });
    } catch (err) {
        console.error('Error getting group call history:', err);
        res.status(500).json({ message: 'Error fetching call history', error: err });
    }
};

// Get call statistics for a user
exports.getUserCallStats = async (req, res) => {
    const { userId } = req.params;

    try {
        // Count calls initiated by user
        const initiatedCount = await Call.countDocuments({ initiatorId: userId });

        // Count calls participated in
        const participatedCount = await Call.countDocuments({ participants: userId });

        // Calculate total call duration
        const calls = await Call.find({
            participants: userId,
            duration: { $exists: true }
        });

        let totalDuration = 0;
        for (const call of calls) {
            totalDuration += call.duration || 0;
        }

        // Format duration as hours, minutes, seconds
        const hours = Math.floor(totalDuration / 3600);
        const minutes = Math.floor((totalDuration % 3600) / 60);
        const seconds = totalDuration % 60;

        res.status(200).json({
            initiatedCalls: initiatedCount,
            participatedCalls: participatedCount,
            totalCallDuration: totalDuration,
            formattedDuration: `${hours}h ${minutes}m ${seconds}s`,
            averageCallDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0
        });
    } catch (err) {
        console.error('Error getting user call stats:', err);
        res.status(500).json({ message: 'Error fetching call statistics', error: err });
    }
};

// Check if user is in any active call
exports.checkUserInCall = async (req, res) => {
    const { userId } = req.params;

    try {
        const activeCall = await Call.findOne({
            participants: userId,
            isActive: true
        }).populate('groupId', 'name');

        if (!activeCall) {
            return res.status(200).json({ inCall: false });
        }

        res.status(200).json({
            inCall: true,
            callDetails: {
                callId: activeCall._id,
                groupId: activeCall.groupId._id,
                groupName: activeCall.groupId.name,
                type: activeCall.type,
                startTime: activeCall.startTime
            }
        });
    } catch (err) {
        console.error('Error checking if user is in call:', err);
        res.status(500).json({ message: 'Error checking call status', error: err });
    }
};

// Track rejected call
exports.trackRejectCall = async (req, res) => {
    const { groupId, userId } = req.body;
    const io = getIO();

    try {
        const call = await Call.findOne({ groupId, isActive: true });

        if (!call) {
            return res.status(404).json({ message: 'No active call to reject' });
        }

        // Update call record with rejection info
        if (!call.rejectedBy) call.rejectedBy = [];
        call.rejectedBy.push(userId);
        await call.save();

        // Notify group that user rejected the call
        io.to(groupId).emit('call-rejected', {
            groupId,
            userId,
            callId: call._id
        });

        res.status(200).json({ message: 'Call rejection tracked successfully' });
    } catch (err) {
        console.error('Error tracking call rejection:', err);
        res.status(500).json({ message: 'Error tracking call rejection', error: err });
    }
};