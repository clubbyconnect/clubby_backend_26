
const socketIO = require("socket.io");
const { Server } = require("socket.io");
const { sendPushNotification } = require('../utils/Firebase.js');
const Call = require('../models/Call.js');
const { listenerCount } = require("../models/Message.js");

let io;
const activeCalls = new Map(); // Stores userId -> callID
const callGroups = new Map();  // Stores callID -> [users]


// Keep track of active calls and their participants
const activeCallRooms = new Map();

const initializeSockets = (server) => {

  io = require('socket.io')(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on('start-call', async ({ groupId, type }) => {
      try {
        console.log('Call is started socket is receive here ')
        let existingCall = await Call.findOne({ groupId, isActive: true });
        // console.log(' existingCall  ', existingCall)
        // if (existingCall) {
        //   return socket.emit('call-error', { message: 'A call is already active in this group.' });
        // }
        if (!existingCall) {
          const call = new Call({ groupId, type });
          console.log(' call  ', call)

          await call.save();
          existingCall = call;

        }

        // console.log('1- groupId, type  ', groupId, type)

        // Notify group members
        io.to(groupId).emit('call-started', { groupId, type, existingCall });

        // Auto-end if no one joins within 15 sec
        // setTimeout(async () => {
        //   const checkCall = await Call.findById(call._id);
        //   if (checkCall && checkCall.participants.length === 0) {
        //     await Call.findByIdAndDelete(call._id);
        //     io.to(groupId).emit('call-ended', { message: 'Call ended due to inactivity.' });
        //   }
        // }, 30000);
      } catch (err) {
        console.error('Error starting call:', err);
      }
    });

    // Join a call
    socket.on('join-call', async ({ groupId, userId }) => {
      const userInCall = await Call.findOne({ participants: userId });

      if (userInCall) {
        await Call.findByIdAndUpdate(userInCall._id, { $pull: { participants: userId } });
        if (userInCall.participants.length === 1) {
          await Call.findByIdAndDelete(userInCall._id);
          io.to(userInCall.groupId.toString()).emit('call-ended', { message: 'Call ended as last user left.' });
        }
      }

      const call = await Call.findOneAndUpdate(
        { groupId, isActive: true },
        { $addToSet: { participants: userId } },
        { new: true }
      );

      if (call) io.to(groupId).emit('user-joined', { groupId, userId });
    });

    // Leave a call
    socket.on('leave-call', async ({ groupId, userId }) => {
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
    });




    // Join a group room
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

    socket.on("sendMessage", (data, callback) => {
      const { groupId, content, fcmTokens } = data.result;
      console.log('New message to group  ', groupId, ' is ', data.result)
      io.to(groupId).emit("newMessage", data.result);
      console.log(' after io in send message....');

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


    // Handle vote completion
    socket.on("voteCompleted", (data) => {
      const { groupId, status, userId, fcmTokens } = data;

      // Broadcast the final voting result
      io.to(groupId).emit("voteCompleted", { status, userId });
      console.log(`Voting completed in group ${groupId}: ${status}`);
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log('Dis connect reason is ', reason)
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
    console.log('✅ Socket.io initialized');
    return io;

  });
};

// Function to get the Socket.IO instance
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initializeSockets, getIO, io };
