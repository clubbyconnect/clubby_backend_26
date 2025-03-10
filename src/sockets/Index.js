
const { initializeSockets } = require("./Chat.js");

exports.setupSocket = (server) => {
  initializeSockets(server);
};
