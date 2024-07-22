const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'chatRoom',
    required: true,
  },
  receivers: [{
    receiver: {
      type: mongoose.Schema.Types.ObjectId,  
      ref: 'User',
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  }],
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;


