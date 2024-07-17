const { Server } = require("socket.io");
const Chat = require("../models/chat.js");

function initializeChatSocket(server) {
  const io = new Server(server);
  const userSocketMap = {};

  io.on("connection", (socket) => {
    console.log("A user connected");

  });

  return io;
}

module.exports = initializeChatSocket;
