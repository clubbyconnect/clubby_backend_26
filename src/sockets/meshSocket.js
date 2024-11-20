const socketIO = require("socket.io");
const { Server } = require("socket.io");
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream } = require('wrtc');
const { sendSystemMessage } = require("../controllers/user.controller.js");

let io;
// Keep track of active calls and their participants
const activeCallRooms = new Map(); // groupId -> { type: 'voice'|'video', participants: Set, callState: 'ringing'|'ongoing' }
const userConnections = new Map(); // socketId -> RTCPeerConnection
const sfuConnections = new Map(); // groupId -> Map<socketId, RTCPeerConnection>
const activeStreams = new Map(); // groupId -> Map<socketId, MediaStream>

const initializeSockets = (server) => {
    io = socketIO(server, {
        cors: {
            methods: ["GET", "POST"]
        }
    });

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    io.on("connection", (socket) => {
        console.log("New client connected:", socket.id);

        socket.on("joinSFU", async (data) => {
            try {
                const { groupId, userId, userName } = data;
                console.log(`User ${userName} joining SFU for group ${groupId}`);

                const peerConnection = new RTCPeerConnection(rtcConfig);
                userConnections.set(socket.id, peerConnection);

                // Add audio transceiver with explicit direction
                const audioTransceiver = peerConnection.addTransceiver('audio', {
                    direction: 'sendrecv',
                    streams: []
                });

                // Create offer with specific audio constraints
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    voiceActivityDetection: true
                });

                await peerConnection.setLocalDescription(offer);
                socket.emit("sfuOffer", { offer });

                // Handle incoming audio tracks
                peerConnection.ontrack = (event) => {
                    if (event.track.kind === 'audio') {

                        // Create a new MediaStream for the audio
                        const audioStream = new MediaStream([event.track]);
                        console.log(`Received audio track from ${userName} and audio is ${audioStream}`);

                        // Forward audio to other participants
                        forwardAudioToParticipants(groupId, socket.id, audioStream);
                    }
                };

            } catch (error) {
                console.error("Error in SFU setup:", error);
                socket.emit("sfuError", { error: error.message });
            }
        });

        // Handle call initiation
        socket.on("initiateCall", async ({ groupId, callType, initiator }) => {
            if (!sfuConnections.has(groupId)) {
                sfuConnections.set(groupId, new Map());
                activeStreams.set(groupId, new Map());
            }
            socket.join(groupId);
            socket.to(groupId).emit("incomingCall", { groupId, callType, initiator });
        });


        socket.on("joinCallRoom", async ({ groupId, userId, userName }) => {
            try {
                socket.join(groupId);
                const pc = new RTCPeerConnection({
                    ...rtcConfig,
                    iceServers: [
                        {
                            urls: [
                                'stun:stun1.l.google.com:19302',
                                'stun:stun2.l.google.com:19302'
                            ]
                        }
                    ]
                });

                sfuConnections.get(groupId).set(socket.id, pc);

                const transceiver = pc.addTransceiver('audio', {
                    direction: 'sendrecv',
                    streams: []
                });

                pc.onicecandidate = ({ candidate }) => {
                    if (candidate) {
                        socket.emit("iceCandidate", {
                            candidate: {
                                candidate: candidate.candidate,
                                sdpMid: candidate.sdpMid,
                                sdpMLineIndex: candidate.sdpMLineIndex
                            }
                        });
                    }
                };

                pc.ontrack = ({ track, streams }) => {
                    console.log('Server received track:', {
                        socketId: socket.id,
                        kind: track.kind,
                        id: track.id
                    });

                    const audioStream = new MediaStream([track]);
                    activeStreams.get(groupId).set(socket.id, streams);
                    console.log('audioStream ', audioStream, ' OR streams ', streams)
                    // Forward to other participants
                    sfuConnections.get(groupId).forEach((otherPc, otherSocketId) => {
                        if (otherSocketId !== socket.id) {
                            const senderTrack = streams.getTracks()[0];
                            otherPc.addTrack(senderTrack, streams);
                        }
                    });
                };

                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit("sfuOffer", { offer });

            } catch (error) {
                console.error("Error in joinCallRoom:", error);
                socket.emit("callError", { message: error.message });
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        socket.on("sfuAnswer", async ({ groupId, answer }) => {
            try {
                const pc = sfuConnections.get(groupId)?.get(socket.id);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                }
            } catch (error) {
                console.error("Error setting remote description:", error);
            }
        });

        socket.on("iceCandidate", async ({ groupId, candidate }) => {
            const pc = sfuConnections.get(groupId)?.get(socket.id);
            if (pc) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            }
        });


        // Handle disconnection
        socket.on("disconnect", () => {
            for (const [groupId] of sfuConnections) {
                if (sfuConnections.get(groupId).has(socket.id)) {
                    cleanup(groupId, socket.id);
                    socket.to(groupId).emit("participantLeft", { socketId: socket.id });
                }
            }
        });

        // Handle call end
        socket.on("endCall", ({ groupId }) => {
            if (activeCallRooms.has(groupId)) {
                io.to(groupId).emit("callEnded", { groupId, reason: "ended_by_participant" });
                cleanupCall(groupId);
            }
        });

        // Handle call rejection
        socket.on("rejectCall", (data) => {
            const { groupId, userId, userName } = data;

            socket.to(groupId).emit("callRejected", {
                groupId,
                userId,
                userName
            });
        });

        // Handle call acceptance
        socket.on("acceptCall", (data) => {
            console.log("Server received acceptCall with data:", data);

            const { groupId, userId, userName } = data;
            const callRoom = activeCallRooms.get(groupId);

            if (!callRoom) {
                socket.emit("callError", {
                    message: "Call no longer exists"
                });
                return;
            }

            const participant = {
                socketId: socket.id,
                userId,
                userName
            };

            callRoom.participants.add(participant);

            if (callRoom.callState === 'ringing') {
                callRoom.callState = 'ongoing';
            }

            // Notify all participants about the new joiner
            socket.to(groupId).emit("participantJoined", {
                data
            });

            // Send existing participants to the new joiner
            socket.emit("existingParticipants", {
                participants: Array.from(callRoom.participants)
                    .filter(p => p.socketId !== socket.id)
            });
        });

        // Handle WebRTC signaling
        socket.on("offer", (data) => {
            const { to, from, offer } = data;
            socket.to(to).emit("offer", {
                from: from,
                offer: offer
            });
        });

        socket.on("answer", (data) => {
            const { to, from, answer } = data;
            socket.to(to).emit("answer", {
                from: from,
                answer: answer
            });
        });

        // Join a group room
        // Join group for chat and here there will be a option to call video/voice both
        socket.on("joinGroup", (groupId) => {
            socket.join(groupId);
            console.log(`Socket ${socket.id} joined group ${groupId}`);
            io.to(groupId).emit("memberJoined", { userId: socket.id });
        });

        // Handle group deactivation
        socket.on("deactivateGroup", async (data) => {
            const { groupId, adminId } = data;

            const group = await Group.findById(groupId);
            if (!group) {
                return;
            }

            // Check if the user is the admin
            if (group.adminId.equals(adminId)) {
                group.isActive = false;
                await group.save();

                // Notify all members that the group is deactivated
                io.to(groupId).emit("groupDeactivated", { groupId });
            }
        });

        // Handle sending a message in the group
        socket.on("sendMessage", (data, callback) => {
            console.log("Received sendMessage event:", data);
            const { groupId, content } = data.result;
            data.result.senderId = { _id: data.result.senderId }
            console.log("Emitting to group:", groupId, "Message:", content, 'data is', data);
            io.to(groupId).emit("newMessage", data.result);

            callback({ status: content });
        });

        // Handle marking a message as read
        socket.on("markMessageAsRead", async (data) => {
            const { messageId, userId } = data;
            try {
                const message = await Message.findById(messageId);
                if (message && !message.readBy.some(read => read.userId.equals(userId))) {
                    message.readBy.push({ userId, readAt: new Date() });
                    await message.save();

                    // Broadcast to all clients in the group
                    io.to(message.groupId.toString()).emit("messageRead", { messageId, userId });
                }
            } catch (error) {
                console.error("Error marking message as read:", error);
            }
        });

        // Handle sending a system-generated message
        socket.on("sendSystemMessage", async (data) => {
            console.log('I m in the system message...')
            const { groupId, content } = data;

            // // // Call the controller function to save the message
            // // await sendSystemMessage(groupId, content);

            // // Construct the system message
            // const systemMessage = {
            //   content,
            //   type: "system", // Indicate it's a system message
            //   timestamp: new Date(),
            // };

            // Emit the system message to everyone in the group
            io.to(groupId).emit("newMessage", data);
            console.log(`System message sent to group ${groupId}:`, content);
        });


        // Leave group (no voting)
        socket.on("leaveGroup", (groupId) => {
            socket.leave(groupId);
            console.log(`Socket ${socket.id} left group ${groupId}`);
            io.to(groupId).emit("memberLeft", { userId: socket.id });
        });

        // Currently no need of voting
        // Handle voting
        socket.on("vote", async (data) => {
            const { groupId, voterId, vote } = data;

            // Find the ongoing voting process
            const voting = await Voting.findOne({ groupId, status: "ongoing" });

            if (!voting) {
                return; // No ongoing voting found
            }

            // Register the vote
            voting.votes[voterId] = vote;
            await voting.save();

            // Emit the vote update to the group
            io.to(groupId).emit("voteUpdate", { voterId, vote });

            // Check if all members have voted
            const group = await Group.findById(groupId);
            const allMembersVoted = group.members.every((member) => voting.votes[member]);

            if (allMembersVoted) {
                const allVotesAreYes = Object.values(voting.votes).every((vote) => vote === "yes");

                if (allVotesAreYes) {
                    // If all votes are 'yes', remove the user from the group
                    group.members = group.members.filter((member) => member !== voting.userId);
                    await group.save();

                    voting.status = "completed";
                    await voting.save();

                    // Notify the group that the user has left
                    io.to(groupId).emit("voteCompleted", { status: "success", userId: voting.userId });
                    await sendSystemMessage(group._id, `${voting.userId} has left the group after a successful vote.`);
                } else {
                    // If any vote is 'no', deny the request to leave
                    voting.status = "denied";
                    await voting.save();

                    // Notify the group that the request was denied
                    io.to(groupId).emit("voteCompleted", { status: "denied", userId: voting.userId });
                    await sendSystemMessage(group._id, `${voting.userId}'s request to leave was denied.`);
                }
            }
        });

        // Handle vote completion
        socket.on("voteCompleted", (data) => {
            const { groupId, status, userId } = data;

            // Broadcast the final voting result
            io.to(groupId).emit("voteCompleted", { status, userId });
            console.log(`Voting completed in group ${groupId}: ${status}`);
        });

        // Handle disconnect
        socket.on("disconnect", () => {
            console.log("Client disconnected:", socket.id);
            cleanupUserConnection(socket.id);

            // Check if user was in any active calls
            for (let [groupId, callRoom] of activeCallRooms) {
                for (let participant of callRoom.participants) {
                    if (participant.socketId === socket.id) {
                        callRoom.participants.delete(participant);

                        // Notify others in the call
                        socket.to(groupId).emit("participantLeft", {
                            groupId,
                            participant
                        });

                        // If no participants left, end the call
                        if (callRoom.participants.size === 0) {
                            activeCallRooms.delete(groupId);
                        }
                        break;
                    }
                }
            }

        });
    });
};

