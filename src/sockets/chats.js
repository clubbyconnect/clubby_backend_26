
const socketIO = require("socket.io");
const { Server } = require("socket.io");
const { sendSystemMessage } = require("../controllers/user.controller.js");

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
    socket.on("initiateCall", (data) => {
      const { groupId, callType, initiator } = data;
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

      socket.to(groupId).emit("participantJoined", {
        data
      });

      socket.emit("existingParticipants", {
        participants: Array.from(callRoom.participants)
          .filter(p => p.socketId !== socket.id)
      });
    });

    socket.on("rejectCall", (data) => {
      const { groupId, userId, userName } = data;

      socket.to(groupId).emit("callRejected", {
        groupId,
        userId,
        userName
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

    socket.on("iceCandidate", (data) => {
      const { to, candidate } = data;
      socket.to(to).emit("iceCandidate", {
        from: socket.id,
        candidate: candidate
      });
    });

    // Handle call end
    socket.on("endCall", (data) => {
      const { groupId } = data;
      console.log('removing the active call')

      if (activeCallRooms.has(groupId)) {
        io.to(groupId).emit("callEnded", {
          groupId,
          reason: "ended_by_participant"
        });
        console.log('Active call before ', activeCallRooms)
        activeCallRooms.delete(groupId);
        console.log('Active call after ', activeCallRooms)

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
      const { groupId, adminId } = data;

      const group = await Group.findById(groupId);
      if (!group) {
        return;
      }

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
      const { groupId, status, userId } = data;

      // Broadcast the final voting result
      io.to(groupId).emit("voteCompleted", { status, userId });
      console.log(`Voting completed in group ${groupId}: ${status}`);
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

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

// Function to get the Socket.IO instance
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initializeSockets, getIO };
