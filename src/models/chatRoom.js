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
  receivers: [{
    receiver: {
      type: mongoose.Schema.Types.ObjectId,  
      ref: 'user',
    },
    isRead: {
      type: Boolean,
      default: false,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatRoom = mongoose.model('chatRoom', chatRoomSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { chatRoom, Message };
