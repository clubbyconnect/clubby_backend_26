const { Server } = require("socket.io");
const chatRoom = require("../models/chatRoom.js");

function initializeChatSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'], 
    pingTimeout: 60000, 
    pingInterval: 25000 
  });

  io.on('connection', (socket) => {
  
    socket.on('joinRoom', async (roomId) => {
      socket.join(roomId);
      const room = await chatRoom.findOne({ roomId });
      if (room) socket.emit('chatHistory', room);
    });

    socket.on('sendMessage', async (data) => {
      const { roomId, text, sender } = data;
      const message = {
        text,
        sender,
        readBy: [] 
      };

      const updatedRoom = await chatRoom.findOneAndUpdate(
        { roomId },
        { $push: { messages: message } },
        { new: true, useFindAndModify: false }
      );

      io.to(roomId).emit('messageReceived', updatedRoom);
    });

    socket.on('markMessageAsRead', async (data) => {
      const { roomId, messageId, userId } = data;

      const room = await chatRoom.findOne({ roomId });
      const message = room.messages.id(messageId);

      if (message.sender.toString() !== userId) {
        await chatRoom.updateOne(
          { roomId, 'messages._id': messageId },
          { $addToSet: { 'messages.$.readBy': { userId, isRead: true, readAt: new Date() } } },
          { new: true }
        );

        const updatedRoom = await chatRoom.findOne({ roomId });
        io.to(roomId).emit('messageRead', updatedRoom);
      }
    });

    socket.on('disconnect', () => {});

  });
  return io;
}

module.exports = initializeChatSocket;
