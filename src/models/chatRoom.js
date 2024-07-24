const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  }],
}, { timestamps: true });

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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  }],
  messages: [messageSchema],
}, { timestamps: true });

const chatRoom = mongoose.model('chatRoom', chatRoomSchema);
module.exports = chatRoom;
