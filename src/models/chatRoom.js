const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  groupName: {
    type: String,
    required: true,
  },
  members: [{
    type: String,
    required: true,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatRoom = mongoose.model("chatRoom", chatRoomSchema);

module.exports = chatRoom;
