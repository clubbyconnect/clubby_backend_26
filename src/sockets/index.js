// const { Server } = require("socket.io");
// const ChatSocket = require("./chat.js");
// const app = require("../../app.js")

// exports.setupSocket = (server)=>{

//   ChatSocket(server,app);
// }


const { initializeSockets } = require("./chats.js");

exports.setupSocket = (server) => {
  initializeSockets(server); // Only pass the server, no need for 'app'
};