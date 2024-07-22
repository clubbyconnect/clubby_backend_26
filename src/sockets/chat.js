const { Server } = require("socket.io");
const { chatRoom } = require("../models/chatRoom.js");

function initializeChatSocket(server) {
  const io = new Server(server);
  const userSocketMap = {};

  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("joinRoom", async (roomId) => {
      try {
        socket.join(roomId);
        console.log(`User joined room ${roomId}`);

        const groupChat = await chatRoom.findById(roomId).populate("messages.sender", "name");
        if (groupChat) socket.emit("loadChatHistory", groupChat.messages);
      } catch (error) {
        console.error("Error joining room:", error);
      }
    });

    socket.on("sendMessage", async (message) => {
      try {
        const { roomId, senderId, text, receivers } = message;
        console.log(roomId, senderId, text, receivers);

        const groupChat = await chatRoom.findOne({ roomId });
        console.log("groupChat:", groupChat);

        if (groupChat) {
          const newMessage = {
            text,
            sender: senderId,
            receivers: receivers.map((receiverId) => ({
              receiver: receiverId,
              isRead: false,
            })),
          };
          groupChat.messages.push(newMessage);
          await groupChat.save();

          io.to(roomId).emit("receiveMessage", newMessage);
        }
      } catch (error) {
        console.error("Error sending message:", error);
      }
    });

    socket.on('markAsRead', async ({ roomId, messageId, receiverId }) => {
      try {
        const groupChat = await chatRoom.findById(roomId);
        if (groupChat) {
          const message = groupChat.messages.id(messageId);
          if (message) {
            const receiver = message.receivers.find(r => r.receiver.toString() === receiverId);
            if (receiver) {
              receiver.isRead = true;
              await groupChat.save();

              io.to(roomId).emit('messageRead', { messageId, receiverId });
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
