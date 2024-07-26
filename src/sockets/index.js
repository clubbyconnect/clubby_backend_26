const { Server } = require("socket.io");
const initializeChatSocket = require("./chat.js");
const app = require("../../app.js")

exports.setupSocket = (server)=>{

  initializeChatSocket(server,app);
}
