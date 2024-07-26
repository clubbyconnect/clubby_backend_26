const { Server } = require("socket.io");
const ChatSocket = require("./chat.js");
const app = require("../../app.js")

exports.setupSocket = (server)=>{

  ChatSocket(server,app);
}
