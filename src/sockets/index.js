const { Server } = require("socket.io");
const ChatSocket = require("./chat.js");

exports.setupSocket = (server)=>{

  ChatSocket(server);
}
