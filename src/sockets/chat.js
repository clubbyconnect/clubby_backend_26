const { Server } = require("socket.io");
const ChatRoom = require("../models/chatRoom.js");

function ChatSocket(server, app) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'], 
    pingTimeout: 60000, 
    pingInterval: 25000 
  });
  app.set('io', io);
  
  io.on('connection', (socket) => {

    // Text chat
    socket.on('join-Room-For-text-Mssg', async (roomId) => {
      socket.join(roomId);
      const room = await ChatRoom.findOne({ roomId });
      if (room) socket.emit('chatHistory', room);
    });

    socket.on('sendMessage', async (data) => {
      const { roomId, text, sender } = data;
      const message = {
        text,
        sender,
        readBy: [],
        type: 'text'
      };

      const updatedRoom = await ChatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('messageReceived', updatedRoom);
    });

    socket.on('markMessageAsRead', async (data) => {
      const { roomId, messageId, userId } = data;

      const room = await ChatRoom.findOne({ roomId });
      const message = room.messages.id(messageId);

      if (message.sender.toString() !== userId) {
        await ChatRoom.updateOne(
          { roomId, 'messages._id': messageId },
          { $addToSet: { 'messages.$.readBy': { userId, isRead: true, readAt: new Date() } } },
          { new: true }
        );

        const updatedRoom = await ChatRoom.findOne({ roomId });
        io.to(roomId).emit('messageRead', updatedRoom);
      }
    });

    // Audio Call & Video Call
    socket.on('join-Room-For-MediaCall', (roomId) => {
      socket.join(roomId);
    });

    socket.on('offer', (offer, roomId) => {
      socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', (answer, roomId) => {
      socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', (candidate, roomId) => {
      socket.to(roomId).emit('ice-candidate', candidate);
    });

    // Call Logs
    socket.on('startCall', async (data) => {
      const { roomId, sender, callType } = data;
      const message = {
        text: `${callType} call started`,
        sender,
        readBy: [],
        type: callType === 'audio' ? 'audio-call' : 'video-call'
      };

      const updatedRoom = await ChatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('callStarted', updatedRoom);
    });

    socket.on('endCall', async (data) => {
      const { roomId, sender, callType } = data;
      const message = {
        text: `${callType} call ended`,
        sender,
        readBy: [],
        type: callType === 'audio' ? 'audio-call' : 'video-call'
      };

      const updatedRoom = await ChatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('callEnded', updatedRoom);
    });

    // System Messages
    socket.on('userJoined', async (data) => {
      const { roomId, userId, userName } = data;
      const message = {
        text: `${userName} has joined the group`,
        sender: userId,
        readBy: [],
        type: 'system'
      };

      const updatedRoom = await ChatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('userJoined', updatedRoom);
    });

    socket.on('userLeft', async (data) => {
      const { roomId, userId, userName } = data;
      const message = {
        text: `${userName} has left the group`,
        sender: userId,
        readBy: [],
        type: 'system'
      };

      const updatedRoom = await ChatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('userLeft', updatedRoom);
    });

    // Disconnect
    socket.on('disconnect', () => {});
  });
  return io;
}

module.exports = ChatSocket;
