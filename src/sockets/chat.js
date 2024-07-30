const { Server } = require("socket.io");
const ChatRoom = require("../models/chatRoom.js");

  //events in controller
  //-->> 'userRemoved', { roomId, userId }

function ChatSocket(server , app) {

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'], 
    pingTimeout: 60000, 
    pingInterval: 25000 
  });
  app.set('io', io)
  
  //------------------------------ChatEvents---------------------------------------------
  io.on('connection', (socket) => {

    //text chat
  
    socket.on('joinRoom', async (roomId) => {
      socket.join(roomId);
      const room = await ChatRoom.findOne({ roomId });
      if (room) socket.emit('chatHistory', room);
    });

    socket.on('sendMessage', async (data) => {
      const { roomId, text, sender } = data;
      const message = {
        text,
        sender,
        readBy: [] 
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

    // Audio call
    socket.on('joinRoom', (roomId) => {
      socket.join(roomId);
      console.log(`User joined room: ${roomId}`);
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

    //disconnect
    socket.on('disconnect', () => {});
  });
  return io;
}

module.exports = ChatSocket;