// Helper function to cleanup call resources
const cleanupCall = (groupId) => {
    console.log(`Cleaning up call in group ${groupId}`);
    const callRoom = activeCallRooms.get(groupId);
    if (callRoom) {
        callRoom.participants.forEach(participant => {
            cleanupUserConnection(participant.socketId);
        });
        activeCallRooms.delete(groupId);
    }
};

const cleanup = (groupId, socketId) => {
    const pc = sfuConnections.get(groupId)?.get(socketId);
    if (pc) {
        pc.close();
        sfuConnections.get(groupId).delete(socketId);
    }
    activeStreams.get(groupId)?.delete(socketId);

    // Remove empty groups
    if (sfuConnections.get(groupId)?.size === 0) {
        sfuConnections.delete(groupId);
        activeStreams.delete(groupId);
    }
};

// Helper function to cleanup user connection
const cleanupUserConnection = (socketId) => {
    console.log(`Cleaning up connection for ${socketId}`);
    const peerConnection = userConnections.get(socketId);
    if (peerConnection) {
        peerConnection.close();
        userConnections.delete(socketId);
    }

    // Remove user from any active call rooms
    activeCallRooms.forEach((room, groupId) => {
        room.participants.forEach(participant => {
            if (participant.socketId === socketId) {
                room.participants.delete(participant);
                room.streams.delete(socketId);

                // If room is empty, remove it
                if (room.participants.size === 0) {
                    cleanupCall(groupId);
                }
            }
        });
    });
};

// Helper function to forward audio to participants
const forwardAudioToParticipants = (groupId, senderId, audioStream) => {
    const room = activeCallRooms.get(groupId);
    if (!room) return;

    room.participants.forEach(participant => {
        if (participant.socketId !== senderId) {
            const receiverConnection = userConnections.get(participant.socketId);
            if (receiverConnection) {
                audioStream.getAudioTracks().forEach(track => {
                    receiverConnection.addTrack(track, audioStream);
                });
            }
        }
    });
};

// Function to get the Socket.IO instance
const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { initializeSockets, getIO };
