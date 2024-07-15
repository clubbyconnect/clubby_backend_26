const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const chatSchema = new Schema(
  {
    participants: [{
      type: Schema.Types.ObjectId,
      ref: 'User', 
    }],
    messages: [{
      sender: {
        type: Schema.Types.ObjectId,
        ref: 'User',  
        required: true,
      },
      text: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    }],
  },
  {
    timestamps: true,
  }
);

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;

