const initializeChatSocket = require("../sockets/chat.js")


const handleChatMessage = async (req, res,) => {

  const { message } = req.body;
  io.emit("chat message", message);
  
};

module.exports = { handleChatMessage };
