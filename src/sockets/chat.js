const { Server } = require("socket.io");
const chatRoom = require("../models/chatRoom.js");

function initializeChatSocket(server) {
  const io = new Server(server);

  io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('joinRoom', async (roomId) => {
    socket.join(roomId);
    console.log(`User joined room ${roomId}`);
  });

  socket.on('sendMessage', async (data) => {
    const { roomId, text, sender } = data;
    const message = {
      text,
      sender,
      readBy: [] // Initialize without adding the sender
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

    // Only add the user to readBy if they are not the sender
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

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});
 

  return io;
}

module.exports = initializeChatSocket;
