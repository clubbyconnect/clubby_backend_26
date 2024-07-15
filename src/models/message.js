const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    message: {
      text: String,
    },
    member: [{
      sender: {
        type: String,
      },
      receivers: [{
        receiverId: {
          type: String,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
      }],
    }],
    sender: {
      type: String,
    },
    roomId: {
      type: String,
    },
    groupName: {
      type: String,
    },
    isArchived: {
      type: Array,
    },
  }, { timestamps: true });
  
  const Message = mongoose.model('Message', messageSchema);