const { Server } = require("socket.io");
const ChatRoom = require("../models/chatRoom.js");

function initializeChatSocket(server) {
  const io = new Server(server);
  const userSocketMap = {};

  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("joinRoom", async (roomId) => {
      try {
        socket.join(roomId);
        console.log(`User joined room ${roomId}`);

        const groupChat = await ChatRoom.findOne({ roomId }).populate("messages.sender", "name").populate("messages.readBy.userId", "name");
        if (groupChat) {
          socket.emit("loadChatHistory", groupChat.messages);
        }
      } catch (error) {
        console.error("Error joining room:", error);
      }
    });

    socket.on("sendMessage", async ({ roomId, senderId, text }) => {
      try {
        const groupChat = await ChatRoom.findOne({ roomId });
        if (groupChat) {
          const newMessage = {
            text,
            sender: senderId,
            readBy: [{ userId: senderId, readAt: new Date() }]
          };

          groupChat.messages.push(newMessage);
          await groupChat.save();

          io.to(roomId).emit("newMessage", newMessage);
        }
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });

    socket.on('markMessageAsRead', async ({ roomId, messageId, userId }) => {
      try {
        const groupChat = await ChatRoom.findOne({ roomId });
        if (groupChat) {
          const message = groupChat.messages.id(messageId);
          if (message) {
            const alreadyRead = message.readBy.some(read => read.userId.toString() === userId);
            if (!alreadyRead) {
              message.readBy.push({ userId, readAt: new Date() });
              await groupChat.save();

              io.to(roomId).emit('messageRead', { messageId, userId });
            }
          }
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
}

module.exports = initializeChatSocket;
