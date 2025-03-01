
const socketIO = require("socket.io");
const { Server } = require("socket.io");
const { sendSystemMessage } = require("../controllers/user.controller.js");
const { sendPushNotification } = require('../controllers/data.controller.js');

let io;

// Keep track of active calls and their participants
const activeCallRooms = new Map();

const initializeSockets = (server) => {
  io = socketIO(server, {
    cors: {
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Handle call request (both voice and video)
    socket.on("initiateCall", async (data) => {
      const { groupId, callType, initiator, fcmTokens } = data;
      console.log('Active call in initiateCall ', activeCallRooms)


      if (activeCallRooms.has(groupId)) {
        socket.emit("callError", {
          message: "There's already an active call in this group"
        });
        return;
      }

      activeCallRooms.set(groupId, {
        type: callType,
        participants: new Set([{
          socketId: socket.id,
          userId: initiator.userId,
          userName: initiator.userName
        }]),
        callState: 'ringing',
        initiator: initiator
      });

      // Notify all group members about incoming call
      socket.to(groupId).emit("incomingCall", {
        groupId,
        callType,
        initiator
      });

      // Send push notifications to FCM tokens
      if (fcmTokens && fcmTokens.length > 0) {
        const title = `Incoming ${callType === "video" ? "Video" : "Voice"} Call`;
        const message = `${initiator.userName} is calling you in group ${groupId}`;

        for (const token of fcmTokens) {
          try {

            await sendPushNotification(
              {
                body: { token, message, title },
              },
              {
                status: () => ({ json: () => { } }),
              }
            );
          } catch (error) {
            console.error(`Failed to send notification to token: ${token}`, error);
          }
        }
      } else {
        console.log("No FCM tokens provided for push notifications.");
      }

      setTimeout(() => {
        const callRoom = activeCallRooms.get(groupId);
        if (callRoom && callRoom.callState === 'ringing') {
          io.to(groupId).emit("callEnded", {
            groupId,
            reason: "no_answer"
          });
          activeCallRooms.delete(groupId);
        }
      }, 50000);
    });

    // Handle call acceptance
    socket.on("acceptCall", (data) => {
      console.log("Server received acceptCall with data:", data);

      const { groupId, userId, userName, fcmTokens } = data;
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

      socket.to(groupId).emit("participantJoined", {
        data
      });

      socket.emit("existingParticipants", {
        participants: Array.from(callRoom.participants)
          .filter(p => p.socketId !== socket.id)
      });
    });

    socket.on("rejectCall", (data) => {
      const { groupId, userId, userName, fcmTokens } = data;

      socket.to(groupId).emit("callRejected", {
        groupId,
        userId,
        userName
      });
    });

    // Handle WebRTC signaling
    socket.on("offer", (data) => {
      const { to, from, offer, fcmTokens } = data;
      socket.to(to).emit("offer", {
        from: from,
        offer: offer
      });
    });

    socket.on("answer", (data) => {
      const { to, from, answer, fcmTokens } = data;
      socket.to(to).emit("answer", {
        from: from,
        answer: answer
      });
    });

    socket.on("iceCandidate", (data) => {
      const { to, candidate, fcmTokens } = data;
      socket.to(to).emit("iceCandidate", {
        from: socket.id,
        candidate: candidate
      });
    });

    // Handle call end
    socket.on("endCall", (data) => {
      const { groupId, fcmTokens } = data;
      console.log('Ending the call for group:', groupId);

      if (activeCallRooms.has(groupId)) {
        io.to(groupId).emit("callEnded", { groupId, reason: "ended_by_participant" });
        activeCallRooms.delete(groupId);

        // Notify via push notification
        if (fcmTokens && fcmTokens.length > 0) {
          const title = "Call Ended";
          const message = `The call in group ${groupId} has ended.`;

          fcmTokens.forEach(token => {
            sendPushNotification({ body: { token, title, message } }, { status: () => ({ json: () => { } }) });
          });
        }
      }
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
      const { groupId, adminId, fcmTokens } = data;
      const group = await Group.findById(groupId);

      if (!group) return;

      if (group.adminId.equals(adminId)) {
        group.isActive = false;
        await group.save();

        io.to(groupId).emit("groupDeactivated", { groupId });

        // Notify via push notification
        if (fcmTokens && fcmTokens.length > 0) {
          const title = "Group Deactivated";
          const message = `Group ${groupId} has been deactivated by the admin.`;

          fcmTokens.forEach(token => {
            sendPushNotification({ body: { token, title, message } }, { status: () => ({ json: () => { } }) });
          });
        }
      }
    });

    // Handle sending a message in the group
    socket.on("sendMessage", (data, callback) => {
      const { groupId, content, fcmTokens } = data.result;
      io.to(groupId).emit("newMessage", data.result);

      // Notify via push notification
      if (fcmTokens && fcmTokens.length > 0) {
        const title = "New Message";
        const message = `You have a new message in group ${groupId}: "${content}"`;

        fcmTokens.forEach(token => {
          sendPushNotification({ body: { token, title, message } }, { status: () => ({ json: () => { } }) });
        });
      }

      callback({ status: content });
    });


    // Handle marking a message as read
    socket.on("markMessageAsRead", async (data) => {
      const { messageId, userId, fcmTokens } = data;
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
      const { groupId, content, fcmTokens } = data;

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
      const { groupId, voterId, vote, fcmTokens } = data;

      // Find the ongoing voting process
      const voting = await Voting.findOne({ groupId, status: "ongoing" });

      if (!voting) {
        return;
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
      const { groupId, status, userId, fcmTokens } = data;

      // Broadcast the final voting result
      io.to(groupId).emit("voteCompleted", { status, userId });
      console.log(`Voting completed in group ${groupId}: ${status}`);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      for (let [groupId, callRoom] of activeCallRooms) {
        for (let participant of callRoom.participants) {
          if (participant.socketId === socket.id) {
            callRoom.participants.delete(participant);
            io.to(groupId).emit("participantLeft", { groupId, participant });

            if (callRoom.participants.size === 0) {
              activeCallRooms.delete(groupId);
            }

            // Notify remaining participants
            if (callRoom.participants.size > 0) {
              const title = "Participant Left";
              const message = `${participant.userName} left the call in group ${groupId}`;

              callRoom.participants.forEach(p => {
                sendPushNotification({ body: { token: p.fcmToken, title, message } }, { status: () => ({ json: () => { } }) });
              });
            }
            break;
          }
        }
      }
    });

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
