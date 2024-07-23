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

    socket.on('markMessageAsRead', ({ roomId, messageId }) => {
      // Find the message
      Message.findById(messageId, (err, message) => {
        if (err || !message) return;
  
        // Update readBy for all users in the group (assuming groupUsers is an array of user IDs)
        const groupUsers = getGroupUsers(roomId); // Implement this based on your app logic
  
        groupUsers.forEach(user => {
          if (!message.readBy.some(read => read.userId === user)) {
            message.readBy.push({ userId: user, readAt: new Date() });
          }
        });
  
        message.save().then(() => {
          io.to(roomId).emit('messageRead', { messageId, userId: socket.userId });
        });
      });
    });
    
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
}

module.exports = initializeChatSocket;
