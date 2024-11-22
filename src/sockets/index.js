
const { initializeSockets } = require("./chats.js");

exports.setupSocket = (server) => {
  initializeSockets(server); 
};